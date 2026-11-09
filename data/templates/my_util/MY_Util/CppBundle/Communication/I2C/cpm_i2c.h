#ifndef CPM_I2C_H
#define CPM_I2C_H
#include <stddef.h>
#include <stdint.h>
#ifdef __cplusplus
extern "C" {
#endif

typedef enum CpmI2cByteOrder { CPM_I2C_MSB_FIRST = 0, CPM_I2C_LSB_FIRST = 1 } CpmI2cByteOrder;
typedef struct CpmI2c { int handle; uint16_t address; } CpmI2c;

void CpmI2c_Init(CpmI2c *bus);
int CpmI2c_Open(CpmI2c *bus, const char *devicePath, uint16_t address);
void CpmI2c_Close(CpmI2c *bus);
int CpmI2c_SetAddress(CpmI2c *bus, uint16_t address);
int CpmI2c_Write(CpmI2c *bus, const void *data, size_t size);
int CpmI2c_Read(CpmI2c *bus, void *data, size_t size);
int CpmI2c_WriteRead(CpmI2c *bus, const void *writeData, size_t writeSize, void *readData, size_t readSize);
int CpmI2c_WriteRegister8(CpmI2c *bus, uint8_t reg, uint8_t value);
int CpmI2c_ReadRegister8(CpmI2c *bus, uint8_t reg, uint8_t *value);
int CpmI2c_ReadRegisters(CpmI2c *bus, uint8_t startReg, void *data, size_t size);
int CpmI2c_WriteRegister16(CpmI2c *bus, uint16_t reg, const void *data, size_t size, CpmI2cByteOrder order);
int CpmI2c_ReadRegister16(CpmI2c *bus, uint16_t reg, void *data, size_t size, CpmI2cByteOrder order);

#ifdef __cplusplus
}
#endif
#endif
