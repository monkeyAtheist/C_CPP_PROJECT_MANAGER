#pragma once
#include "cpm_ipc.h"
#include <chrono>
#include <cstdint>
#include <string>
#include <utility>
#include <vector>

namespace cpm
{
class IpcChannel
{
public:
    IpcChannel() { CpmIpc_Init(&pipe_); }
    ~IpcChannel() { CpmIpc_Close(&pipe_); }
    IpcChannel(const IpcChannel&) = delete;
    IpcChannel& operator=(const IpcChannel&) = delete;
    IpcChannel(IpcChannel&& other) noexcept : pipe_(other.pipe_) { CpmIpc_Init(&other.pipe_); }
    IpcChannel& operator=(IpcChannel&& other) noexcept { if (this != &other) { CpmIpc_Close(&pipe_); pipe_ = other.pipe_; CpmIpc_Init(&other.pipe_); } return *this; }
    bool createServer(const std::string& name) { return CpmIpc_CreateServer(&pipe_, name.c_str()) == 0; }
    bool waitClient(std::chrono::milliseconds timeout = std::chrono::milliseconds{-1}) { return CpmIpc_WaitClient(&pipe_, static_cast<int>(timeout.count())) == 0; }
    bool disconnectClient() { return CpmIpc_DisconnectClient(&pipe_) == 0; }
    bool connect(const std::string& name, std::chrono::milliseconds timeout = std::chrono::milliseconds{3000}) { return CpmIpc_Connect(&pipe_, name.c_str(), static_cast<int>(timeout.count())) == 0; }
    int send(const void* data, std::size_t size) { return CpmIpc_SendAll(&pipe_, data, size); }
    int receive(void* data, std::size_t size, std::chrono::milliseconds timeout = std::chrono::milliseconds{1000}) { return CpmIpc_Receive(&pipe_, data, size, static_cast<int>(timeout.count())); }
    bool sendMessage(const void* data, std::uint32_t size) { return CpmIpc_SendMessage(&pipe_, data, size) >= 0; }
    std::vector<std::uint8_t> receiveMessage(std::size_t maxSize = 1024 * 1024, std::chrono::milliseconds timeout = std::chrono::milliseconds{1000})
    {
        std::vector<std::uint8_t> result(maxSize); std::uint32_t size = 0;
        const int rc = CpmIpc_ReceiveMessage(&pipe_, result.data(), result.size(), &size, static_cast<int>(timeout.count()));
        if (rc < 0) return {};
        result.resize(size);
        return result;
    }
    bool isOpen() const { return CpmIpc_IsOpen(&pipe_) != 0; }
    void close() { CpmIpc_Close(&pipe_); }
private:
    CpmIpcPipe pipe_{};
};
}
