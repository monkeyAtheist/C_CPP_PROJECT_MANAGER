#include "cpm_thread.h"
#include <stdlib.h>
#if defined(_WIN32)
#include <process.h>
#else
#include <errno.h>
#include <sched.h>
#include <time.h>
#endif

typedef struct CpmThreadStart { CpmThreadFunction fn; void *arg; } CpmThreadStart;
#ifdef _WIN32
static DWORD WINAPI cpm_thread_entry(LPVOID p) { CpmThreadStart *s=(CpmThreadStart*)p; int r=s->fn(s->arg); free(s); return (DWORD)r; }
#else
static void *cpm_thread_entry(void *p) { CpmThreadStart *s=(CpmThreadStart*)p; int r=s->fn(s->arg); free(s); return (void*)(intptr_t)r; }
#endif
void CpmThread_Init(CpmThread *t) { if (t) { t->valid=0;
#ifdef _WIN32
 t->handle=NULL; t->id=0;
#endif
 } }
int CpmThread_Create(CpmThread *t, CpmThreadFunction fn, void *arg) {
    CpmThreadStart *s;
    if (!t || !fn || t->valid) return -1;
    s=(CpmThreadStart*)malloc(sizeof(*s)); if(!s) return -2; s->fn=fn; s->arg=arg;
#ifdef _WIN32
    t->handle=CreateThread(NULL,0,cpm_thread_entry,s,0,&t->id); if(!t->handle){free(s);return -3;}
#else
    if(pthread_create(&t->handle,NULL,cpm_thread_entry,s)!=0){free(s);return -3;}
#endif
    t->valid=1; return 0;
}
int CpmThread_Join(CpmThread *t, int *result) {
    if(!t||!t->valid) return -1;
#ifdef _WIN32
    { DWORD code=0; if(WaitForSingleObject(t->handle,INFINITE)!=WAIT_OBJECT_0) return -2; if(!GetExitCodeThread(t->handle,&code)) return -2; CloseHandle(t->handle); t->handle=NULL; if(result)*result=(int)code; }
#else
    { void *value=NULL; if(pthread_join(t->handle,&value)!=0) return -2; if(result)*result=(int)(intptr_t)value; }
#endif
    t->valid=0; return 0;
}
int CpmThread_Detach(CpmThread *t) {
    if(!t||!t->valid) return -1;
#ifdef _WIN32
    CloseHandle(t->handle); t->handle=NULL;
#else
    if(pthread_detach(t->handle)!=0) return -2;
#endif
    t->valid=0; return 0;
}
uint64_t CpmThread_CurrentId(void) {
#ifdef _WIN32
    return (uint64_t)GetCurrentThreadId();
#else
    return (uint64_t)(uintptr_t)pthread_self();
#endif
}
void CpmThread_Yield(void) {
#ifdef _WIN32
    SwitchToThread();
#else
    sched_yield();
#endif
}
int CpmMutex_Init(CpmMutex *m) { if(!m) return -1;
#ifdef _WIN32
 InitializeCriticalSection(&m->native);
#else
 if(pthread_mutex_init(&m->native,NULL)!=0) return -2;
#endif
 m->initialized=1; return 0; }
void CpmMutex_Destroy(CpmMutex *m){ if(!m||!m->initialized)return;
#ifdef _WIN32
 DeleteCriticalSection(&m->native);
#else
 pthread_mutex_destroy(&m->native);
#endif
 m->initialized=0; }
int CpmMutex_Lock(CpmMutex *m){if(!m||!m->initialized)return -1;
#ifdef _WIN32
 EnterCriticalSection(&m->native); return 0;
#else
 return pthread_mutex_lock(&m->native)==0?0:-2;
#endif
}
int CpmMutex_TryLock(CpmMutex *m){if(!m||!m->initialized)return -1;
#ifdef _WIN32
 return TryEnterCriticalSection(&m->native)?0:1;
#else
 {int r=pthread_mutex_trylock(&m->native); return r==0?0:(r==EBUSY?1:-2);}
#endif
}
int CpmMutex_Unlock(CpmMutex *m){if(!m||!m->initialized)return -1;
#ifdef _WIN32
 LeaveCriticalSection(&m->native); return 0;
#else
 return pthread_mutex_unlock(&m->native)==0?0:-2;
#endif
}
int CpmCondition_Init(CpmCondition *c){if(!c)return -1;
#ifdef _WIN32
 InitializeConditionVariable(&c->native);
#else
 if(pthread_cond_init(&c->native,NULL)!=0)return -2;
#endif
 c->initialized=1;return 0;}
void CpmCondition_Destroy(CpmCondition *c){if(!c||!c->initialized)return;
#ifndef _WIN32
 pthread_cond_destroy(&c->native);
#endif
 c->initialized=0;}
int CpmCondition_Wait(CpmCondition *c,CpmMutex *m){if(!c||!m||!c->initialized||!m->initialized)return -1;
#ifdef _WIN32
 return SleepConditionVariableCS(&c->native,&m->native,INFINITE)?0:-2;
#else
 return pthread_cond_wait(&c->native,&m->native)==0?0:-2;
#endif
}
int CpmCondition_TimedWait(CpmCondition *c,CpmMutex *m,uint32_t timeoutMs){if(!c||!m||!c->initialized||!m->initialized)return -1;
#ifdef _WIN32
 if(SleepConditionVariableCS(&c->native,&m->native,timeoutMs))return 0; return GetLastError()==ERROR_TIMEOUT?1:-2;
#else
 {struct timespec ts; int r; if(clock_gettime(CLOCK_REALTIME,&ts)!=0)return -2; ts.tv_sec+=(time_t)(timeoutMs/1000u); ts.tv_nsec+=(long)(timeoutMs%1000u)*1000000L; if(ts.tv_nsec>=1000000000L){++ts.tv_sec;ts.tv_nsec-=1000000000L;} r=pthread_cond_timedwait(&c->native,&m->native,&ts); return r==0?0:(r==ETIMEDOUT?1:-2);}
#endif
}
int CpmCondition_Signal(CpmCondition *c){if(!c||!c->initialized)return -1;
#ifdef _WIN32
 WakeConditionVariable(&c->native); return 0;
#else
 return pthread_cond_signal(&c->native)==0?0:-2;
#endif
}
int CpmCondition_Broadcast(CpmCondition *c){if(!c||!c->initialized)return -1;
#ifdef _WIN32
 WakeAllConditionVariable(&c->native); return 0;
#else
 return pthread_cond_broadcast(&c->native)==0?0:-2;
#endif
}
