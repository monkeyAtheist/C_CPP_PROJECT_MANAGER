#ifndef CPM_BLUETOOTH_H
#define CPM_BLUETOOTH_H

#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef intptr_t CpmBluetoothHandle;
#define CPM_BLUETOOTH_INVALID ((CpmBluetoothHandle)-1)

int CpmBluetooth_Startup(void);
void CpmBluetooth_Cleanup(void);
CpmBluetoothHandle CpmBluetooth_RfcommConnect(const char *bluetoothAddress, uint32_t channel, int timeoutMs);
int CpmBluetooth_Send(CpmBluetoothHandle handle, const void *data, size_t size);
int CpmBluetooth_SendAll(CpmBluetoothHandle handle, const void *data, size_t size);
int CpmBluetooth_Receive(CpmBluetoothHandle handle, void *data, size_t size, int timeoutMs);
int CpmBluetooth_ReceiveExact(CpmBluetoothHandle handle, void *data, size_t size, int timeoutMs);
int CpmBluetooth_ReadLine(CpmBluetoothHandle handle, char *buffer, size_t bufferSize, int timeoutMs);
void CpmBluetooth_Close(CpmBluetoothHandle handle);

#ifdef __cplusplus
}
#endif
#endif
