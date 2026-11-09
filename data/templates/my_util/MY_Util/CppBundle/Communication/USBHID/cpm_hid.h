#ifndef CPM_HID_H
#define CPM_HID_H

#include <stddef.h>
#include <stdint.h>
#include <wchar.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef struct CpmHidInfo
{
    char path[512];
    uint16_t vendorId;
    uint16_t productId;
    uint16_t versionNumber;
    wchar_t manufacturer[128];
    wchar_t product[128];
    wchar_t serialNumber[128];
} CpmHidInfo;

typedef int (*CpmHidEnumerateCallback)(const CpmHidInfo *info, void *context);

typedef struct CpmHidDevice
{
    intptr_t handle;
    int opened;
    uint16_t inputReportLength;
    uint16_t outputReportLength;
    uint16_t featureReportLength;
    char path[512];
} CpmHidDevice;

void CpmHid_Init(CpmHidDevice *device);
void CpmHid_Close(CpmHidDevice *device);
int CpmHid_Enumerate(uint16_t vendorId, uint16_t productId, CpmHidEnumerateCallback callback, void *context);
int CpmHid_OpenPath(CpmHidDevice *device, const char *path);
int CpmHid_OpenVidPid(CpmHidDevice *device, uint16_t vendorId, uint16_t productId, const wchar_t *serialNumber);
int CpmHid_Read(CpmHidDevice *device, void *buffer, size_t capacity, int timeoutMs);
int CpmHid_Write(CpmHidDevice *device, const void *report, size_t reportSize);
int CpmHid_GetFeature(CpmHidDevice *device, void *report, size_t reportSize);
int CpmHid_SetFeature(CpmHidDevice *device, const void *report, size_t reportSize);
const char *CpmHid_ResultText(int result);

#ifdef __cplusplus
}
#endif
#endif
