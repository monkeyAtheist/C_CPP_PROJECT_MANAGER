#ifndef CPM_USB_H
#define CPM_USB_H
#include <stddef.h>
#include <stdint.h>
#ifdef __cplusplus
extern "C" {
#endif
#define CPM_USB_MAX_STRING 128
typedef struct CpmUsbRuntime { void *library; void *context; void *functions[16]; } CpmUsbRuntime;
typedef struct CpmUsbDevice { CpmUsbRuntime *runtime; void *handle; int claimedInterface; } CpmUsbDevice;
typedef struct CpmUsbDeviceInfo { uint16_t vendorId, productId; uint8_t busNumber, deviceAddress, deviceClass, deviceSubClass, deviceProtocol; char manufacturer[CPM_USB_MAX_STRING]; char product[CPM_USB_MAX_STRING]; char serialNumber[CPM_USB_MAX_STRING]; } CpmUsbDeviceInfo;
void CpmUsb_RuntimeInit(CpmUsbRuntime *runtime);
int CpmUsb_Load(CpmUsbRuntime *runtime);
int CpmUsb_LoadLibrary(CpmUsbRuntime *runtime,const char *path);
void CpmUsb_Unload(CpmUsbRuntime *runtime);
int CpmUsb_IsLoaded(const CpmUsbRuntime *runtime);
int CpmUsb_Enumerate(CpmUsbRuntime *runtime,CpmUsbDeviceInfo *items,size_t capacity,size_t *count);
void CpmUsb_DeviceInit(CpmUsbDevice *device);
int CpmUsb_OpenVidPid(CpmUsbRuntime *runtime,CpmUsbDevice *device,uint16_t vid,uint16_t pid,const char *serialNumber);
void CpmUsb_Close(CpmUsbDevice *device);
int CpmUsb_ClaimInterface(CpmUsbDevice *device,int interfaceNumber);
int CpmUsb_ReleaseInterface(CpmUsbDevice *device);
int CpmUsb_BulkTransfer(CpmUsbDevice *device,uint8_t endpoint,void *data,size_t size,int timeoutMs);
int CpmUsb_InterruptTransfer(CpmUsbDevice *device,uint8_t endpoint,void *data,size_t size,int timeoutMs);
int CpmUsb_ControlTransfer(CpmUsbDevice *device,uint8_t requestType,uint8_t request,uint16_t value,uint16_t index,void *data,uint16_t length,int timeoutMs);
const char *CpmUsb_LastErrorText(void);
#ifdef __cplusplus
}
#endif
#endif
