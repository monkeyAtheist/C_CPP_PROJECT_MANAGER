#pragma once
#include "cpm_can.h"
#include <chrono>
#include <string>
#include <utility>
#include <vector>

namespace cpm
{
class CanBus
{
public:
    CanBus() { CpmCan_Init(&bus_); }
    ~CanBus() { CpmCan_Close(&bus_); }
    CanBus(const CanBus&) = delete;
    CanBus& operator=(const CanBus&) = delete;
    CanBus(CanBus&& other) noexcept : bus_(other.bus_) { CpmCan_Init(&other.bus_); }
    CanBus& operator=(CanBus&& other) noexcept { if (this != &other) { CpmCan_Close(&bus_); bus_ = other.bus_; CpmCan_Init(&other.bus_); } return *this; }
    bool open(const std::string& interfaceName, bool canFd = false) { return CpmCan_Open(&bus_, interfaceName.c_str(), canFd ? 1 : 0) == 0; }
    void close() { CpmCan_Close(&bus_); }
    bool send(const CpmCanFrame& frame) { return CpmCan_Send(&bus_, &frame) == 0; }
    bool receive(CpmCanFrame& frame, std::chrono::milliseconds timeout = std::chrono::milliseconds{1000}) { return CpmCan_Receive(&bus_, &frame, static_cast<int>(timeout.count())) > 0; }
    bool setFilters(const std::vector<CpmCanFilter>& filters) { return CpmCan_SetFilters(&bus_, filters.data(), filters.size()) == 0; }
    bool clearFilters() { return CpmCan_ClearFilters(&bus_) == 0; }
    bool setLoopback(bool enabled) { return CpmCan_SetLoopback(&bus_, enabled ? 1 : 0) == 0; }
private:
    CpmCan bus_{};
};
}
