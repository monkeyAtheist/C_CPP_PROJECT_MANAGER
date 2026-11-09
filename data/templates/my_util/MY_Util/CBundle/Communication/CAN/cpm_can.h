#ifndef CPM_CAN_H
#define CPM_CAN_H

#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef struct CpmCanFrame
{
    uint32_t id;
    uint8_t data[64];
    uint8_t length;
    uint8_t extended;
    uint8_t remote;
    uint8_t fd;
} CpmCanFrame;

typedef struct CpmCanFilter
{
    uint32_t id;
    uint32_t mask;
    uint8_t extended;
} CpmCanFilter;

typedef struct CpmCan
{
    int handle;
    int fdEnabled;
} CpmCan;

void CpmCan_Init(CpmCan *canBus);
int CpmCan_Open(CpmCan *canBus, const char *interfaceName, int enableFd);
void CpmCan_Close(CpmCan *canBus);
int CpmCan_Send(CpmCan *canBus, const CpmCanFrame *frame);
int CpmCan_Receive(CpmCan *canBus, CpmCanFrame *frame, int timeoutMs);
int CpmCan_SetFilter(CpmCan *canBus, uint32_t id, uint32_t mask, int extended);
int CpmCan_SetFilters(CpmCan *canBus, const CpmCanFilter *filters, size_t count);
int CpmCan_ClearFilters(CpmCan *canBus);
int CpmCan_SetLoopback(CpmCan *canBus, int enabled);
int CpmCan_SetReceiveOwnMessages(CpmCan *canBus, int enabled);
int CpmCan_SetErrorMask(CpmCan *canBus, uint32_t errorMask);
int CpmCan_FormatFrame(const CpmCanFrame *frame, char *buffer, size_t bufferSize);

#ifdef __cplusplus
}
#endif
#endif
