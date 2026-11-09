/** @file cpm_thread.h @brief Cross-platform threads, mutexes and condition variables. */
#ifndef CPM_THREAD_H
#define CPM_THREAD_H
#include <stdint.h>
#ifdef _WIN32
#include <windows.h>
#else
#include <pthread.h>
#endif
#ifdef __cplusplus
extern "C" {
#endif

typedef int (*CpmThreadFunction)(void *userData);

typedef struct CpmThread {
#ifdef _WIN32
    HANDLE handle;
    DWORD id;
#else
    pthread_t handle;
#endif
    int valid;
} CpmThread;

typedef struct CpmMutex {
#ifdef _WIN32
    CRITICAL_SECTION native;
#else
    pthread_mutex_t native;
#endif
    int initialized;
} CpmMutex;

typedef struct CpmCondition {
#ifdef _WIN32
    CONDITION_VARIABLE native;
#else
    pthread_cond_t native;
#endif
    int initialized;
} CpmCondition;

void CpmThread_Init(CpmThread *thread);
int CpmThread_Create(CpmThread *thread, CpmThreadFunction function, void *userData);
int CpmThread_Join(CpmThread *thread, int *result);
int CpmThread_Detach(CpmThread *thread);
uint64_t CpmThread_CurrentId(void);
void CpmThread_Yield(void);

int CpmMutex_Init(CpmMutex *mutex);
void CpmMutex_Destroy(CpmMutex *mutex);
int CpmMutex_Lock(CpmMutex *mutex);
int CpmMutex_TryLock(CpmMutex *mutex);
int CpmMutex_Unlock(CpmMutex *mutex);

int CpmCondition_Init(CpmCondition *condition);
void CpmCondition_Destroy(CpmCondition *condition);
int CpmCondition_Wait(CpmCondition *condition, CpmMutex *mutex);
int CpmCondition_TimedWait(CpmCondition *condition, CpmMutex *mutex, uint32_t timeoutMs);
int CpmCondition_Signal(CpmCondition *condition);
int CpmCondition_Broadcast(CpmCondition *condition);

#ifdef __cplusplus
}
#endif
#endif
