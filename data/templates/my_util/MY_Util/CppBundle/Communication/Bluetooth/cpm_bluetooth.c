#include "cpm_bluetooth.h"
#include <string.h>

#if defined(_WIN32)
#include <winsock2.h>
#include <ws2bth.h>
#include <ws2tcpip.h>
#include <stdio.h>

static int CpmBluetooth_ParseAddress(const char *text, BTH_ADDR *address)
{
    unsigned int b[6];
    if (!text || !address) return -1;
    if (sscanf(text, "%x:%x:%x:%x:%x:%x", &b[0], &b[1], &b[2], &b[3], &b[4], &b[5]) != 6 &&
        sscanf(text, "%x-%x-%x-%x-%x-%x", &b[0], &b[1], &b[2], &b[3], &b[4], &b[5]) != 6) return -1;
    *address = ((BTH_ADDR)b[0] << 40) | ((BTH_ADDR)b[1] << 32) | ((BTH_ADDR)b[2] << 24) |
               ((BTH_ADDR)b[3] << 16) | ((BTH_ADDR)b[4] << 8) | (BTH_ADDR)b[5];
    return 0;
}

static int CpmBluetooth_SetBlocking(SOCKET s, int blocking)
{
    u_long mode = blocking ? 0UL : 1UL;
    return ioctlsocket(s, FIONBIO, &mode) == 0 ? 0 : -1;
}
#endif

int CpmBluetooth_Startup(void)
{
#if defined(_WIN32)
    WSADATA data;
    return WSAStartup(MAKEWORD(2, 2), &data) == 0 ? 0 : -1;
#else
    return -2;
#endif
}

void CpmBluetooth_Cleanup(void)
{
#if defined(_WIN32)
    WSACleanup();
#endif
}

CpmBluetoothHandle CpmBluetooth_RfcommConnect(const char *bluetoothAddress, uint32_t channel, int timeoutMs)
{
#if defined(_WIN32)
    SOCKET s;
    SOCKADDR_BTH addr;
    BTH_ADDR parsed;
    if (CpmBluetooth_ParseAddress(bluetoothAddress, &parsed) != 0) return CPM_BLUETOOTH_INVALID;
    s = socket(AF_BTH, SOCK_STREAM, BTHPROTO_RFCOMM);
    if (s == INVALID_SOCKET) return CPM_BLUETOOTH_INVALID;
    memset(&addr, 0, sizeof(addr)); addr.addressFamily = AF_BTH; addr.btAddr = parsed; addr.port = channel;
    if (timeoutMs >= 0)
    {
        fd_set set; struct timeval tv; int rc; int error = 0; int errorLen = sizeof(error);
        if (CpmBluetooth_SetBlocking(s, 0) != 0) { closesocket(s); return CPM_BLUETOOTH_INVALID; }
        if (connect(s, (SOCKADDR *)&addr, sizeof(addr)) != 0 && WSAGetLastError() != WSAEWOULDBLOCK) { closesocket(s); return CPM_BLUETOOTH_INVALID; }
        FD_ZERO(&set); FD_SET(s, &set); tv.tv_sec = timeoutMs / 1000; tv.tv_usec = (timeoutMs % 1000) * 1000;
        rc = select(0, NULL, &set, NULL, &tv);
        if (rc <= 0 || getsockopt(s, SOL_SOCKET, SO_ERROR, (char *)&error, &errorLen) != 0 || error != 0) { closesocket(s); return CPM_BLUETOOTH_INVALID; }
        (void)CpmBluetooth_SetBlocking(s, 1);
    }
    else if (connect(s, (SOCKADDR *)&addr, sizeof(addr)) != 0) { closesocket(s); return CPM_BLUETOOTH_INVALID; }
    return (CpmBluetoothHandle)s;
#else
    (void)bluetoothAddress; (void)channel; (void)timeoutMs;
    return CPM_BLUETOOTH_INVALID;
#endif
}

int CpmBluetooth_Send(CpmBluetoothHandle handle, const void *data, size_t size)
{
#if defined(_WIN32)
    return (handle != CPM_BLUETOOTH_INVALID && (data || size == 0)) ? send((SOCKET)handle, (const char *)data, (int)size, 0) : -1;
#else
    (void)handle; (void)data; (void)size; return -2;
#endif
}

int CpmBluetooth_SendAll(CpmBluetoothHandle handle, const void *data, size_t size)
{
    const unsigned char *bytes = (const unsigned char *)data;
    size_t total = 0;
    if (handle == CPM_BLUETOOTH_INVALID || (!data && size)) return -1;
    while (total < size)
    {
        int n = CpmBluetooth_Send(handle, bytes + total, size - total);
        if (n <= 0) return n < 0 ? n : -2;
        total += (size_t)n;
    }
    return (int)total;
}

int CpmBluetooth_Receive(CpmBluetoothHandle handle, void *data, size_t size, int timeoutMs)
{
#if defined(_WIN32)
    fd_set set; struct timeval tv; int rc;
    if (handle == CPM_BLUETOOTH_INVALID || !data || size == 0) return -1;
    FD_ZERO(&set); FD_SET((SOCKET)handle, &set);
    tv.tv_sec = timeoutMs < 0 ? 0 : timeoutMs / 1000;
    tv.tv_usec = timeoutMs < 0 ? 0 : (timeoutMs % 1000) * 1000;
    rc = select(0, &set, NULL, NULL, timeoutMs < 0 ? NULL : &tv);
    return rc <= 0 ? rc : recv((SOCKET)handle, (char *)data, (int)size, 0);
#else
    (void)handle; (void)data; (void)size; (void)timeoutMs; return -2;
#endif
}

int CpmBluetooth_ReceiveExact(CpmBluetoothHandle handle, void *data, size_t size, int timeoutMs)
{
    unsigned char *bytes = (unsigned char *)data;
    size_t total = 0;
    if (!data || size == 0) return -1;
    while (total < size)
    {
        int n = CpmBluetooth_Receive(handle, bytes + total, size - total, timeoutMs);
        if (n <= 0) return total ? (int)total : n;
        total += (size_t)n;
    }
    return (int)total;
}

int CpmBluetooth_ReadLine(CpmBluetoothHandle handle, char *buffer, size_t bufferSize, int timeoutMs)
{
    size_t used = 0;
    if (!buffer || bufferSize == 0) return -1;
    while (used + 1 < bufferSize)
    {
        char ch;
        int rc = CpmBluetooth_Receive(handle, &ch, 1, timeoutMs);
        if (rc <= 0) { buffer[used] = '\0'; return used ? (int)used : rc; }
        if (ch == '\n') break;
        if (ch != '\r') buffer[used++] = ch;
    }
    buffer[used] = '\0';
    return (int)used;
}

void CpmBluetooth_Close(CpmBluetoothHandle handle)
{
#if defined(_WIN32)
    if (handle != CPM_BLUETOOTH_INVALID) closesocket((SOCKET)handle);
#else
    (void)handle;
#endif
}
