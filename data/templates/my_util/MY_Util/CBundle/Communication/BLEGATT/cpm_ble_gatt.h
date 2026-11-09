#ifndef CPM_BLE_GATT_H
#define CPM_BLE_GATT_H
#include <stddef.h>
#include <stdint.h>
#ifdef __cplusplus
extern "C" {
#endif
#define CPM_BLE_UUID_TEXT 48
typedef struct CpmBleDeviceInfo { char path[512]; char name[256]; } CpmBleDeviceInfo;
typedef struct CpmBleGattDevice { intptr_t handle; char path[512]; } CpmBleGattDevice;
typedef struct CpmBleGattService { char uuid[CPM_BLE_UUID_TEXT]; uint16_t attributeHandle; unsigned char native[48]; } CpmBleGattService;
typedef struct CpmBleGattCharacteristic { char uuid[CPM_BLE_UUID_TEXT]; uint16_t attributeHandle; int readable,writable,writeWithoutResponse,notifiable,indicatable; unsigned char native[96]; } CpmBleGattCharacteristic;
int CpmBleGatt_IsSupported(void);
int CpmBleGatt_Enumerate(CpmBleDeviceInfo *items,size_t capacity,size_t *count);
void CpmBleGatt_Init(CpmBleGattDevice *device);
int CpmBleGatt_OpenPath(CpmBleGattDevice *device,const char *path);
void CpmBleGatt_Close(CpmBleGattDevice *device);
int CpmBleGatt_GetServices(CpmBleGattDevice *device,CpmBleGattService *items,size_t capacity,size_t *count);
int CpmBleGatt_GetCharacteristics(CpmBleGattDevice *device,const CpmBleGattService *service,CpmBleGattCharacteristic *items,size_t capacity,size_t *count);
int CpmBleGatt_Read(CpmBleGattDevice *device,const CpmBleGattCharacteristic *characteristic,void *data,size_t capacity,size_t *dataSize);
int CpmBleGatt_Write(CpmBleGattDevice *device,const CpmBleGattCharacteristic *characteristic,const void *data,size_t size,int withoutResponse);
const char *CpmBleGatt_LastErrorText(void);
#ifdef __cplusplus
}
#endif
#endif
