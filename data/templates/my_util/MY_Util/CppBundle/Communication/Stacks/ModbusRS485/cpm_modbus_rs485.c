#include "cpm_modbus_rs485.h"
#include <string.h>

void CpmModbusRs485_Init(CpmModbusRs485 *client, CpmRs485 *bus, uint8_t slave, int timeoutMs)
{
    if (!client) return;
    client->bus = bus;
    client->slave = slave;
    client->timeoutMs = timeoutMs;
}

static int CpmModbusRs485_Transaction(CpmModbusRs485 *client,
                                      const uint8_t *request,
                                      size_t requestSize,
                                      uint8_t *response,
                                      size_t responseCapacity,
                                      size_t *responseSize)
{
    size_t remaining;
    int rc;
    if (responseSize) *responseSize = 0;
    if (!client || !client->bus || !request || !requestSize || !response || responseCapacity < 5 || !responseSize) return -1;
    rc = CpmRs485_Write(client->bus, request, requestSize);
    if (rc < 0) return rc;
    rc = CpmRs485_ReadExact(client->bus, response, 3, client->timeoutMs);
    if (rc != 3) return rc < 0 ? rc : -10;

    if ((response[1] & 0x80u) != 0)
        remaining = 2; /* exception code already in byte 2 + CRC */
    else if (response[1] >= CPM_MODBUS_FC_READ_COILS && response[1] <= CPM_MODBUS_FC_READ_INPUT_REGISTERS)
        remaining = (size_t)response[2] + 2u; /* data + CRC */
    else
        remaining = 5; /* write responses are 8 bytes total */

    if (3u + remaining > responseCapacity) return -11;
    rc = CpmRs485_ReadExact(client->bus, response + 3, remaining, client->timeoutMs);
    if (rc != (int)remaining) return rc < 0 ? rc : -12;
    *responseSize = 3u + remaining;
    return 0;
}

static int CpmModbusRs485_ReadRegisters(CpmModbusRs485 *client, uint8_t function,
                                        uint16_t address, uint16_t quantity,
                                        uint16_t *values, size_t capacity, size_t *valueCount)
{
    uint8_t request[8], response[260];
    size_t requestSize = 0, responseSize = 0;
    int rc;
    if (valueCount) *valueCount = 0;
    if (!client || !values || !valueCount) return -1;
    rc = CpmModbus_RtuBuildRead(client->slave, function, address, quantity, request, sizeof(request), &requestSize);
    if (rc != 0) return rc;
    rc = CpmModbusRs485_Transaction(client, request, requestSize, response, sizeof(response), &responseSize);
    if (rc != 0) return rc;
    rc = CpmModbus_RtuException(response, responseSize, NULL);
    if (rc > 0) return -20;
    if (rc < 0) return -21;
    return CpmModbus_RtuParseRegisters(response, responseSize, client->slave, function, values, capacity, valueCount);
}

int CpmModbusRs485_ReadHolding(CpmModbusRs485 *client, uint16_t address, uint16_t quantity,
                               uint16_t *values, size_t capacity, size_t *valueCount)
{
    return CpmModbusRs485_ReadRegisters(client, CPM_MODBUS_FC_READ_HOLDING_REGISTERS,
                                        address, quantity, values, capacity, valueCount);
}

int CpmModbusRs485_ReadInput(CpmModbusRs485 *client, uint16_t address, uint16_t quantity,
                             uint16_t *values, size_t capacity, size_t *valueCount)
{
    return CpmModbusRs485_ReadRegisters(client, CPM_MODBUS_FC_READ_INPUT_REGISTERS,
                                        address, quantity, values, capacity, valueCount);
}

int CpmModbusRs485_WriteSingle(CpmModbusRs485 *client, uint16_t address, uint16_t value)
{
    uint8_t request[8], response[16];
    size_t requestSize = 0, responseSize = 0;
    int rc;
    if (!client) return -1;
    rc = CpmModbus_RtuBuildWriteSingleRegister(client->slave, address, value, request, sizeof(request), &requestSize);
    if (rc != 0) return rc;
    rc = CpmModbusRs485_Transaction(client, request, requestSize, response, sizeof(response), &responseSize);
    if (rc != 0) return rc;
    if (CpmModbus_RtuValidate(response, responseSize) != 1 || responseSize != requestSize || memcmp(request, response, requestSize) != 0) return -22;
    return 0;
}

int CpmModbusRs485_WriteMultiple(CpmModbusRs485 *client, uint16_t address, const uint16_t *values, uint16_t count)
{
    uint8_t request[260], response[16];
    size_t requestSize = 0, responseSize = 0;
    int rc;
    if (!client || !values || !count) return -1;
    rc = CpmModbus_RtuBuildWriteMultipleRegisters(client->slave, address, values, count, request, sizeof(request), &requestSize);
    if (rc != 0) return rc;
    rc = CpmModbusRs485_Transaction(client, request, requestSize, response, sizeof(response), &responseSize);
    if (rc != 0) return rc;
    if (CpmModbus_RtuValidate(response, responseSize) != 1 || responseSize != 8 || response[0] != client->slave || response[1] != CPM_MODBUS_FC_WRITE_MULTIPLE_REGISTERS) return -23;
    if (response[2] != (uint8_t)(address >> 8) || response[3] != (uint8_t)address || response[4] != (uint8_t)(count >> 8) || response[5] != (uint8_t)count) return -24;
    return 0;
}
