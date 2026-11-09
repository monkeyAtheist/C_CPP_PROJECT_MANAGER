#include "cpm_time.h"
#include <time.h>
#if defined(_WIN32)
#include <windows.h>
#else
#include <errno.h>
#endif

uint64_t CpmTime_MonotonicNs(void) {
#if defined(_WIN32)
    LARGE_INTEGER counter, freq;
    if (!QueryPerformanceCounter(&counter) || !QueryPerformanceFrequency(&freq) || freq.QuadPart <= 0) return 0;
    return (uint64_t)((counter.QuadPart / freq.QuadPart) * 1000000000ULL + ((counter.QuadPart % freq.QuadPart) * 1000000000ULL) / freq.QuadPart);
#else
    struct timespec ts;
    if (clock_gettime(CLOCK_MONOTONIC, &ts) != 0) return 0;
    return (uint64_t)ts.tv_sec * 1000000000ULL + (uint64_t)ts.tv_nsec;
#endif
}
uint64_t CpmTime_MonotonicUs(void) { return CpmTime_MonotonicNs() / 1000ULL; }
uint64_t CpmTime_MonotonicMs(void) { return CpmTime_MonotonicNs() / 1000000ULL; }
uint64_t CpmTime_EpochMs(void) {
#if defined(_WIN32)
    FILETIME ft; ULARGE_INTEGER value;
    GetSystemTimeAsFileTime(&ft); value.LowPart = ft.dwLowDateTime; value.HighPart = ft.dwHighDateTime;
    return (value.QuadPart - 116444736000000000ULL) / 10000ULL;
#else
    struct timespec ts;
    if (clock_gettime(CLOCK_REALTIME, &ts) != 0) return 0;
    return (uint64_t)ts.tv_sec * 1000ULL + (uint64_t)ts.tv_nsec / 1000000ULL;
#endif
}
int CpmTime_SleepNs(uint64_t ns) {
#if defined(_WIN32)
    HANDLE timer; LARGE_INTEGER due;
    if (ns == 0) return 0;
    timer = CreateWaitableTimerW(NULL, TRUE, NULL);
    if (!timer) return -1;
    due.QuadPart = -(LONGLONG)((ns + 99ULL) / 100ULL);
    if (!SetWaitableTimer(timer, &due, 0, NULL, NULL, FALSE)) { CloseHandle(timer); return -1; }
    if (WaitForSingleObject(timer, INFINITE) != WAIT_OBJECT_0) { CloseHandle(timer); return -1; }
    CloseHandle(timer); return 0;
#else
    struct timespec req, rem;
    req.tv_sec = (time_t)(ns / 1000000000ULL); req.tv_nsec = (long)(ns % 1000000000ULL);
    while (nanosleep(&req, &rem) != 0) { if (errno != EINTR) return -1; req = rem; }
    return 0;
#endif
}
int CpmTime_SleepUs(uint64_t us) { return CpmTime_SleepNs(us * 1000ULL); }
int CpmTime_SleepMs(uint64_t ms) { return CpmTime_SleepNs(ms * 1000000ULL); }
static int cpm_format(char *buffer, size_t size, const char *format, int utc) {
    time_t now; struct tm tmValue;
    if (!buffer || !size) return -1;
    if (!format) format = "%Y-%m-%d %H:%M:%S";
    now = time(NULL);
#if defined(_WIN32)
    if ((utc ? gmtime_s(&tmValue, &now) : localtime_s(&tmValue, &now)) != 0) return -1;
#else
    if ((utc ? gmtime_r(&now, &tmValue) : localtime_r(&now, &tmValue)) == NULL) return -1;
#endif
    return strftime(buffer, size, format, &tmValue) ? 0 : -2;
}
int CpmTime_FormatLocal(char *buffer, size_t size, const char *format) { return cpm_format(buffer, size, format, 0); }
int CpmTime_FormatUtc(char *buffer, size_t size, const char *format) { return cpm_format(buffer, size, format, 1); }
void CpmStopwatch_Reset(CpmStopwatch *sw) { if (sw) { sw->startNs = 0; sw->elapsedNs = 0; sw->running = 0; } }
void CpmStopwatch_Start(CpmStopwatch *sw) { if (sw && !sw->running) { sw->startNs = CpmTime_MonotonicNs(); sw->running = 1; } }
void CpmStopwatch_Stop(CpmStopwatch *sw) { uint64_t now; if (sw && sw->running) { now = CpmTime_MonotonicNs(); sw->elapsedNs += now - sw->startNs; sw->running = 0; } }
uint64_t CpmStopwatch_ElapsedNs(const CpmStopwatch *sw) { if (!sw) return 0; return sw->elapsedNs + (sw->running ? CpmTime_MonotonicNs() - sw->startNs : 0); }
double CpmStopwatch_ElapsedMs(const CpmStopwatch *sw) { return (double)CpmStopwatch_ElapsedNs(sw) / 1000000.0; }
int CpmPeriodicTimer_Init(CpmPeriodicTimer *timer, uint64_t periodUs) { if (!timer || !periodUs || periodUs > UINT64_MAX / 1000ULL) return -1; timer->periodNs = periodUs * 1000ULL; timer->nextDeadlineNs = 0; timer->started = 0; return 0; }
void CpmPeriodicTimer_Reset(CpmPeriodicTimer *timer) { if (timer) { timer->nextDeadlineNs = 0; timer->started = 0; } }
int CpmPeriodicTimer_WaitNext(CpmPeriodicTimer *timer, int *overrun) {
    uint64_t now, late;
    if (!timer || !timer->periodNs) return -1;
    now = CpmTime_MonotonicNs();
    if (!timer->started) { timer->nextDeadlineNs = now + timer->periodNs; timer->started = 1; }
    if (now < timer->nextDeadlineNs) { if (CpmTime_SleepNs(timer->nextDeadlineNs - now) != 0) return -2; now = CpmTime_MonotonicNs(); }
    late = now > timer->nextDeadlineNs ? now - timer->nextDeadlineNs : 0;
    if (overrun) *overrun = late >= timer->periodNs ? (int)(late / timer->periodNs) : 0;
    do { timer->nextDeadlineNs += timer->periodNs; } while (timer->nextDeadlineNs <= now);
    return 0;
}
