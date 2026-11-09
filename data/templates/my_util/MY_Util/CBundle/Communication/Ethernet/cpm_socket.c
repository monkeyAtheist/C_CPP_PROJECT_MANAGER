#define _DEFAULT_SOURCE
#define _POSIX_C_SOURCE 200112L
#include "cpm_socket.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#if defined(_WIN32)
#include <winsock2.h>
#include <ws2tcpip.h>
typedef SOCKET CpmNativeSocket;
typedef int CpmSockLen;
#define CPM_NATIVE_INVALID INVALID_SOCKET
#define CPM_CLOSESOCKET closesocket
#define CPM_SOCKET_SEND_FLAGS 0
#else
#include <arpa/inet.h>
#include <errno.h>
#include <fcntl.h>
#include <netdb.h>
#include <netinet/tcp.h>
#include <sys/select.h>
#include <sys/socket.h>
#include <unistd.h>
typedef int CpmNativeSocket;
typedef socklen_t CpmSockLen;
#define CPM_NATIVE_INVALID (-1)
#define CPM_CLOSESOCKET close
#ifdef MSG_NOSIGNAL
#define CPM_SOCKET_SEND_FLAGS MSG_NOSIGNAL
#else
#define CPM_SOCKET_SEND_FLAGS 0
#endif
#endif

static char g_cpmSocketError[256];

static void CpmSocket_SetError(const char *text)
{
    snprintf(g_cpmSocketError, sizeof(g_cpmSocketError), "%s", text ? text : "Unknown socket error");
}

static void CpmSocket_SetSystemError(const char *prefix)
{
#if defined(_WIN32)
    snprintf(g_cpmSocketError, sizeof(g_cpmSocketError), "%s (WSA %d)", prefix, WSAGetLastError());
#else
    snprintf(g_cpmSocketError, sizeof(g_cpmSocketError), "%s (%s)", prefix, strerror(errno));
#endif
}

const char *CpmSocket_LastErrorText(void) { return g_cpmSocketError; }

int CpmSocket_Startup(void)
{
#if defined(_WIN32)
    WSADATA data;
    if (WSAStartup(MAKEWORD(2, 2), &data) != 0) { CpmSocket_SetSystemError("WSAStartup failed"); return -1; }
#endif
    return 0;
}

void CpmSocket_Cleanup(void)
{
#if defined(_WIN32)
    WSACleanup();
#endif
}

static CpmSocketHandle CpmSocket_FromNative(CpmNativeSocket s) { return (CpmSocketHandle)s; }
static CpmNativeSocket CpmSocket_ToNative(CpmSocketHandle s) { return (CpmNativeSocket)s; }

void CpmSocket_Close(CpmSocketHandle socketHandle)
{
    if (socketHandle != CPM_SOCKET_INVALID) CPM_CLOSESOCKET(CpmSocket_ToNative(socketHandle));
}

int CpmSocket_Shutdown(CpmSocketHandle socketHandle, int shutdownRead, int shutdownWrite)
{
    int how;
    if (socketHandle == CPM_SOCKET_INVALID || (!shutdownRead && !shutdownWrite)) return -1;
#if defined(_WIN32)
    how = shutdownRead && shutdownWrite ? SD_BOTH : shutdownRead ? SD_RECEIVE : SD_SEND;
#else
    how = shutdownRead && shutdownWrite ? SHUT_RDWR : shutdownRead ? SHUT_RD : SHUT_WR;
#endif
    return shutdown(CpmSocket_ToNative(socketHandle), how) == 0 ? 0 : -2;
}

static int CpmSocket_WaitNative(CpmNativeSocket s, int writeReady, int timeoutMs)
{
    fd_set set;
    struct timeval tv;
    int rc;
    FD_ZERO(&set); FD_SET(s, &set);
    tv.tv_sec = timeoutMs < 0 ? 0 : timeoutMs / 1000;
    tv.tv_usec = timeoutMs < 0 ? 0 : (timeoutMs % 1000) * 1000;
    rc = select((int)s + 1, writeReady ? NULL : &set, writeReady ? &set : NULL, NULL, timeoutMs < 0 ? NULL : &tv);
    return rc > 0 ? 1 : (rc == 0 ? 0 : -1);
}

