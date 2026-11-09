#include "cpm_i2c.h"

#include <stdlib.h>
#include <string.h>

#if defined(__linux__)
#include <fcntl.h>
#include <linux/i2c-dev.h>
#include <linux/i2c.h>
#include <sys/ioctl.h>
#include <unistd.h>
#endif

void CpmI2c_Init(CpmI2c *bus)
{
    if (bus)
    {
        bus->handle = -1;
        bus->address = 0;
    }
}

int CpmI2c_SetAddress(CpmI2c *bus, uint16_t address)
{
#if defined(__linux__)
    if (!bus || bus->handle < 0) return -1;
    if (ioctl(bus->handle, I2C_SLAVE, address) != 0) return -2;
    bus->address = address;
    return 0;
#else
    (void)bus; (void)address;
    return -2;
#endif
}

int CpmI2c_Open(CpmI2c *bus, const char *devicePath, uint16_t address)
{
#if defined(__linux__)
    int fd;
    if (!bus || !devicePath) return -1;
    CpmI2c_Close(bus);
    fd = open(devicePath, O_RDWR);
    if (fd < 0) return -2;
    bus->handle = fd;
    if (CpmI2c_SetAddress(bus, address) != 0)
    {
        close(fd);
        CpmI2c_Init(bus);
        return -3;
    }
    return 0;
#else
    (void)bus; (void)devicePath; (void)address;
    return -2;
#endif
}

void CpmI2c_Close(CpmI2c *bus)
{
    if (!bus) return;
#if defined(__linux__)
    if (bus->handle >= 0) close(bus->handle);
#endif
    CpmI2c_Init(bus);
}

int CpmI2c_Write(CpmI2c *bus, const void *data, size_t size)
{
#if defined(__linux__)
    ssize_t n;
    if (!bus || bus->handle < 0 || (!data && size)) return -1;
    n = write(bus->handle, data, size);
    return n < 0 ? -2 : (int)n;
#else
    (void)bus; (void)data; (void)size;
    return -2;
#endif
}

int CpmI2c_Read(CpmI2c *bus, void *data, size_t size)
{
#if defined(__linux__)
    ssize_t n;
    if (!bus || bus->handle < 0 || (!data && size)) return -1;
    n = read(bus->handle, data, size);
    return n < 0 ? -2 : (int)n;
#else
    (void)bus; (void)data; (void)size;
    return -2;
#endif
}

int CpmI2c_WriteRead(CpmI2c *bus, const void *writeData, size_t writeSize, void *readData, size_t readSize)
{
#if defined(__linux__)
    struct i2c_msg msgs[2];
    struct i2c_rdwr_ioctl_data tx;
    unsigned count = 0;
    if (!bus || bus->handle < 0 || (!writeData && writeSize) || (!readData && readSize)) return -1;
    if (writeSize > 65535u || readSize > 65535u) return -2;
    memset(msgs, 0, sizeof(msgs));
    if (writeSize)
    {
        msgs[count].addr = bus->address;
        msgs[count].flags = 0;
        msgs[count].len = (uint16_t)writeSize;
        msgs[count].buf = (uint8_t *)writeData;
        count++;
    }
    if (readSize)
    {
        msgs[count].addr = bus->address;
        msgs[count].flags = I2C_M_RD;
        msgs[count].len = (uint16_t)readSize;
        msgs[count].buf = (uint8_t *)readData;
        count++;
    }
    if (count == 0) return 0;
    tx.msgs = msgs;
    tx.nmsgs = count;
    return ioctl(bus->handle, I2C_RDWR, &tx) == (int)count ? 0 : -3;
#else
    (void)bus; (void)writeData; (void)writeSize; (void)readData; (void)readSize;
    return -2;
#endif
}

int CpmI2c_WriteRegister8(CpmI2c *bus, uint8_t reg, uint8_t value)
{
    uint8_t bytes[2] = { reg, value };
    return CpmI2c_Write(bus, bytes, sizeof(bytes)) == (int)sizeof(bytes) ? 0 : -1;
}

int CpmI2c_ReadRegister8(CpmI2c *bus, uint8_t reg, uint8_t *value)
{
    if (!value) return -1;
    return CpmI2c_WriteRead(bus, &reg, 1, value, 1);
}

int CpmI2c_ReadRegisters(CpmI2c *bus, uint8_t startReg, void *data, size_t size)
{
    if (!data && size) return -1;
    return CpmI2c_WriteRead(bus, &startReg, 1, data, size);
}

int CpmI2c_WriteRegister16(CpmI2c *bus, uint16_t reg, const void *data, size_t size, CpmI2cByteOrder order)
{
    unsigned char stack[258];
    unsigned char *buffer = stack;
    size_t total = size + 2;
    int result;
    if ((!data && size) || size > 65533u) return -1;
    if (total > sizeof(stack))
    {
        buffer = (unsigned char *)malloc(total);
        if (!buffer) return -2;
    }
    if (order == CPM_I2C_LSB_FIRST)
    {
        buffer[0] = (unsigned char)reg;
        buffer[1] = (unsigned char)(reg >> 8);
    }
    else
    {
        buffer[0] = (unsigned char)(reg >> 8);
        buffer[1] = (unsigned char)reg;
    }
    if (size) memcpy(buffer + 2, data, size);
    result = CpmI2c_Write(bus, buffer, total) == (int)total ? 0 : -3;
    if (buffer != stack) free(buffer);
    return result;
}

int CpmI2c_ReadRegister16(CpmI2c *bus, uint16_t reg, void *data, size_t size, CpmI2cByteOrder order)
{
    unsigned char bytes[2];
    if (!data && size) return -1;
    if (order == CPM_I2C_LSB_FIRST)
    {
        bytes[0] = (unsigned char)reg;
        bytes[1] = (unsigned char)(reg >> 8);
    }
    else
    {
        bytes[0] = (unsigned char)(reg >> 8);
        bytes[1] = (unsigned char)reg;
    }
    return CpmI2c_WriteRead(bus, bytes, sizeof(bytes), data, size);
}
