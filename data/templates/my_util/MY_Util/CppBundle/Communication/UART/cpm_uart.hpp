#pragma once

#include "cpm_uart.h"
#include <chrono>
#include <cstdint>
#include <string>
#include <string_view>
#include <vector>

namespace cpm
{
class SerialPort
{
public:
    SerialPort() { CpmUart_Init(&uart_); }
    ~SerialPort() { CpmUart_Close(&uart_); }
    SerialPort(const SerialPort&) = delete;
    SerialPort& operator=(const SerialPort&) = delete;
    SerialPort(SerialPort&& other) noexcept : uart_(other.uart_) { CpmUart_Init(&other.uart_); }
    SerialPort& operator=(SerialPort&& other) noexcept
    {
        if (this != &other) { CpmUart_Close(&uart_); uart_ = other.uart_; CpmUart_Init(&other.uart_); }
        return *this;
    }

    bool open(const std::string& port, const CpmUartConfig& config) { return CpmUart_OpenConfig(&uart_, port.c_str(), &config) == 0; }
    bool open(const std::string& port, int baudRate = 115200, int dataBits = 8, char parity = 'N', int stopBits = 1)
    { return CpmUart_Open(&uart_, port.c_str(), baudRate, dataBits, parity, stopBits) == 0; }
    void close() { CpmUart_Close(&uart_); }
    bool isOpen() const { return CpmUart_IsOpen(&uart_) != 0; }
    bool configure(const CpmUartConfig& config) { return CpmUart_Configure(&uart_, &config) == 0; }

    int write(const void* data, std::size_t size) { return CpmUart_Write(&uart_, data, size); }
    int writeAll(const void* data, std::size_t size) { return CpmUart_WriteAll(&uart_, data, size); }
    int write(std::string_view text) { return writeAll(text.data(), text.size()); }
    int read(void* data, std::size_t size, std::chrono::milliseconds timeout = std::chrono::milliseconds{1000})
    { return CpmUart_Read(&uart_, data, size, static_cast<int>(timeout.count())); }
    int readExact(void* data, std::size_t size, std::chrono::milliseconds timeout = std::chrono::milliseconds{1000})
    { return CpmUart_ReadExact(&uart_, data, size, static_cast<int>(timeout.count())); }
    std::string readLine(std::chrono::milliseconds timeout = std::chrono::milliseconds{1000}, std::size_t maxSize = 4096)
    {
        std::vector<char> buffer(maxSize + 1, '\0');
        const int count = CpmUart_ReadLine(&uart_, buffer.data(), buffer.size(), static_cast<int>(timeout.count()));
        return count > 0 ? std::string(buffer.data(), static_cast<std::size_t>(count)) : std::string{};
    }
    int bytesAvailable() { return CpmUart_BytesAvailable(&uart_); }
    bool purge(bool rx = true, bool tx = true) { return CpmUart_Purge(&uart_, rx ? 1 : 0, tx ? 1 : 0) == 0; }
    bool flush() { return CpmUart_Flush(&uart_) == 0; }
    bool setDtr(bool enabled) { return CpmUart_SetDtr(&uart_, enabled ? 1 : 0) == 0; }
    bool setRts(bool enabled) { return CpmUart_SetRts(&uart_, enabled ? 1 : 0) == 0; }
    CpmUart* native() { return &uart_; }
    const CpmUart* native() const { return &uart_; }

private:
    CpmUart uart_{};
};
}