int CpmSocket_WaitReadable(CpmSocketHandle socketHandle, int timeoutMs)
{
    return socketHandle == CPM_SOCKET_INVALID ? -1 : CpmSocket_WaitNative(CpmSocket_ToNative(socketHandle), 0, timeoutMs);
}

int CpmSocket_WaitWritable(CpmSocketHandle socketHandle, int timeoutMs)
{
    return socketHandle == CPM_SOCKET_INVALID ? -1 : CpmSocket_WaitNative(CpmSocket_ToNative(socketHandle), 1, timeoutMs);
}

static int CpmSocket_Resolve(const char *host, uint16_t port, int socktype, int passive, struct addrinfo **result)
{
    struct addrinfo hints;
    char portText[16];
    int rc;
    memset(&hints, 0, sizeof(hints));
    hints.ai_family = AF_UNSPEC;
    hints.ai_socktype = socktype;
    hints.ai_flags = passive ? AI_PASSIVE : 0;
    snprintf(portText, sizeof(portText), "%u", (unsigned)port);
    rc = getaddrinfo((host && host[0]) ? host : NULL, portText, &hints, result);
    if (rc != 0)
    {
#if defined(_WIN32)
        snprintf(g_cpmSocketError, sizeof(g_cpmSocketError), "getaddrinfo failed (%d)", rc);
#else
        snprintf(g_cpmSocketError, sizeof(g_cpmSocketError), "getaddrinfo failed (%s)", gai_strerror(rc));
#endif
        return -1;
    }
    return 0;
}

int CpmSocket_ResolveFirst(const char *host, char *address, size_t addressSize)
{
    struct addrinfo *list = NULL;
    int rc;
    if (!host || !*host || !address || addressSize == 0) return -1;
    if (CpmSocket_Resolve(host, 0, SOCK_STREAM, 0, &list) != 0) return -2;
    rc = getnameinfo(list->ai_addr, (CpmSockLen)list->ai_addrlen, address, (CpmSockLen)addressSize, NULL, 0, NI_NUMERICHOST);
    freeaddrinfo(list);
    return rc == 0 ? 0 : -3;
}

static int CpmSocket_SetBlocking(CpmNativeSocket s, int blocking)
{
#if defined(_WIN32)
    u_long mode = blocking ? 0UL : 1UL;
    return ioctlsocket(s, FIONBIO, &mode) == 0 ? 0 : -1;
#else
    int flags = fcntl(s, F_GETFL, 0);
    if (flags < 0) return -1;
    return fcntl(s, F_SETFL, blocking ? (flags & ~O_NONBLOCK) : (flags | O_NONBLOCK)) == 0 ? 0 : -1;
#endif
}

CpmSocketHandle CpmSocket_TcpConnect(const char *host, uint16_t port, int timeoutMs)
{
    struct addrinfo *list = NULL, *it;
    CpmNativeSocket s = CPM_NATIVE_INVALID;
    if (!host || !host[0] || CpmSocket_Resolve(host, port, SOCK_STREAM, 0, &list) != 0) return CPM_SOCKET_INVALID;
    for (it = list; it; it = it->ai_next)
    {
        s = socket(it->ai_family, it->ai_socktype, it->ai_protocol);
        if (s == CPM_NATIVE_INVALID) continue;
        if (CpmSocket_SetBlocking(s, 0) != 0) { CPM_CLOSESOCKET(s); continue; }
        if (connect(s, it->ai_addr, (int)it->ai_addrlen) == 0 || CpmSocket_WaitNative(s, 1, timeoutMs) == 1)
        {
            int error = 0;
            CpmSockLen errorSize = (CpmSockLen)sizeof(error);
            if (getsockopt(s, SOL_SOCKET, SO_ERROR, (char *)&error, &errorSize) == 0 && error == 0)
            {
                (void)CpmSocket_SetBlocking(s, 1);
                freeaddrinfo(list);
                return CpmSocket_FromNative(s);
            }
        }
        CPM_CLOSESOCKET(s); s = CPM_NATIVE_INVALID;
    }
    freeaddrinfo(list);
    CpmSocket_SetError("TCP connection failed");
    return CPM_SOCKET_INVALID;
}

