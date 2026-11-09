#pragma once
#include "cpm_websocket.h"
#include <chrono>
#include <cstdint>
#include <stdexcept>
#include <string>
#include <vector>
#include <utility>

namespace cpm {
class WebSocket {
public:
    WebSocket() { CpmWebSocket_Init(&ws_); }
    ~WebSocket() { CpmWebSocket_Close(&ws_, 1000, nullptr); }
    WebSocket(const WebSocket&) = delete; WebSocket& operator=(const WebSocket&) = delete;
    WebSocket(WebSocket&& other) noexcept : ws_(other.ws_) { CpmWebSocket_Init(&other.ws_); }
    WebSocket& operator=(WebSocket&& other) noexcept { if (this != &other) { CpmWebSocket_Close(&ws_, 1000, nullptr); ws_ = other.ws_; CpmWebSocket_Init(&other.ws_); } return *this; }
    void connect(const std::string& url, const std::string& subprotocol = {}, std::chrono::milliseconds timeout = std::chrono::seconds(5)) { if (CpmWebSocket_Connect(&ws_, url.c_str(), subprotocol.empty() ? nullptr : subprotocol.c_str(), nullptr, static_cast<int>(timeout.count())) != 0) throw std::runtime_error("WebSocket connect failed"); }
    void sendText(const std::string& text) { if (CpmWebSocket_SendText(&ws_, text.c_str()) != 0) throw std::runtime_error("WebSocket send failed"); }
    void sendBinary(const std::vector<std::uint8_t>& data) { if (CpmWebSocket_SendBinary(&ws_, data.data(), data.size()) != 0) throw std::runtime_error("WebSocket send failed"); }
    std::pair<CpmWebSocketFrame,std::vector<std::uint8_t>> receive(std::size_t maxPayload = 65536, std::chrono::milliseconds timeout = std::chrono::seconds(5)) { CpmWebSocketFrame frame{}; std::vector<std::uint8_t> payload(maxPayload); int rc = CpmWebSocket_Receive(&ws_, &frame, payload.data(), payload.size(), static_cast<int>(timeout.count())); if (rc <= 0) throw std::runtime_error("WebSocket receive timeout/error"); payload.resize(frame.payloadSize); return {frame, std::move(payload)}; }
    void close(std::uint16_t status = 1000, const std::string& reason = {}) { CpmWebSocket_Close(&ws_, status, reason.empty() ? nullptr : reason.c_str()); }
private: CpmWebSocket ws_{};
};
}
