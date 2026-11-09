#include "cpm_visa.h"

#include <stdio.h>
#include <string.h>

#if defined(_WIN32)
#include <windows.h>
#define CPM_VISA_CALL __stdcall
#else
#define CPM_VISA_CALL
#endif

typedef int32_t CpmViStatus;
typedef uint32_t CpmViObject, CpmViSession, CpmViFindList;
typedef CpmViStatus (CPM_VISA_CALL *FnOpenDefaultRM)(CpmViSession *);
typedef CpmViStatus (CPM_VISA_CALL *FnFindRsrc)(CpmViSession, const char *, CpmViFindList *, uint32_t *, char *);
typedef CpmViStatus (CPM_VISA_CALL *FnFindNext)(CpmViFindList, char *);
typedef CpmViStatus (CPM_VISA_CALL *FnOpen)(CpmViSession, const char *, uint32_t, uint32_t, CpmViSession *);
typedef CpmViStatus (CPM_VISA_CALL *FnClose)(CpmViObject);
typedef CpmViStatus (CPM_VISA_CALL *FnWrite)(CpmViSession, const unsigned char *, uint32_t, uint32_t *);
typedef CpmViStatus (CPM_VISA_CALL *FnRead)(CpmViSession, unsigned char *, uint32_t, uint32_t *);
typedef CpmViStatus (CPM_VISA_CALL *FnSetAttribute)(CpmViObject, uint32_t, uintptr_t);
typedef CpmViStatus (CPM_VISA_CALL *FnStatusDesc)(CpmViObject, CpmViStatus, char *);

enum { F_RM, F_FIND, F_NEXT, F_OPEN, F_CLOSE, F_WRITE, F_READ, F_ATTR, F_DESC };
enum { A_TMO = 0x3FFF001Au, A_TERM = 0x3FFF0018u, A_TERM_EN = 0x3FFF0038u };

static char g_error[256];

static void CpmVisa_SetError(const char *text)
{
    snprintf(g_error, sizeof(g_error), "%s", text ? text : "VISA error");
}

const char *CpmVisa_LastErrorText(void)
{
    return g_error;
}

void CpmVisa_RuntimeInit(CpmVisaRuntime *runtime)
{
    if (runtime) memset(runtime, 0, sizeof(*runtime));
}

void CpmVisa_SessionInit(CpmVisaSession *session)
{
    if (session) memset(session, 0, sizeof(*session));
}

int CpmVisa_LoadLibrary(CpmVisaRuntime *runtime, const char *path)
{
#if defined(_WIN32)
    HMODULE library;
    CpmViSession resourceManager = 0;
    CpmViStatus status;

    if (!runtime || !path || !*path) return -1;
    CpmVisa_Unload(runtime);

    library = LoadLibraryA(path);
    if (!library)
    {
        CpmVisa_SetError("Unable to load VISA runtime DLL");
        return -2;
    }

#define LOAD_VISA_EXPORT(index, name) \
    do { \
        runtime->functions[index] = (void *)GetProcAddress(library, name); \
        if (!runtime->functions[index]) { \
            FreeLibrary(library); \
            CpmVisa_RuntimeInit(runtime); \
            CpmVisa_SetError("VISA runtime missing required exports"); \
            return -3; \
        } \
    } while (0)

    LOAD_VISA_EXPORT(F_RM, "viOpenDefaultRM");
    LOAD_VISA_EXPORT(F_FIND, "viFindRsrc");
    LOAD_VISA_EXPORT(F_NEXT, "viFindNext");
    LOAD_VISA_EXPORT(F_OPEN, "viOpen");
    LOAD_VISA_EXPORT(F_CLOSE, "viClose");
    LOAD_VISA_EXPORT(F_WRITE, "viWrite");
    LOAD_VISA_EXPORT(F_READ, "viRead");
    LOAD_VISA_EXPORT(F_ATTR, "viSetAttribute");
    LOAD_VISA_EXPORT(F_DESC, "viStatusDesc");
#undef LOAD_VISA_EXPORT

    runtime->library = (intptr_t)library;
    status = ((FnOpenDefaultRM)runtime->functions[F_RM])(&resourceManager);
    if (status < 0)
    {
        CpmVisa_SetError("viOpenDefaultRM failed");
        CpmVisa_Unload(runtime);
        return -4;
    }

    runtime->resourceManager = resourceManager;
    return 0;
#else
    (void)runtime;
    (void)path;
    CpmVisa_SetError("This compact VISA loader currently targets Windows VISA DLLs");
    return -2;
#endif
}

int CpmVisa_Load(CpmVisaRuntime *runtime)
{
#if defined(_WIN32)
#if defined(_WIN64)
    if (CpmVisa_LoadLibrary(runtime, "visa64.dll") == 0) return 0;
    return CpmVisa_LoadLibrary(runtime, "visa32.dll");
#else
    if (CpmVisa_LoadLibrary(runtime, "visa32.dll") == 0) return 0;
    return CpmVisa_LoadLibrary(runtime, "visa64.dll");
#endif
#else
    (void)runtime;
    CpmVisa_SetError("VISA runtime discovery currently targets Windows");
    return -2;
#endif
}