CpmSocketHandle CpmSocket_TcpListen(const char *bindAddress, uint16_t port, int backlog)
{
    struct addrinfo *list = NULL, *it;
    CpmNativeSocket s = CPM_NATIVE_INVALID;
    if (CpmSocket_Resolve(bindAddress, port, SOCK_STREAM, 1, &list) != 0) return CPM_SOCKET_INVALID;
    for (it = list; it; it = it->ai_next)
    {
        int reuse = 1;
        s = socket(it->ai_family, it->ai_socktype, it->ai_protocol);
        if (s == CPM_NATIVE_INVALID) continue;
        setsockopt(s, SOL_SOCKET, SO_REUSEADDR, (const char *)&reuse, (CpmSockLen)sizeof(reuse));
        if (bind(s, it->ai_addr, (int)it->ai_addrlen) == 0 && listen(s, backlog > 0 ? backlog : 4) == 0)
        {
            freeaddrinfo(list);
            return CpmSocket_FromNative(s);
        }
        CPM_CLOSESOCKET(s);
    }
    freeaddrinfo(list);
    CpmSocket_SetSystemError("TCP listen failed");
    return CPM_SOCKET_INVALID;
}

static int CpmSocket_EndpointFromSockaddr(const struct sockaddr *address, CpmSockLen addressSize, CpmSocketEndpoint *endpoint)
{
    char host[128];
    char service[32];
    if (!endpoint) return -1;
    memset(endpoint, 0, sizeof(*endpoint));
    if (getnameinfo(address, addressSize, host, sizeof(host), service, sizeof(service), NI_NUMERICHOST | NI_NUMERICSERV) != 0) return -2;
    snprintf(endpoint->address, sizeof(endpoint->address), "%s", host);
    endpoint->port = (uint16_t)strtoul(service, NULL, 10);
    return 0;
}

CpmSocketHandle CpmSocket_TcpAccept(CpmSocketHandle listener, char *peerAddress, size_t peerAddressSize, uint16_t *peerPort)
{
    struct sockaddr_storage peer;
    CpmSockLen peerSize = (CpmSockLen)sizeof(peer);
    CpmNativeSocket accepted;
    if (listener == CPM_SOCKET_INVALID) return CPM_SOCKET_INVALID;
    accepted = accept(CpmSocket_ToNative(listener), (struct sockaddr *)&peer, &peerSize);
    if (accepted == CPM_NATIVE_INVALID) return CPM_SOCKET_INVALID;
    if (peerAddress && peerAddressSize)
    {
        CpmSocketEndpoint endpoint;
        if (CpmSocket_EndpointFromSockaddr((struct sockaddr *)&peer, peerSize, &endpoint) == 0)
        {
            snprintf(peerAddress, peerAddressSize, "%s", endpoint.address);
            if (peerPort) *peerPort = endpoint.port;
        }
    }
    return CpmSocket_FromNative(accepted);
}

CpmSocketHandle CpmSocket_TcpAcceptTimeout(CpmSocketHandle listener, int timeoutMs, CpmSocketEndpoint *peer)
{
    struct sockaddr_storage address;
    CpmSockLen addressSize = (CpmSockLen)sizeof(address);
    CpmNativeSocket accepted;
    int ready = CpmSocket_WaitReadable(listener, timeoutMs);
    if (ready <= 0) return CPM_SOCKET_INVALID;
    accepted = accept(CpmSocket_ToNative(listener), (struct sockaddr *)&address, &addressSize);
    if (accepted == CPM_NATIVE_INVALID) return CPM_SOCKET_INVALID;
    if (peer) (void)CpmSocket_EndpointFromSockaddr((struct sockaddr *)&address, addressSize, peer);
    return CpmSocket_FromNative(accepted);
}

int CpmSocket_SendAll(CpmSocketHandle socketHandle, const void *data, size_t size)
{
    const unsigned char *bytes = (const unsigned char *)data;
    size_t sentTotal = 0;
    if ((!data && size) || socketHandle == CPM_SOCKET_INVALID) return -1;
    while (sentTotal < size)
    {
        int sent = send(CpmSocket_ToNative(socketHandle), (const char *)bytes + sentTotal, (int)(size - sentTotal), CPM_SOCKET_SEND_FLAGS);
        if (sent <= 0) { CpmSocket_SetSystemError("send failed"); return -2; }
        sentTotal += (size_t)sent;
    }
    return (int)sentTotal;
}

