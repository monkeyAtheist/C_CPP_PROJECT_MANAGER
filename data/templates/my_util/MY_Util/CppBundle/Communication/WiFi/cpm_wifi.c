#include "cpm_wifi.h"

int CpmWifi_Startup(void) { return CpmSocket_Startup(); }
void CpmWifi_Cleanup(void) { CpmSocket_Cleanup(); }
CpmWifiHandle CpmWifi_TcpConnect(const char *host, uint16_t port, int timeoutMs) { return CpmSocket_TcpConnect(host, port, timeoutMs); }
CpmWifiHandle CpmWifi_UdpOpen(const char *bindAddress, uint16_t localPort, int enableBroadcast) { return CpmSocket_UdpOpen(bindAddress, localPort, enableBroadcast); }
int CpmWifi_Send(CpmWifiHandle handle, const void *data, size_t size) { return CpmSocket_SendAll(handle, data, size); }
int CpmWifi_Receive(CpmWifiHandle handle, void *data, size_t size, int timeoutMs) { return CpmSocket_Receive(handle, data, size, timeoutMs); }
int CpmWifi_UdpSendTo(CpmWifiHandle handle, const char *host, uint16_t port, const void *data, size_t size) { return CpmSocket_UdpSendTo(handle, host, port, data, size); }
int CpmWifi_UdpReceiveFrom(CpmWifiHandle handle, void *data, size_t size, int timeoutMs, char *peerAddress, size_t peerAddressSize, uint16_t *peerPort) { return CpmSocket_UdpReceiveFrom(handle, data, size, timeoutMs, peerAddress, peerAddressSize, peerPort); }
void CpmWifi_Close(CpmWifiHandle handle) { CpmSocket_Close(handle); }
