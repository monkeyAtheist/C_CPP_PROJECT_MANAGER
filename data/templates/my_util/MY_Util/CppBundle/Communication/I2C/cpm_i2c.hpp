#pragma once
#include "cpm_i2c.h"
#include <cstdint>
#include <string>
#include <utility>
#include <vector>

namespace cpm
{
class I2cDevice
{
public:
    I2cDevice() { CpmI2c_Init(&bus_); }
    ~I2cDevice() { CpmI2c_Close(&bus_); }
    I2cDevice(const I2cDevice&) = delete;
    I2cDevice& operator=(const I2cDevice&) = delete;
    I2cDevice(I2cDevice&& other) noexcept : bus_(other.bus_) { CpmI2c_Init(&other.bus_); }
    I2cDevice& operator=(I2cDevice&& other) noexcept { if (this != &other) { CpmI2c_Close(&bus_); bus_ = other.bus_; CpmI2c_Init(&other.bus_); } return *this; }
    bool open(const std::string& devicePath, std::uint16_t address) { return CpmI2c_Open(&bus_, devicePath.c_str(), address) == 0; }
    void close() { CpmI2c_Close(&bus_); }
    bool setAddress(std::uint16_t address) { return CpmI2c_SetAddress(&bus_, address) == 0; }
    int write(const void* data, std::size_t size) { return CpmI2c_Write(&bus_, data, size); }
    int read(void* data, std::size_t size) { return CpmI2c_Read(&bus_, data, size); }
    bool writeRead(const void* tx, std::size_t txSize, void* rx, std::size_t rxSize) { return CpmI2c_WriteRead(&bus_, tx, txSize, rx, rxSize) == 0; }
    bool readRegister8(std::uint8_t reg, std::uint8_t& value) { return CpmI2c_ReadRegister8(&bus_, reg, &value) == 0; }
    std::vector<std::uint8_t> readRegisters(std::uint8_t start, std::size_t count) { std::vector<std::uint8_t> v(count); if (CpmI2c_ReadRegisters(&bus_, start, v.data(), v.size()) != 0) v.clear(); return v; }
private:
    CpmI2c bus_{};
};
}
