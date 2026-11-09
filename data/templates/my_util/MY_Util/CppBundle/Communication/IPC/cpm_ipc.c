#define _POSIX_C_SOURCE 200112L
#include "cpm_ipc.h"

#include <stdio.h>
#include <string.h>

#if defined(_WIN32)
#include <windows.h>
#else
#include <errno.h>
#include <fcntl.h>
#include <sys/select.h>
#include <sys/socket.h>
#include <sys/un.h>
#include <unistd.h>
#endif

static uint32_t CpmIpc_ToBe32(uint32_t value)
{
    return ((value & 0x000000FFu) << 24) | ((value & 0x0000FF00u) << 8) | ((value & 0x00FF0000u) >> 8) | ((value & 0xFF000000u) >> 24);
}

void CpmIpc_Init(CpmIpcPipe *pipeObj)
{
    if (!pipeObj) return;
    memset(pipeObj, 0, sizeof(*pipeObj));
    pipeObj->handle = -1;
    pipeObj->listenHandle = -1;
}

static int CpmIpc_NormalizeName(const char *name, char *buffer, size_t size)
{
    if (!name || !*name || !buffer || size == 0) return -1;
#if defined(_WIN32)
    if (strncmp(name, "\\\\.\\pipe\\", 9) == 0) snprintf(buffer, size, "%s", name);
    else snprintf(buffer, size, "\\\\.\\pipe\\%s", name);
#else
    if (name[0] == '/') snprintf(buffer, size, "%s", name);
    else snprintf(buffer, size, "/tmp/%s.sock", name);
#endif
    return 0;
}

int CpmIpc_CreateServer(CpmIpcPipe *pipeObj, const char *name)
{
    char fullName[256];
    if (!pipeObj || CpmIpc_NormalizeName(name, fullName, sizeof(fullName)) != 0) return -1;
    CpmIpc_Close(pipeObj);
#if defined(_WIN32)
    {
        HANDLE h = CreateNamedPipeA(fullName, PIPE_ACCESS_DUPLEX, PIPE_TYPE_BYTE | PIPE_READMODE_BYTE | PIPE_WAIT, 1, 65536, 65536, 0, NULL);
        if (h == INVALID_HANDLE_VALUE) return -2;
        pipeObj->listenHandle = (intptr_t)h;
    }
#else
    {
        int fd = socket(AF_UNIX, SOCK_STREAM, 0);
        struct sockaddr_un addr;
        if (fd < 0) return -2;
        memset(&addr, 0, sizeof(addr)); addr.sun_family = AF_UNIX;
        if (strlen(fullName) >= sizeof(addr.sun_path)) { close(fd); return -4; }
        strcpy(addr.sun_path, fullName);
        unlink(addr.sun_path);
        if (bind(fd, (struct sockaddr *)&addr, sizeof(addr)) != 0 || listen(fd, 4) != 0) { close(fd); unlink(addr.sun_path); return -3; }
        pipeObj->listenHandle = (intptr_t)fd;
    }
#endif
    pipeObj->server = 1;
    snprintf(pipeObj->name, sizeof(pipeObj->name), "%s", fullName);
    return 0;
}

int CpmIpc_WaitClient(CpmIpcPipe *pipeObj, int timeoutMs)
{
    if (!pipeObj || !pipeObj->server || pipeObj->listenHandle == -1 || pipeObj->opened) return -1;
#if defined(_WIN32)
    {
        HANDLE h = (HANDLE)pipeObj->listenHandle;
        /* This compact synchronous named-pipe backend cannot time out ConnectNamedPipe
           without switching all I/O to overlapped mode. The client-side connect timeout
           remains supported through WaitNamedPipe; server accept therefore blocks on Windows. */
        (void)timeoutMs;
        if (!ConnectNamedPipe(h, NULL) && GetLastError() != ERROR_PIPE_CONNECTED) return -2;
        pipeObj->handle = pipeObj->listenHandle;
        pipeObj->opened = 1;
        return 0;
    }
#else
    {
        int fd = (int)pipeObj->listenHandle;
        fd_set set; struct timeval tv; int rc;
        FD_ZERO(&set); FD_SET(fd, &set);
        tv.tv_sec = timeoutMs < 0 ? 0 : timeoutMs / 1000;
        tv.tv_usec = timeoutMs < 0 ? 0 : (timeoutMs % 1000) * 1000;
        rc = select(fd + 1, &set, NULL, NULL, timeoutMs < 0 ? NULL : &tv);
        if (rc <= 0) return rc == 0 ? 1 : -2;
        pipeObj->handle = (intptr_t)accept(fd, NULL, NULL);
        if (pipeObj->handle < 0) return -3;
        pipeObj->opened = 1;
        return 0;
    }
#endif
}

