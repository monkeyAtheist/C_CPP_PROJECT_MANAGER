#pragma once
#include "cpm_rs485.h"
#include <chrono>
#include <stdexcept>
#include <string>
#include <vector>

namespace cpm {
class Rs485Bus {
public:
    Rs485Bus() { CpmRs485_Init(&bus_); }
    ~Rs485Bus() { CpmRs485_Close(&bus_); }
    Rs485Bus(const Rs485Bus&) = delete;
    Rs485Bus& operator=(const Rs485Bus&) = delete;
    Rs485Bus(Rs485Bus&& other) noexcept : bus_(other.bus_) { CpmRs485_Init(&other.bus_); }
    Rs485Bus& operator=(Rs485Bus&& other) noexcept { if (this != &other) { CpmRs485_Close(&bus_); bus_ = other.bus_; CpmRs485_Init(&other.bus_); } return *this; }

    void open(const std::string& port, const CpmRs485Config& config) { if (CpmRs485_Open(&bus_, port.c_str(), &config) != 0) throw std::runtime_error("RS-485 open failed"); }
    void close() { CpmRs485_Close(&bus_); }
    bool isOpen() const { return CpmUart_IsOpen(&bus_.uart) != 0; }
    void write(const void* data, std::size_t size) { if (CpmRs485_Write(&bus_, data, size) < 0) throw std::runtime_error("RS-485 write failed"); }
    std::vector<std::uint8_t> read(std::size_t capacity, std::chrono::milliseconds timeout) { std::vector<std::uint8_t> out(capacity); int n = CpmRs485_Read(&bus_, out.data(), out.size(), static_cast<int>(timeout.count())); if (n < 0) throw std::runtime_error("RS-485 read failed"); out.resize(static_cast<std::size_t>(n)); return out; }
    CpmRs485* nativeHandle() { return &bus_; }
private:
    CpmRs485 bus_{};
};
}
