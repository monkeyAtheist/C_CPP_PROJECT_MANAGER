#ifndef CPM_VISA_H
#define CPM_VISA_H
#include <stddef.h>
#include <stdint.h>
#ifdef __cplusplus
extern "C" {
#endif

typedef struct CpmVisaRuntime { intptr_t library; uint32_t resourceManager; void *functions[9]; } CpmVisaRuntime;
typedef struct CpmVisaSession { CpmVisaRuntime *runtime; uint32_t handle; } CpmVisaSession;
typedef struct CpmVisaResource { char name[256]; } CpmVisaResource;

void CpmVisa_RuntimeInit(CpmVisaRuntime *runtime);
int CpmVisa_Load(CpmVisaRuntime *runtime);
int CpmVisa_LoadLibrary(CpmVisaRuntime *runtime, const char *libraryPath);
void CpmVisa_Unload(CpmVisaRuntime *runtime);
int CpmVisa_IsLoaded(const CpmVisaRuntime *runtime);
int CpmVisa_FindResources(CpmVisaRuntime *runtime, const char *expression, CpmVisaResource *resources, size_t capacity, size_t *count);
void CpmVisa_SessionInit(CpmVisaSession *session);
int CpmVisa_Open(CpmVisaRuntime *runtime, CpmVisaSession *session, const char *resource, int timeoutMs);
void CpmVisa_Close(CpmVisaSession *session);
int CpmVisa_SetTimeout(CpmVisaSession *session, int timeoutMs);
int CpmVisa_SetTermination(CpmVisaSession *session, int enabled, unsigned char terminator);
int CpmVisa_Write(CpmVisaSession *session, const void *data, size_t size);
int CpmVisa_Read(CpmVisaSession *session, void *data, size_t size, int timeoutMs);
int CpmVisa_Query(CpmVisaSession *session, const void *txData, size_t txSize, void *rxData, size_t rxSize, int timeoutMs);
int CpmVisa_StatusDescription(CpmVisaRuntime *runtime, int32_t status, char *buffer, size_t bufferSize);
const char *CpmVisa_LastErrorText(void);
#ifdef __cplusplus
}
#endif
#endif