int CpmIpc_DisconnectClient(CpmIpcPipe *pipeObj)
{
    if (!pipeObj || !pipeObj->server || !pipeObj->opened) return -1;
#if defined(_WIN32)
    FlushFileBuffers((HANDLE)pipeObj->handle);
    if (!DisconnectNamedPipe((HANDLE)pipeObj->handle)) return -2;
    pipeObj->handle = -1;
#else
    close((int)pipeObj->handle);
    pipeObj->handle = -1;
#endif
    pipeObj->opened = 0;
    return 0;
}

int CpmIpc_Connect(CpmIpcPipe *pipeObj, const char *name, int timeoutMs)
{
    char fullName[256];
    if (!pipeObj || CpmIpc_NormalizeName(name, fullName, sizeof(fullName)) != 0) return -1;
    CpmIpc_Close(pipeObj);
#if defined(_WIN32)
    {
        DWORD waitMs = timeoutMs < 0 ? NMPWAIT_WAIT_FOREVER : (DWORD)timeoutMs;
        HANDLE h;
        if (!WaitNamedPipeA(fullName, waitMs)) return -2;
        h = CreateFileA(fullName, GENERIC_READ | GENERIC_WRITE, 0, NULL, OPEN_EXISTING, 0, NULL);
        if (h == INVALID_HANDLE_VALUE) return -3;
        pipeObj->handle = (intptr_t)h;
    }
#else
    {
        int fd = socket(AF_UNIX, SOCK_STREAM, 0);
        struct sockaddr_un addr;
        if (fd < 0) return -2;
        memset(&addr, 0, sizeof(addr)); addr.sun_family = AF_UNIX;
        if (strlen(fullName) >= sizeof(addr.sun_path)) { close(fd); return -4; }
        strcpy(addr.sun_path, fullName);
        if (timeoutMs >= 0)
        {
            int flags = fcntl(fd, F_GETFL, 0);
            fd_set set; struct timeval tv; int rc; int error = 0; socklen_t errorLen = sizeof(error);
            fcntl(fd, F_SETFL, flags | O_NONBLOCK);
            if (connect(fd, (struct sockaddr *)&addr, sizeof(addr)) != 0 && errno != EINPROGRESS) { close(fd); return -3; }
            FD_ZERO(&set); FD_SET(fd, &set); tv.tv_sec = timeoutMs / 1000; tv.tv_usec = (timeoutMs % 1000) * 1000;
            rc = select(fd + 1, NULL, &set, NULL, &tv);
            if (rc <= 0 || getsockopt(fd, SOL_SOCKET, SO_ERROR, &error, &errorLen) != 0 || error != 0) { close(fd); return rc == 0 ? -5 : -3; }
            fcntl(fd, F_SETFL, flags);
        }
        else if (connect(fd, (struct sockaddr *)&addr, sizeof(addr)) != 0) { close(fd); return -3; }
        pipeObj->handle = (intptr_t)fd;
    }
#endif
    pipeObj->opened = 1;
    snprintf(pipeObj->name, sizeof(pipeObj->name), "%s", fullName);
    return 0;
}

int CpmIpc_Send(CpmIpcPipe *pipeObj, const void *data, size_t size)
{
    if (!pipeObj || !pipeObj->opened || (!data && size)) return -1;
#if defined(_WIN32)
    { DWORD written = 0; return WriteFile((HANDLE)pipeObj->handle, data, (DWORD)size, &written, NULL) ? (int)written : -2; }
#else
    { ssize_t n = send((int)pipeObj->handle, data, size, 0); return n < 0 ? -2 : (int)n; }
#endif
}

int CpmIpc_SendAll(CpmIpcPipe *pipeObj, const void *data, size_t size)
{
    const unsigned char *bytes = (const unsigned char *)data;
    size_t total = 0;
    if ((!data && size) || !pipeObj || !pipeObj->opened) return -1;
    while (total < size)
    {
        int n = CpmIpc_Send(pipeObj, bytes + total, size - total);
        if (n <= 0) return n < 0 ? n : -2;
        total += (size_t)n;
    }
    return (int)total;
}

