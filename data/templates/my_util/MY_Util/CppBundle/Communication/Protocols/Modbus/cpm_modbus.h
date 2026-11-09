#ifndef CPM_MODBUS_H
#define CPM_MODBUS_H

#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

enum
{
    CPM_MODBUS_FC_READ_COILS = 0x01,
    CPM_MODBUS_FC_READ_DISCRETE_INPUTS = 0x02,
    CPM_MODBUS_FC_READ_HOLDING_REGISTERS = 0x03,
    CPM_MODBUS_FC_READ_INPUT_REGISTERS = 0x04,
    CPM_MODBUS_FC_WRITE_SINGLE_COIL = 0x05,
    CPM_MODBUS_FC_WRITE_SINGLE_REGISTER = 0x06,
    CPM_MODBUS_FC_WRITE_MULTIPLE_COILS = 0x0F,
    CPM_MODBUS_FC_WRITE_MULTIPLE_REGISTERS = 0x10
};

uint16_t CpmModbus_Crc16(const void *data, size_t size);
int CpmModbus_RtuValidate(const void *frame, size_t frameSize);
int CpmModbus_RtuBuildRead(uint8_t slave, uint8_t function, uint16_t address, uint16_t quantity, void *output, size_t capacity, size_t *outputSize);
int CpmModbus_RtuBuildWriteSingleRegister(uint8_t slave, uint16_t address, uint16_t value, void *output, size_t capacity, size_t *outputSize);
int CpmModbus_RtuBuildWriteMultipleRegisters(uint8_t slave, uint16_t address, const uint16_t *values, uint16_t count, void *output, size_t capacity, size_t *outputSize);
int CpmModbus_RtuParseRegisters(const void *frame, size_t frameSize, uint8_t expectedSlave, uint8_t expectedFunction, uint16_t *values, size_t capacity, size_t *valueCount);
int CpmModbus_RtuException(const void *frame, size_t frameSize, uint8_t *exceptionCode);

int CpmModbus_TcpBuildRead(uint16_t transactionId, uint8_t unitId, uint8_t function, uint16_t address, uint16_t quantity, void *output, size_t capacity, size_t *outputSize);
int CpmModbus_TcpBuildWriteSingleRegister(uint16_t transactionId, uint8_t unitId, uint16_t address, uint16_t value, void *output, size_t capacity, size_t *outputSize);
int CpmModbus_TcpParseRegisters(const void *frame, size_t frameSize, uint16_t expectedTransactionId, uint8_t expectedUnitId, uint8_t expectedFunction, uint16_t *values, size_t capacity, size_t *valueCount);
int CpmModbus_TcpException(const void *frame, size_t frameSize, uint8_t *exceptionCode);

#ifdef __cplusplus
}
#endif
#endif
