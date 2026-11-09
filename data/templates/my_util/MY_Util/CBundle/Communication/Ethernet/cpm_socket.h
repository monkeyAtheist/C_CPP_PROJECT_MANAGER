#ifndef CPM_SOCKET_H
#define CPM_SOCKET_H

#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef intptr_t CpmSocketHandle;
#define CPM_SOCKET_INVALID ((CpmSocketHandle)-1)

typedef struct CpmSocketEndpoint
{
    char address[128];
    uint16_t port;
} CpmSocketEndpoint;

int CpmSocket_Startup(void);
void CpmSocket_Cleanup(void);
void CpmSocket_Close(CpmSocketHandle socketHandle);
int CpmSocket_Shutdown(CpmSocketHandle socketHandle, int shutdownRead, int shutdownWrite);

CpmSocketHandle CpmSocket_TcpConnect(const char *host, uint16_t port, int timeoutMs);
CpmSocketHandle CpmSocket_TcpListen(const char *bindAddress, uint16_t port, int backlog);
CpmSocketHandle CpmSocket_TcpAccept(CpmSocketHandle listener, char *peerAddress, size_t peerAddressSize, uint16_t *peerPort);
CpmSocketHandle CpmSocket_TcpAcceptTimeout(CpmSocketHandle listener, int timeoutMs, CpmSocketEndpoint *peer);
int CpmSocket_SendAll(CpmSocketHandle socketHandle, const void *data, size_t size);
int CpmSocket_Receive(CpmSocketHandle socketHandle, void *data, size_t size, int timeoutMs);
int CpmSocket_ReceiveExact(CpmSocketHandle socketHandle, void *data, size_t size, int timeoutMs);
int CpmSocket_ReceiveUntil(CpmSocketHandle socketHandle, char *buffer, size_t bufferSize, const char *terminator, int timeoutMs);
int CpmSocket_ReceiveLine(CpmSocketHandle socketHandle, char *buffer, size_t bufferSize, int timeoutMs);

CpmSocketHandle CpmSocket_UdpOpen(const char *bindAddress, uint16_t localPort, int enableBroadcast);
int CpmSocket_UdpConnect(CpmSocketHandle socketHandle, const char *host, uint16_t port);
int CpmSocket_UdpSend(CpmSocketHandle socketHandle, const void *data, size_t size);
int CpmSocket_UdpReceive(CpmSocketHandle socketHandle, void *data, size_t size, int timeoutMs);
int CpmSocket_UdpSendTo(CpmSocketHandle socketHandle, const char *host, uint16_t port, const void *data, size_t size);
int CpmSocket_UdpReceiveFrom(CpmSocketHandle socketHandle, void *data, size_t size, int timeoutMs,
                             char *peerAddress, size_t peerAddressSize, uint16_t *peerPort);
int CpmSocket_UdpJoinMulticast(CpmSocketHandle socketHandle, const char *multicastAddress, const char *interfaceAddress);
int CpmSocket_UdpLeaveMulticast(CpmSocketHandle socketHandle, const char *multicastAddress, const char *interfaceAddress);
int CpmSocket_UdpSetMulticastTtl(CpmSocketHandle socketHandle, int ttl);
int CpmSocket_UdpSetMulticastLoop(CpmSocketHandle socketHandle, int enabled);

int CpmSocket_WaitReadable(CpmSocketHandle socketHandle, int timeoutMs);
int CpmSocket_WaitWritable(CpmSocketHandle socketHandle, int timeoutMs);
int CpmSocket_SetNoDelay(CpmSocketHandle socketHandle, int enabled);
int CpmSocket_SetKeepAlive(CpmSocketHandle socketHandle, int enabled);
int CpmSocket_SetReuseAddress(CpmSocketHandle socketHandle, int enabled);
int CpmSocket_SetBufferSizes(CpmSocketHandle socketHandle, int receiveBytes, int sendBytes);
int CpmSocket_GetLocalEndpoint(CpmSocketHandle socketHandle, CpmSocketEndpoint *endpoint);
int CpmSocket_GetPeerEndpoint(CpmSocketHandle socketHandle, CpmSocketEndpoint *endpoint);
int CpmSocket_ResolveFirst(const char *host, char *address, size_t addressSize);

const char *CpmSocket_LastErrorText(void);

#ifdef __cplusplus
}
#endif
#endif