void CpmVisa_Unload(CpmVisaRuntime *runtime)
{
    if (!runtime) return;
#if defined(_WIN32)
    if (runtime->resourceManager && runtime->functions[F_CLOSE])
        ((FnClose)runtime->functions[F_CLOSE])(runtime->resourceManager);
    if (runtime->library)
        FreeLibrary((HMODULE)runtime->library);
#endif
    CpmVisa_RuntimeInit(runtime);
}

int CpmVisa_IsLoaded(const CpmVisaRuntime *runtime)
{
    return runtime && runtime->library && runtime->resourceManager;
}

int CpmVisa_FindResources(CpmVisaRuntime *runtime, const char *expression, CpmVisaResource *out, size_t capacity, size_t *count)
{
    CpmViFindList findList = 0;
    uint32_t total = 0;
    uint32_t i;
    char name[256];
    size_t written = 0;
    CpmViStatus status;

    if (!runtime || !CpmVisa_IsLoaded(runtime) || !expression || !out || !count) return -1;
    status = ((FnFindRsrc)runtime->functions[F_FIND])(runtime->resourceManager, expression, &findList, &total, name);
    if (status < 0)
    {
        *count = 0;
        return 0;
    }

    for (i = 0; i < total; ++i)
    {
        if (written < capacity)
        {
            snprintf(out[written].name, sizeof(out[written].name), "%s", name);
            ++written;
        }
        if (i + 1 < total && ((FnFindNext)runtime->functions[F_NEXT])(findList, name) < 0) break;
    }

    ((FnClose)runtime->functions[F_CLOSE])(findList);
    *count = written;
    return total > capacity ? 1 : 0;
}

int CpmVisa_Open(CpmVisaRuntime *runtime, CpmVisaSession *session, const char *resource, int timeoutMs)
{
    CpmViSession handle = 0;
    CpmViStatus status;

    if (!runtime || !session || !resource || !CpmVisa_IsLoaded(runtime)) return -1;
    CpmVisa_Close(session);
    status = ((FnOpen)runtime->functions[F_OPEN])(runtime->resourceManager, resource, 0, timeoutMs < 0 ? 0u : (uint32_t)timeoutMs, &handle);
    if (status < 0) return -2;
    session->runtime = runtime;
    session->handle = handle;
    return timeoutMs >= 0 ? CpmVisa_SetTimeout(session, timeoutMs) : 0;
}

void CpmVisa_Close(CpmVisaSession *session)
{
    if (!session) return;
    if (session->runtime && session->handle && session->runtime->functions[F_CLOSE])
        ((FnClose)session->runtime->functions[F_CLOSE])(session->handle);
    CpmVisa_SessionInit(session);
}

int CpmVisa_SetTimeout(CpmVisaSession *session, int timeoutMs)
{
    if (!session || !session->runtime || !session->handle) return -1;
    return ((FnSetAttribute)session->runtime->functions[F_ATTR])(
        session->handle, A_TMO, timeoutMs < 0 ? (uintptr_t)0xFFFFFFFFu : (uintptr_t)(uint32_t)timeoutMs) < 0 ? -2 : 0;
}

int CpmVisa_SetTermination(CpmVisaSession *session, int enabled, unsigned char terminator)
{
    FnSetAttribute setAttribute;
    if (!session || !session->runtime || !session->handle) return -1;
    setAttribute = (FnSetAttribute)session->runtime->functions[F_ATTR];
    if (setAttribute(session->handle, A_TERM, terminator) < 0) return -2;
    return setAttribute(session->handle, A_TERM_EN, enabled ? 1u : 0u) < 0 ? -3 : 0;
}

int CpmVisa_Write(CpmVisaSession *session, const void *data, size_t size)
{
    uint32_t written = 0;
    if (!session || !session->runtime || !session->handle || (!data && size) || size > 0xFFFFFFFFu) return -1;
    return ((FnWrite)session->runtime->functions[F_WRITE])(session->handle, (const unsigned char *)data, (uint32_t)size, &written) < 0 ? -2 : (int)written;
}

int CpmVisa_Read(CpmVisaSession *session, void *data, size_t size, int timeoutMs)
{
    uint32_t readCount = 0;
    if (!session || !session->runtime || !session->handle || !data || !size || size > 0xFFFFFFFFu) return -1;
    if (timeoutMs >= 0 && CpmVisa_SetTimeout(session, timeoutMs) != 0) return -2;
    return ((FnRead)session->runtime->functions[F_READ])(session->handle, (unsigned char *)data, (uint32_t)size, &readCount) < 0 ? -3 : (int)readCount;
}

int CpmVisa_Query(CpmVisaSession *session, const void *tx, size_t txSize, void *rx, size_t rxSize, int timeoutMs)
{
    int written = CpmVisa_Write(session, tx, txSize);
    if (written < 0 || (size_t)written != txSize) return -1;
    return CpmVisa_Read(session, rx, rxSize, timeoutMs);
}

int CpmVisa_StatusDescription(CpmVisaRuntime *runtime, int32_t status, char *buffer, size_t size)
{
    char text[256];
    if (!runtime || !CpmVisa_IsLoaded(runtime) || !buffer || !size) return -1;
    if (((FnStatusDesc)runtime->functions[F_DESC])(runtime->resourceManager, status, text) < 0) return -2;
    snprintf(buffer, size, "%s", text);
    return 0;
}