int CpmSocket_Receive(CpmSocketHandle socketHandle, void *data, size_t size, int timeoutMs)
{
    int ready;
    if (!data || size == 0 || socketHandle == CPM_SOCKET_INVALID) return -1;
    ready = CpmSocket_WaitReadable(socketHandle, timeoutMs);
    if (ready <= 0) return ready;
    {
        int n = recv(CpmSocket_ToNative(socketHandle), (char *)data, (int)size, CPM_SOCKET_SEND_FLAGS);
        if (n < 0) CpmSocket_SetSystemError("recv failed");
        return n;
    }
}

int CpmSocket_ReceiveExact(CpmSocketHandle socketHandle, void *data, size_t size, int timeoutMs)
{
    unsigned char *bytes = (unsigned char *)data;
    size_t total = 0;
    if (!data || size == 0) return -1;
    while (total < size)
    {
        int n = CpmSocket_Receive(socketHandle, bytes + total, size - total, timeoutMs);
        if (n <= 0) return total ? (int)total : n;
        total += (size_t)n;
    }
    return (int)total;
}

int CpmSocket_ReceiveUntil(CpmSocketHandle socketHandle, char *buffer, size_t bufferSize, const char *terminator, int timeoutMs)
{
    size_t used = 0;
    size_t termLen;
    if (!buffer || bufferSize == 0 || !terminator || !(termLen = strlen(terminator))) return -1;
    while (used + 1 < bufferSize)
    {
        char ch;
        int n = CpmSocket_Receive(socketHandle, &ch, 1, timeoutMs);
        if (n <= 0) { buffer[used] = '\0'; return used ? (int)used : n; }
        buffer[used++] = ch; buffer[used] = '\0';
        if (used >= termLen && memcmp(buffer + used - termLen, terminator, termLen) == 0) return (int)used;
    }
    return (int)used;
}

int CpmSocket_ReceiveLine(CpmSocketHandle socketHandle, char *buffer, size_t bufferSize, int timeoutMs)
{
    int rc = CpmSocket_ReceiveUntil(socketHandle, buffer, bufferSize, "\n", timeoutMs);
    if (rc > 0)
    {
        size_t n = strlen(buffer);
        while (n && (buffer[n - 1] == '\n' || buffer[n - 1] == '\r')) buffer[--n] = '\0';
        return (int)n;
    }
    return rc;
}

CpmSocketHandle CpmSocket_UdpOpen(const char *bindAddress, uint16_t localPort, int enableBroadcast)
{
    struct addrinfo *list = NULL, *it;
    CpmNativeSocket s = CPM_NATIVE_INVALID;
    if (CpmSocket_Resolve(bindAddress, localPort, SOCK_DGRAM, 1, &list) != 0) return CPM_SOCKET_INVALID;
    for (it = list; it; it = it->ai_next)
    {
        int reuse = 1;
        s = socket(it->ai_family, it->ai_socktype, it->ai_protocol);
        if (s == CPM_NATIVE_INVALID) continue;
        setsockopt(s, SOL_SOCKET, SO_REUSEADDR, (const char *)&reuse, (CpmSockLen)sizeof(reuse));
        if (enableBroadcast) { int yes = 1; setsockopt(s, SOL_SOCKET, SO_BROADCAST, (const char *)&yes, (CpmSockLen)sizeof(yes)); }
        if (bind(s, it->ai_addr, (int)it->ai_addrlen) == 0) { freeaddrinfo(list); return CpmSocket_FromNative(s); }
        CPM_CLOSESOCKET(s);
    }
    freeaddrinfo(list);
    CpmSocket_SetSystemError("UDP bind failed");
    return CPM_SOCKET_INVALID;
}

