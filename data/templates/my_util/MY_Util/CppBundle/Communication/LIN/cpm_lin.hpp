#pragma once
#include "cpm_lin.h"
#include <chrono>
#include <stdexcept>
#include <string>
#include <vector>

namespace cpm {
class LinMaster {
public:
    LinMaster() { CpmLin_Init(&lin_); }
    ~LinMaster() { CpmLin_Close(&lin_); }
    LinMaster(const LinMaster&) = delete;
    LinMaster& operator=(const LinMaster&) = delete;
    LinMaster(LinMaster&& other) noexcept : lin_(other.lin_) { CpmLin_Init(&other.lin_); }
    LinMaster& operator=(LinMaster&& other) noexcept { if (this != &other) { CpmLin_Close(&lin_); lin_ = other.lin_; CpmLin_Init(&other.lin_); } return *this; }

    void open(const std::string& port, const CpmLinConfig& config) { if (CpmLin_Open(&lin_, port.c_str(), &config) != 0) throw std::runtime_error("LIN open failed"); }
    void close() { CpmLin_Close(&lin_); }
    void publish(std::uint8_t id, const std::vector<std::uint8_t>& data, CpmLinChecksumMode mode = CPM_LIN_CHECKSUM_AUTO) { if (CpmLin_Publish(&lin_, id, data.data(), data.size(), mode) != 0) throw std::runtime_error("LIN publish failed"); }
    std::vector<std::uint8_t> request(std::uint8_t id, std::size_t length, std::chrono::milliseconds timeout, CpmLinChecksumMode mode = CPM_LIN_CHECKSUM_AUTO) { std::vector<std::uint8_t> out(length); int rc = CpmLin_Request(&lin_, id, out.data(), out.size(), mode, static_cast<int>(timeout.count())); if (rc < 0) throw std::runtime_error("LIN request failed"); return out; }
    static std::uint8_t protectedId(std::uint8_t id) { return CpmLin_ProtectedId(id); }
    static std::uint8_t checksum(std::uint8_t pid, const std::vector<std::uint8_t>& data, CpmLinChecksumMode mode = CPM_LIN_CHECKSUM_AUTO) { return CpmLin_Checksum(pid, data.data(), data.size(), mode); }
private:
    CpmLin lin_{};
};
}
