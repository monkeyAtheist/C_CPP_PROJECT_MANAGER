#ifndef CPM_MODBUS_RS485_H
#define CPM_MODBUS_RS485_H
#include "cpm_rs485.h"
#include "cpm_modbus.h"
#ifdef __cplusplus
extern "C" {
#endif
typedef struct CpmModbusRs485 { CpmRs485 *bus; uint8_t slave; int timeoutMs; } CpmModbusRs485;
void CpmModbusRs485_Init(CpmModbusRs485 *client,CpmRs485 *bus,uint8_t slave,int timeoutMs);
int CpmModbusRs485_ReadHolding(CpmModbusRs485 *client,uint16_t address,uint16_t quantity,uint16_t *values,size_t capacity,size_t *valueCount);
int CpmModbusRs485_ReadInput(CpmModbusRs485 *client,uint16_t address,uint16_t quantity,uint16_t *values,size_t capacity,size_t *valueCount);
int CpmModbusRs485_WriteSingle(CpmModbusRs485 *client,uint16_t address,uint16_t value);
int CpmModbusRs485_WriteMultiple(CpmModbusRs485 *client,uint16_t address,const uint16_t *values,uint16_t count);
#ifdef __cplusplus
}
#endif
#endif