int CpmIpc_Receive(CpmIpcPipe *pipeObj, void *data, size_t size, int timeoutMs)
{
    if (!pipeObj || !pipeObj->opened || !data || size == 0) return -1;
#if defined(_WIN32)
    {
        DWORD start = GetTickCount();
        for (;;)
        {
            DWORD available = 0;
            if (!PeekNamedPipe((HANDLE)pipeObj->handle, NULL, 0, NULL, &available, NULL)) return -2;
            if (available > 0) break;
            if (timeoutMs == 0) return 0;
            if (timeoutMs > 0 && (int)(GetTickCount() - start) >= timeoutMs) return 0;
            Sleep(1);
        }
        { DWORD readCount = 0; return ReadFile((HANDLE)pipeObj->handle, data, (DWORD)size, &readCount, NULL) ? (int)readCount : -2; }
    }
#else
    {
        int fd = (int)pipeObj->handle; fd_set set; struct timeval tv; int rc;
        FD_ZERO(&set); FD_SET(fd, &set);
        tv.tv_sec = timeoutMs < 0 ? 0 : timeoutMs / 1000;
        tv.tv_usec = timeoutMs < 0 ? 0 : (timeoutMs % 1000) * 1000;
        rc = select(fd + 1, &set, NULL, NULL, timeoutMs < 0 ? NULL : &tv);
        if (rc <= 0) return rc;
        { ssize_t n = recv(fd, data, size, 0); return n < 0 ? -2 : (int)n; }
    }
#endif
}

int CpmIpc_ReceiveExact(CpmIpcPipe *pipeObj, void *data, size_t size, int timeoutMs)
{
    unsigned char *bytes = (unsigned char *)data;
    size_t total = 0;
    if (!data || size == 0) return -1;
    while (total < size)
    {
        int n = CpmIpc_Receive(pipeObj, bytes + total, size - total, timeoutMs);
        if (n <= 0) return total ? (int)total : n;
        total += (size_t)n;
    }
    return (int)total;
}

int CpmIpc_SendMessage(CpmIpcPipe *pipeObj, const void *data, uint32_t size)
{
    uint32_t header = CpmIpc_ToBe32(size);
    if ((!data && size) || !pipeObj) return -1;
    if (CpmIpc_SendAll(pipeObj, &header, sizeof(header)) != (int)sizeof(header)) return -2;
    return size == 0 ? 0 : (CpmIpc_SendAll(pipeObj, data, size) == (int)size ? (int)size : -3);
}

int CpmIpc_ReceiveMessage(CpmIpcPipe *pipeObj, void *data, size_t capacity, uint32_t *messageSize, int timeoutMs)
{
    uint32_t header = 0;
    uint32_t size;
    if (!pipeObj || !messageSize) return -1;
    if (CpmIpc_ReceiveExact(pipeObj, &header, sizeof(header), timeoutMs) != (int)sizeof(header)) return -2;
    size = CpmIpc_ToBe32(header);
    *messageSize = size;
    if (size > capacity) return -3;
    if (size == 0) return 0;
    if (!data) return -1;
    return CpmIpc_ReceiveExact(pipeObj, data, size, timeoutMs) == (int)size ? (int)size : -4;
}

int CpmIpc_IsOpen(const CpmIpcPipe *pipeObj) { return pipeObj && pipeObj->opened; }

void CpmIpc_Close(CpmIpcPipe *pipeObj)
{
    if (!pipeObj) return;
#if defined(_WIN32)
    if (pipeObj->server)
    {
        if (pipeObj->opened && pipeObj->listenHandle != -1) DisconnectNamedPipe((HANDLE)pipeObj->listenHandle);
        if (pipeObj->listenHandle != -1) CloseHandle((HANDLE)pipeObj->listenHandle);
    }
    else if (pipeObj->opened && pipeObj->handle != -1) CloseHandle((HANDLE)pipeObj->handle);
#else
    if (pipeObj->opened && pipeObj->handle >= 0) close((int)pipeObj->handle);
    if (pipeObj->listenHandle >= 0) close((int)pipeObj->listenHandle);
    if (pipeObj->server && pipeObj->name[0]) unlink(pipeObj->name);
#endif
    CpmIpc_Init(pipeObj);
}
