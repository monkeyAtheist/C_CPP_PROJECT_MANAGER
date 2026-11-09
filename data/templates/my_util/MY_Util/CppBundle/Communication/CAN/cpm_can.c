#define _DEFAULT_SOURCE
#include "cpm_can.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#if defined(__linux__)
#include <errno.h>
#include <linux/can.h>
#include <linux/can/raw.h>
#include <net/if.h>
#include <sys/ioctl.h>
#include <sys/select.h>
#include <sys/socket.h>
#include <unistd.h>
#endif

void CpmCan_Init(CpmCan *canBus) { if (canBus) { canBus->handle = -1; canBus->fdEnabled = 0; } }

int CpmCan_Open(CpmCan *canBus, const char *interfaceName, int enableFd)
{
#if defined(__linux__)
    int fd;
    struct ifreq ifr;
    struct sockaddr_can addr;
    int fdMode = enableFd ? 1 : 0;
    if (!canBus || !interfaceName || !*interfaceName) return -1;
    CpmCan_Close(canBus);
    fd = socket(PF_CAN, SOCK_RAW, CAN_RAW);
    if (fd < 0) return -2;
    memset(&ifr, 0, sizeof(ifr)); snprintf(ifr.ifr_name, sizeof(ifr.ifr_name), "%s", interfaceName);
    if (ioctl(fd, SIOCGIFINDEX, &ifr) != 0) { close(fd); return -3; }
    if (enableFd && setsockopt(fd, SOL_CAN_RAW, CAN_RAW_FD_FRAMES, &fdMode, sizeof(fdMode)) != 0) { close(fd); return -4; }
    memset(&addr, 0, sizeof(addr)); addr.can_family = AF_CAN; addr.can_ifindex = ifr.ifr_ifindex;
    if (bind(fd, (struct sockaddr *)&addr, sizeof(addr)) != 0) { close(fd); return -5; }
    canBus->handle = fd; canBus->fdEnabled = enableFd ? 1 : 0; return 0;
#else
    (void)canBus; (void)interfaceName; (void)enableFd; return -2;
#endif
}

void CpmCan_Close(CpmCan *canBus)
{
    if (!canBus) return;
#if defined(__linux__)
    if (canBus->handle >= 0) close(canBus->handle);
#endif
    CpmCan_Init(canBus);
}

int CpmCan_Send(CpmCan *canBus, const CpmCanFrame *frame)
{
#if defined(__linux__)
    canid_t id;
    if (!canBus || canBus->handle < 0 || !frame || frame->length > 64) return -1;
    id = frame->id | (frame->extended ? CAN_EFF_FLAG : 0) | (frame->remote ? CAN_RTR_FLAG : 0);
    if (frame->fd || canBus->fdEnabled) {
        struct canfd_frame nativeFrame; memset(&nativeFrame, 0, sizeof(nativeFrame)); nativeFrame.can_id = id; nativeFrame.len = frame->length; memcpy(nativeFrame.data, frame->data, frame->length);
        return write(canBus->handle, &nativeFrame, sizeof(nativeFrame)) == (ssize_t)sizeof(nativeFrame) ? 0 : -2;
    } else {
        struct can_frame nativeFrame; if (frame->length > 8) return -3; memset(&nativeFrame, 0, sizeof(nativeFrame)); nativeFrame.can_id = id; nativeFrame.can_dlc = frame->length; memcpy(nativeFrame.data, frame->data, frame->length);
        return write(canBus->handle, &nativeFrame, sizeof(nativeFrame)) == (ssize_t)sizeof(nativeFrame) ? 0 : -2;
    }
#else
    (void)canBus; (void)frame; return -2;
#endif
}

int CpmCan_Receive(CpmCan *canBus, CpmCanFrame *frame, int timeoutMs)
{
#if defined(__linux__)
    fd_set set; struct timeval tv; int rc;
    if (!canBus || canBus->handle < 0 || !frame) return -1;
    FD_ZERO(&set); FD_SET(canBus->handle, &set); tv.tv_sec = timeoutMs < 0 ? 0 : timeoutMs / 1000; tv.tv_usec = timeoutMs < 0 ? 0 : (timeoutMs % 1000) * 1000;
    rc = select(canBus->handle + 1, &set, NULL, NULL, timeoutMs < 0 ? NULL : &tv);
    if (rc <= 0) return rc;
    memset(frame, 0, sizeof(*frame));
    if (canBus->fdEnabled) {
        struct canfd_frame nativeFrame; ssize_t n = read(canBus->handle, &nativeFrame, sizeof(nativeFrame)); if (n < (ssize_t)sizeof(struct can_frame)) return -2;
        frame->id = nativeFrame.can_id & (nativeFrame.can_id & CAN_EFF_FLAG ? CAN_EFF_MASK : CAN_SFF_MASK); frame->extended = !!(nativeFrame.can_id & CAN_EFF_FLAG); frame->remote = !!(nativeFrame.can_id & CAN_RTR_FLAG); frame->length = nativeFrame.len; frame->fd = n == (ssize_t)sizeof(struct canfd_frame); memcpy(frame->data, nativeFrame.data, frame->length); return 1;
    } else {
        struct can_frame nativeFrame; ssize_t n = read(canBus->handle, &nativeFrame, sizeof(nativeFrame)); if (n != (ssize_t)sizeof(nativeFrame)) return -2;
        frame->id = nativeFrame.can_id & (nativeFrame.can_id & CAN_EFF_FLAG ? CAN_EFF_MASK : CAN_SFF_MASK); frame->extended = !!(nativeFrame.can_id & CAN_EFF_FLAG); frame->remote = !!(nativeFrame.can_id & CAN_RTR_FLAG); frame->length = nativeFrame.can_dlc; memcpy(frame->data, nativeFrame.data, frame->length); return 1;
    }
#else
    (void)canBus; (void)frame; (void)timeoutMs; return -2;
#endif
}

