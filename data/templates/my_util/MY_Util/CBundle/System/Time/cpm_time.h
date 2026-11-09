/** @file cpm_time.h @brief Cross-platform high-resolution clocks, sleeps and periodic timing. */
#ifndef CPM_TIME_H
#define CPM_TIME_H
#include <stddef.h>
#include <stdint.h>
#ifdef __cplusplus
extern "C" {
#endif

typedef struct CpmStopwatch { uint64_t startNs; uint64_t elapsedNs; int running; } CpmStopwatch;
typedef struct CpmPeriodicTimer { uint64_t periodNs; uint64_t nextDeadlineNs; int started; } CpmPeriodicTimer;

uint64_t CpmTime_MonotonicNs(void);
uint64_t CpmTime_MonotonicUs(void);
uint64_t CpmTime_MonotonicMs(void);
uint64_t CpmTime_EpochMs(void);
int CpmTime_SleepNs(uint64_t ns);
int CpmTime_SleepUs(uint64_t us);
int CpmTime_SleepMs(uint64_t ms);
int CpmTime_FormatLocal(char *buffer, size_t bufferSize, const char *format);
int CpmTime_FormatUtc(char *buffer, size_t bufferSize, const char *format);

void CpmStopwatch_Reset(CpmStopwatch *sw);
void CpmStopwatch_Start(CpmStopwatch *sw);
void CpmStopwatch_Stop(CpmStopwatch *sw);
uint64_t CpmStopwatch_ElapsedNs(const CpmStopwatch *sw);
double CpmStopwatch_ElapsedMs(const CpmStopwatch *sw);

int CpmPeriodicTimer_Init(CpmPeriodicTimer *timer, uint64_t periodUs);
void CpmPeriodicTimer_Reset(CpmPeriodicTimer *timer);
int CpmPeriodicTimer_WaitNext(CpmPeriodicTimer *timer, int *overrun);

#ifdef __cplusplus
}
#endif
#endif
