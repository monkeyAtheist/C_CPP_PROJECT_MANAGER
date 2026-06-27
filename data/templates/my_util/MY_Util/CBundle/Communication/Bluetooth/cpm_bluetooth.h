/**
 * @file cpm_bluetooth.h
 * @brief CPM C Bluetooth RFCOMM communication API.
 *
 * @par Example of use
 * @code{.c}
 * #include "cpm_bluetooth.h"
 * 
 * CpmBluetoothLink link;
 * CpmBluetooth_InitLibrary();
 * CpmBluetooth_Init(&link);
 * if (CpmBluetooth_OpenRfcommClient(&link, "00:11:22:33:44:55", 1) == 0)
 * {
 *     CpmBluetooth_Send(&link, "PING", 4, NULL);
 *     CpmBluetooth_Close(&link);
 * }
 * CpmBluetooth_ShutdownLibrary();
 * @endcode
 */
#ifndef CPM_BLUETOOTH_H
#define CPM_BLUETOOTH_H

#ifdef __cplusplus
extern "C" {
#endif

#include <stddef.h>

#ifdef _WIN32
#  ifndef WIN32_LEAN_AND_MEAN
#    define WIN32_LEAN_AND_MEAN
#  endif
#  include <winsock2.h>
#  include <ws2bth.h>
typedef SOCKET CpmBluetoothNativeHandle;
#else
typedef int CpmBluetoothNativeHandle;
#endif

typedef struct CpmBluetoothLink
{
    CpmBluetoothNativeHandle handle;
    int isOpen;
} CpmBluetoothLink;

void CpmBluetooth_Init(CpmBluetoothLink *link);
int CpmBluetooth_InitLibrary(void);
void CpmBluetooth_ShutdownLibrary(void);
int CpmBluetooth_OpenRfcommClient(CpmBluetoothLink *link, const char *address, unsigned int channel);
int CpmBluetooth_Send(CpmBluetoothLink *link, const void *data, size_t size, size_t *sent);
int CpmBluetooth_Receive(CpmBluetoothLink *link, void *buffer, size_t bufferSize, size_t *received);
void CpmBluetooth_Close(CpmBluetoothLink *link);
int CpmBluetooth_IsOpen(const CpmBluetoothLink *link);
const char *CpmBluetooth_LastError(void);

#ifdef __cplusplus
}
#endif

#endif /* CPM_BLUETOOTH_H */
