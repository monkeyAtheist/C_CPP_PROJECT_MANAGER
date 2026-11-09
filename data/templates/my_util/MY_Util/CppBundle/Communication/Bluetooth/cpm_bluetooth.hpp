#pragma once
#include "cpm_bluetooth.h"
#include <chrono>
#include <cstdint>
#include <string>
#include <string_view>
#include <utility>
#include <vector>

namespace cpm
{
class BluetoothRuntime
{
public:
    BluetoothRuntime() : ok_(CpmBluetooth_Startup() == 0) {}
    ~BluetoothRuntime() { if (ok_) CpmBluetooth_Cleanup(); }
    bool ok() const { return ok_; }
private: bool ok_{};
};
inline BluetoothRuntime& bluetoothRuntime() { static BluetoothRuntime runtime; return runtime; }

class BluetoothRfcomm
{
public:
    BluetoothRfcomm() { (void)bluetoothRuntime(); }
    ~BluetoothRfcomm() { close(); }
    BluetoothRfcomm(const BluetoothRfcomm&) = delete;
    BluetoothRfcomm& operator=(const BluetoothRfcomm&) = delete;
    BluetoothRfcomm(BluetoothRfcomm&& other) noexcept : handle_(std::exchange(other.handle_, CPM_BLUETOOTH_INVALID)) {}
    BluetoothRfcomm& operator=(BluetoothRfcomm&& other) noexcept { if (this != &other) { close(); handle_ = std::exchange(other.handle_, CPM_BLUETOOTH_INVALID); } return *this; }
    bool connect(const std::string& address, std::uint32_t channel = 1, std::chrono::milliseconds timeout = std::chrono::milliseconds{3000})
    { close(); handle_ = CpmBluetooth_RfcommConnect(address.c_str(), channel, static_cast<int>(timeout.count())); return valid(); }
    int send(const void* data, std::size_t size) { return CpmBluetooth_SendAll(handle_, data, size); }
    int send(std::string_view text) { return send(text.data(), text.size()); }
    int receive(void* data, std::size_t size, std::chrono::milliseconds timeout = std::chrono::milliseconds{1000}) { return CpmBluetooth_Receive(handle_, data, size, static_cast<int>(timeout.count())); }
    std::string readLine(std::chrono::milliseconds timeout = std::chrono::milliseconds{1000}, std::size_t maxSize = 4096)
    { std::vector<char> buffer(maxSize + 1); const int n = CpmBluetooth_ReadLine(handle_, buffer.data(), buffer.size(), static_cast<int>(timeout.count())); return n > 0 ? std::string(buffer.data(), static_cast<std::size_t>(n)) : std::string{}; }
    void close() { if (valid()) CpmBluetooth_Close(std::exchange(handle_, CPM_BLUETOOTH_INVALID)); }
    bool valid() const { return handle_ != CPM_BLUETOOTH_INVALID; }
private:
    CpmBluetoothHandle handle_{CPM_BLUETOOTH_INVALID};
};
}