int CpmSocket_UdpConnect(CpmSocketHandle socketHandle, const char *host, uint16_t port)
{
    struct addrinfo *list = NULL;
    int rc;
    if (socketHandle == CPM_SOCKET_INVALID || !host || !*host) return -1;
    if (CpmSocket_Resolve(host, port, SOCK_DGRAM, 0, &list) != 0) return -2;
    rc = connect(CpmSocket_ToNative(socketHandle), list->ai_addr, (int)list->ai_addrlen);
    freeaddrinfo(list);
    return rc == 0 ? 0 : -3;
}

int CpmSocket_UdpSend(CpmSocketHandle socketHandle, const void *data, size_t size)
{
    if (socketHandle == CPM_SOCKET_INVALID || (!data && size)) return -1;
    return send(CpmSocket_ToNative(socketHandle), (const char *)data, (int)size, CPM_SOCKET_SEND_FLAGS);
}

int CpmSocket_UdpReceive(CpmSocketHandle socketHandle, void *data, size_t size, int timeoutMs)
{
    return CpmSocket_Receive(socketHandle, data, size, timeoutMs);
}

int CpmSocket_UdpSendTo(CpmSocketHandle socketHandle, const char *host, uint16_t port, const void *data, size_t size)
{
    struct addrinfo *list = NULL;
    int sent;
    if (socketHandle == CPM_SOCKET_INVALID || !host || (!data && size)) return -1;
    if (CpmSocket_Resolve(host, port, SOCK_DGRAM, 0, &list) != 0) return -2;
    sent = sendto(CpmSocket_ToNative(socketHandle), (const char *)data, (int)size, CPM_SOCKET_SEND_FLAGS, list->ai_addr, (int)list->ai_addrlen);
    freeaddrinfo(list);
    return sent;
}

int CpmSocket_UdpReceiveFrom(CpmSocketHandle socketHandle, void *data, size_t size, int timeoutMs,
                             char *peerAddress, size_t peerAddressSize, uint16_t *peerPort)
{
    struct sockaddr_storage peer;
    CpmSockLen peerSize = (CpmSockLen)sizeof(peer);
    int ready, received;
    if (socketHandle == CPM_SOCKET_INVALID || !data || size == 0) return -1;
    ready = CpmSocket_WaitReadable(socketHandle, timeoutMs);
    if (ready <= 0) return ready;
    received = recvfrom(CpmSocket_ToNative(socketHandle), (char *)data, (int)size, 0, (struct sockaddr *)&peer, &peerSize);
    if (received >= 0 && peerAddress && peerAddressSize)
    {
        CpmSocketEndpoint endpoint;
        if (CpmSocket_EndpointFromSockaddr((struct sockaddr *)&peer, peerSize, &endpoint) == 0)
        {
            snprintf(peerAddress, peerAddressSize, "%s", endpoint.address);
            if (peerPort) *peerPort = endpoint.port;
        }
    }
    return received;
}

static int CpmSocket_Multicast(CpmSocketHandle socketHandle, const char *multicastAddress, const char *interfaceAddress, int join)
{
    struct ip_mreq request;
    if (socketHandle == CPM_SOCKET_INVALID || !multicastAddress) return -1;
    memset(&request, 0, sizeof(request));
    if (inet_pton(AF_INET, multicastAddress, &request.imr_multiaddr) != 1) return -2;
    if (interfaceAddress && *interfaceAddress)
    {
        if (inet_pton(AF_INET, interfaceAddress, &request.imr_interface) != 1) return -3;
    }
    else request.imr_interface.s_addr = htonl(INADDR_ANY);
    return setsockopt(CpmSocket_ToNative(socketHandle), IPPROTO_IP, join ? IP_ADD_MEMBERSHIP : IP_DROP_MEMBERSHIP,
                      (const char *)&request, (CpmSockLen)sizeof(request)) == 0 ? 0 : -4;
}

int CpmSocket_UdpJoinMulticast(CpmSocketHandle socketHandle, const char *multicastAddress, const char *interfaceAddress)
{ return CpmSocket_Multicast(socketHandle, multicastAddress, interfaceAddress, 1); }
int CpmSocket_UdpLeaveMulticast(CpmSocketHandle socketHandle, const char *multicastAddress, const char *interfaceAddress)
{ return CpmSocket_Multicast(socketHandle, multicastAddress, interfaceAddress, 0); }