int CpmCan_SetFilter(CpmCan *canBus, uint32_t id, uint32_t mask, int extended)
{
#if defined(__linux__)
    struct can_filter filter;
    if (!canBus || canBus->handle < 0) return -1;
    filter.can_id = id | (extended ? CAN_EFF_FLAG : 0); filter.can_mask = mask | CAN_EFF_FLAG;
    return setsockopt(canBus->handle, SOL_CAN_RAW, CAN_RAW_FILTER, &filter, sizeof(filter)) == 0 ? 0 : -2;
#else
    (void)canBus; (void)id; (void)mask; (void)extended; return -2;
#endif
}

int CpmCan_SetLoopback(CpmCan *canBus, int enabled)
{
#if defined(__linux__)
    int value = enabled ? 1 : 0; if (!canBus || canBus->handle < 0) return -1; return setsockopt(canBus->handle, SOL_CAN_RAW, CAN_RAW_LOOPBACK, &value, sizeof(value)) == 0 ? 0 : -2;
#else
    (void)canBus; (void)enabled; return -2;
#endif
}

int CpmCan_SetReceiveOwnMessages(CpmCan *canBus, int enabled)
{
#if defined(__linux__)
    int value = enabled ? 1 : 0; if (!canBus || canBus->handle < 0) return -1; return setsockopt(canBus->handle, SOL_CAN_RAW, CAN_RAW_RECV_OWN_MSGS, &value, sizeof(value)) == 0 ? 0 : -2;
#else
    (void)canBus; (void)enabled; return -2;
#endif
}

int CpmCan_FormatFrame(const CpmCanFrame *frame, char *buffer, size_t bufferSize)
{
    size_t used = 0; unsigned i;
    if (!frame || !buffer || bufferSize == 0) return -1;
    used = (size_t)snprintf(buffer, bufferSize, "%s0x%X [%u]", frame->extended ? "EXT " : "STD ", frame->id, (unsigned)frame->length);
    for (i = 0; i < frame->length && used + 4 < bufferSize; ++i) used += (size_t)snprintf(buffer + used, bufferSize - used, " %02X", frame->data[i]);
    return (int)used;
}

int CpmCan_SetFilters(CpmCan *canBus, const CpmCanFilter *filters, size_t count)
{
#if defined(__linux__)
    struct can_filter *nativeFilters;
    size_t i;
    int rc;
    if (!canBus || canBus->handle < 0 || (!filters && count)) return -1;
    if (count == 0) return CpmCan_ClearFilters(canBus);
    nativeFilters = (struct can_filter *)calloc(count, sizeof(*nativeFilters));
    if (!nativeFilters) return -2;
    for (i = 0; i < count; ++i)
    {
        nativeFilters[i].can_id = filters[i].id | (filters[i].extended ? CAN_EFF_FLAG : 0);
        nativeFilters[i].can_mask = filters[i].mask | CAN_EFF_FLAG;
    }
    rc = setsockopt(canBus->handle, SOL_CAN_RAW, CAN_RAW_FILTER, nativeFilters, (socklen_t)(count * sizeof(*nativeFilters))) == 0 ? 0 : -3;
    free(nativeFilters);
    return rc;
#else
    (void)canBus; (void)filters; (void)count; return -2;
#endif
}

int CpmCan_ClearFilters(CpmCan *canBus)
{
#if defined(__linux__)
    struct can_filter acceptAll;
    if (!canBus || canBus->handle < 0) return -1;
    memset(&acceptAll, 0, sizeof(acceptAll));
    return setsockopt(canBus->handle, SOL_CAN_RAW, CAN_RAW_FILTER, &acceptAll, sizeof(acceptAll)) == 0 ? 0 : -2;
#else
    (void)canBus; return -2;
#endif
}

int CpmCan_SetErrorMask(CpmCan *canBus, uint32_t errorMask)
{
#if defined(__linux__)
    can_err_mask_t mask = (can_err_mask_t)errorMask;
    if (!canBus || canBus->handle < 0) return -1;
    return setsockopt(canBus->handle, SOL_CAN_RAW, CAN_RAW_ERR_FILTER, &mask, sizeof(mask)) == 0 ? 0 : -2;
#else
    (void)canBus; (void)errorMask; return -2;
#endif
}
