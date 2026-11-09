#pragma once
#include "cpm_hid.h"
#include <chrono>
#include <cstdint>
#include <stdexcept>
#include <string>
#include <vector>

namespace cpm {
class HidDevice {
public:
    HidDevice() { CpmHid_Init(&device_); }
    ~HidDevice() { CpmHid_Close(&device_); }
    HidDevice(const HidDevice&) = delete;
    HidDevice& operator=(const HidDevice&) = delete;
    HidDevice(HidDevice&& other) noexcept : device_(other.device_) { CpmHid_Init(&other.device_); }
    HidDevice& operator=(HidDevice&& other) noexcept { if (this != &other) { CpmHid_Close(&device_); device_ = other.device_; CpmHid_Init(&other.device_); } return *this; }
    void open(std::uint16_t vid, std::uint16_t pid, const wchar_t* serial = nullptr) { if (CpmHid_OpenVidPid(&device_, vid, pid, serial) != 0) throw std::runtime_error("USB HID open failed"); }
    void openPath(const std::string& path) { if (CpmHid_OpenPath(&device_, path.c_str()) != 0) throw std::runtime_error("USB HID open failed"); }
    void close() { CpmHid_Close(&device_); }
    std::vector<std::uint8_t> read(std::size_t capacity, std::chrono::milliseconds timeout) { std::vector<std::uint8_t> out(capacity); int n = CpmHid_Read(&device_, out.data(), out.size(), static_cast<int>(timeout.count())); if (n < 0) throw std::runtime_error(CpmHid_ResultText(n)); out.resize(static_cast<std::size_t>(n)); return out; }
    void write(const std::vector<std::uint8_t>& report) { if (CpmHid_Write(&device_, report.data(), report.size()) < 0) throw std::runtime_error("USB HID write failed"); }
    CpmHidDevice* nativeHandle() { return &device_; }
private:
    CpmHidDevice device_{};
};
}