int CpmSocket_UdpSetMulticastTtl(CpmSocketHandle socketHandle, int ttl)
{
    unsigned char value = (unsigned char)(ttl < 0 ? 0 : ttl > 255 ? 255 : ttl);
    return socketHandle == CPM_SOCKET_INVALID ? -1 : (setsockopt(CpmSocket_ToNative(socketHandle), IPPROTO_IP, IP_MULTICAST_TTL, (const char *)&value, (CpmSockLen)sizeof(value)) == 0 ? 0 : -2);
}

int CpmSocket_UdpSetMulticastLoop(CpmSocketHandle socketHandle, int enabled)
{
    unsigned char value = enabled ? 1U : 0U;
    return socketHandle == CPM_SOCKET_INVALID ? -1 : (setsockopt(CpmSocket_ToNative(socketHandle), IPPROTO_IP, IP_MULTICAST_LOOP, (const char *)&value, (CpmSockLen)sizeof(value)) == 0 ? 0 : -2);
}

int CpmSocket_SetNoDelay(CpmSocketHandle socketHandle, int enabled)
{
    int value = enabled ? 1 : 0;
    return socketHandle == CPM_SOCKET_INVALID ? -1 : (setsockopt(CpmSocket_ToNative(socketHandle), IPPROTO_TCP, TCP_NODELAY, (const char *)&value, (CpmSockLen)sizeof(value)) == 0 ? 0 : -2);
}

int CpmSocket_SetKeepAlive(CpmSocketHandle socketHandle, int enabled)
{
    int value = enabled ? 1 : 0;
    return socketHandle == CPM_SOCKET_INVALID ? -1 : (setsockopt(CpmSocket_ToNative(socketHandle), SOL_SOCKET, SO_KEEPALIVE, (const char *)&value, (CpmSockLen)sizeof(value)) == 0 ? 0 : -2);
}

int CpmSocket_SetReuseAddress(CpmSocketHandle socketHandle, int enabled)
{
    int value = enabled ? 1 : 0;
    return socketHandle == CPM_SOCKET_INVALID ? -1 : (setsockopt(CpmSocket_ToNative(socketHandle), SOL_SOCKET, SO_REUSEADDR, (const char *)&value, (CpmSockLen)sizeof(value)) == 0 ? 0 : -2);
}

int CpmSocket_SetBufferSizes(CpmSocketHandle socketHandle, int receiveBytes, int sendBytes)
{
    int rc = 0;
    if (socketHandle == CPM_SOCKET_INVALID) return -1;
    if (receiveBytes > 0 && setsockopt(CpmSocket_ToNative(socketHandle), SOL_SOCKET, SO_RCVBUF, (const char *)&receiveBytes, (CpmSockLen)sizeof(receiveBytes)) != 0) rc = -2;
    if (sendBytes > 0 && setsockopt(CpmSocket_ToNative(socketHandle), SOL_SOCKET, SO_SNDBUF, (const char *)&sendBytes, (CpmSockLen)sizeof(sendBytes)) != 0) rc = -3;
    return rc;
}

int CpmSocket_GetLocalEndpoint(CpmSocketHandle socketHandle, CpmSocketEndpoint *endpoint)
{
    struct sockaddr_storage address;
    CpmSockLen size = (CpmSockLen)sizeof(address);
    if (socketHandle == CPM_SOCKET_INVALID || !endpoint) return -1;
    if (getsockname(CpmSocket_ToNative(socketHandle), (struct sockaddr *)&address, &size) != 0) return -2;
    return CpmSocket_EndpointFromSockaddr((struct sockaddr *)&address, size, endpoint);
}

int CpmSocket_GetPeerEndpoint(CpmSocketHandle socketHandle, CpmSocketEndpoint *endpoint)
{
    struct sockaddr_storage address;
    CpmSockLen size = (CpmSockLen)sizeof(address);
    if (socketHandle == CPM_SOCKET_INVALID || !endpoint) return -1;
    if (getpeername(CpmSocket_ToNative(socketHandle), (struct sockaddr *)&address, &size) != 0) return -2;
    return CpmSocket_EndpointFromSockaddr((struct sockaddr *)&address, size, endpoint);
}
