#ifndef CPM_WIFI_H
#define CPM_WIFI_H

#include "cpm_socket.h"

#ifdef __cplusplus
extern "C" {
#endif

/* Wi-Fi transport uses the regular IP stack after the OS has associated with an AP. */
typedef CpmSocketHandle CpmWifiHandle;

int CpmWifi_Startup(void);
void CpmWifi_Cleanup(void);
CpmWifiHandle CpmWifi_TcpConnect(const char *host, uint16_t port, int timeoutMs);
CpmWifiHandle CpmWifi_UdpOpen(const char *bindAddress, uint16_t localPort, int enableBroadcast);
int CpmWifi_Send(CpmWifiHandle handle, const void *data, size_t size);
int CpmWifi_Receive(CpmWifiHandle handle, void *data, size_t size, int timeoutMs);
int CpmWifi_UdpSendTo(CpmWifiHandle handle, const char *host, uint16_t port, const void *data, size_t size);
int CpmWifi_UdpReceiveFrom(CpmWifiHandle handle, void *data, size_t size, int timeoutMs,
                           char *peerAddress, size_t peerAddressSize, uint16_t *peerPort);
void CpmWifi_Close(CpmWifiHandle handle);

#ifdef __cplusplus
}
#endif
#endif
