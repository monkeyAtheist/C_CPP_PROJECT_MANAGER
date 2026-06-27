/**
 * @file can.h
 * @brief C++ SocketCAN helper class.
 *
 * @details
 * This bundle is intended to be readable immediately after insertion into a
 * CPM project. The comments below summarize what the module provides, when it
 * is useful and how to start using the public API.
 *
 * @par Main features
 * - wraps Linux SocketCAN open/close/send/receive operations;
 * - supports classical CAN and CAN FD fields;
 * - provides helpers for standard and extended identifiers;
 * - offers timeout and filter configuration.
 *
 * @par Typical applications
 * - C++ CAN diagnostic tools on Linux;
 * - communication with ECUs, sensors or embedded boards;
 * - bench tools that need a compact SocketCAN abstraction.
 *
 * @par Usage notes
 * - The default implementation targets Linux interfaces such as can0.
 * - Configure bitrate and bring the interface up before opening it in the application.
 *
 * @par Example of use
 * @code{.cpp}
 * #include "can.h"
 * 
 * jc_can::CanLink bus;
 * jc_can::CanFrame frame = jc_can::CanFrame::Standard(0x123, { 0x11, 0x22 });
 * if (bus.open("can0") == jc_can::CanStatus::Ok)
 * {
 *     bus.send(frame);
 *     bus.close();
 * }
 * @endcode
 */
#ifndef JC_CAN_LINK_H
#define JC_CAN_LINK_H

#include <array>
#include <cstdint>
#include <string>
#include <vector>

namespace jc_can
{
    constexpr std::size_t MaxCanData = 64;

    enum class CanStatus
    {
        Ok = 0,
        InvalidArgument = -1,
        Unsupported = -2,
        SystemError = -3,
        Timeout = -4,
        Truncated = -5
    };

    struct CanFrame
    {
        std::uint32_t id = 0;
        std::uint8_t dlc = 0;
        std::array<std::uint8_t, MaxCanData> data{};
        bool extended = false;
        bool remote = false;
        bool error = false;
        bool fd = false;
        bool bitrateSwitch = false;
        bool errorStateIndicator = false;

        static CanFrame Standard(std::uint16_t id11, const std::vector<std::uint8_t>& payload = {});
        static CanFrame Extended(std::uint32_t id29, const std::vector<std::uint8_t>& payload = {});
        bool setData(const std::uint8_t* payload, std::size_t size);
        std::vector<std::uint8_t> payload() const;
        std::string toString() const;
    };

    struct CanFilter
    {
        std::uint32_t id = 0;
        std::uint32_t mask = 0;
    };

    class CanLink
    {
    public:
        CanLink();
        ~CanLink();

        CanLink(const CanLink&) = delete;
        CanLink& operator=(const CanLink&) = delete;

        CanLink(CanLink&& other) noexcept;
        CanLink& operator=(CanLink&& other) noexcept;

        CanStatus open(const std::string& interfaceName, bool enableCanFd = false);
        void close();
        bool isOpen() const;

        CanStatus setReceiveTimeout(int timeoutMs);
        CanStatus setLoopback(bool enabled);
        CanStatus setReceiveOwnMessages(bool enabled);
        CanStatus setFilters(const std::vector<CanFilter>& filters);
        CanStatus clearFilters();

        CanStatus send(const CanFrame& frame);
        CanStatus receive(CanFrame& frame);

        const std::string& interfaceName() const { return interfaceName_; }
        bool canFdEnabled() const { return canFdEnabled_; }
        const std::string& lastError() const { return lastError_; }

    private:
        int handle_ = -1;
        bool canFdEnabled_ = false;
        std::string interfaceName_;
        std::string lastError_;

        void setLastError(const std::string& message);
        void moveFrom(CanLink& other) noexcept;
    };
}

#endif // JC_CAN_LINK_H
