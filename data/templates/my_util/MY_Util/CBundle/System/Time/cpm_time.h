/** @file cpm_time.h @brief Cross-platform clocks, elapsed-time helpers, deadlines and callback scheduling. */
#ifndef CPM_TIME_H
#define CPM_TIME_H

#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef struct CpmTimeParts {
    uint64_t days;
    uint32_t hours;
    uint32_t minutes;
    uint32_t seconds;
    uint32_t milliseconds;
    uint32_t microseconds;
    uint32_t nanoseconds;
} CpmTimeParts;

typedef struct CpmDateTime {
    int year;
    int month;
    int day;
    int hour;
    int minute;
    int second;
    int millisecond;
    int weekday;   /* 0 = Sunday */
    int yearday;   /* 0..365 */
    uint64_t epochMs;
} CpmDateTime;

typedef enum CpmDurationFormat {
    CPM_DURATION_HMS = 0,
    CPM_DURATION_HMS_MS,
    CPM_DURATION_DAYS_HMS_MS,
    CPM_DURATION_COMPACT,
    CPM_DURATION_VERBOSE
} CpmDurationFormat;

typedef struct CpmStopwatch {
    uint64_t startNs;
    uint64_t elapsedNs;
    int running;
} CpmStopwatch;

typedef struct CpmPeriodicTimer {
    uint64_t periodNs;
    uint64_t nextDeadlineNs;
    int started;
} CpmPeriodicTimer;

typedef struct CpmDeadline {
    uint64_t deadlineNs;
    int active;
} CpmDeadline;

typedef uint64_t CpmTimerId;

typedef void (*CpmTimerCallback)(
    CpmTimerId timerId,
    uint64_t scheduledNs,
    uint64_t firedNs,
    uint64_t invocation,
    void *userData);

/* Return 0 to keep polling, non-zero to stop before the timeout. */
typedef int (*CpmIntervalCallback)(CpmTimerId timerId, uint64_t elapsedMs,
                                   uint64_t invocation, void *userData);
typedef enum CpmIntervalEndReason {
    CPM_INTERVAL_TIMEOUT = 0,
    CPM_INTERVAL_STOPPED = 1
} CpmIntervalEndReason;
typedef void (*CpmIntervalFinishCallback)(CpmTimerId timerId,
                                         CpmIntervalEndReason reason,
                                         uint64_t elapsedMs,
                                         uint64_t invocationCount,
                                         void *userData);

typedef struct CpmScheduledTimer {
    CpmTimerId id;
    uint64_t deadlineNs;
    uint64_t periodNs;
    uint64_t invocation;
    CpmTimerCallback callback;
    CpmIntervalCallback intervalCallback;
    CpmIntervalFinishCallback finishCallback;
    uint64_t intervalStartNs;
    uint64_t timeoutNs;
    void *userData;
    int active;
} CpmScheduledTimer;

typedef struct CpmScheduler {
    CpmScheduledTimer *timers;
    size_t count;
    size_t capacity;
    CpmTimerId nextId;
} CpmScheduler;

/* Clocks */
uint64_t CpmTime_MonotonicNs(void);
uint64_t CpmTime_MonotonicUs(void);
uint64_t CpmTime_MonotonicMs(void);
uint64_t CpmTime_EpochNs(void);
uint64_t CpmTime_EpochUs(void);
uint64_t CpmTime_EpochMs(void);
uint64_t CpmTime_EpochSeconds(void);

/* Numeric conversion helpers */
double CpmTime_NsToMicroseconds(uint64_t ns);
double CpmTime_NsToMilliseconds(uint64_t ns);
double CpmTime_NsToSeconds(uint64_t ns);
double CpmTime_NsToMinutes(uint64_t ns);
double CpmTime_NsToHours(uint64_t ns);
double CpmTime_NsToDays(uint64_t ns);

/* Calendar / text */
int CpmTime_NowLocal(CpmDateTime *out);
int CpmTime_NowUtc(CpmDateTime *out);
int CpmTime_FromEpochMsLocal(uint64_t epochMs, CpmDateTime *out);
int CpmTime_FromEpochMsUtc(uint64_t epochMs, CpmDateTime *out);
int CpmTime_FormatLocal(char *buffer, size_t bufferSize, const char *format);
int CpmTime_FormatUtc(char *buffer, size_t bufferSize, const char *format);
void CpmTime_DecomposeNs(uint64_t ns, CpmTimeParts *out);
int CpmTime_FormatDurationNs(uint64_t ns, CpmDurationFormat format, char *buffer, size_t bufferSize);

/* Sleep */
int CpmTime_SleepNs(uint64_t ns);
int CpmTime_SleepUs(uint64_t us);
int CpmTime_SleepMs(uint64_t ms);
int CpmTime_SleepSeconds(double seconds);

/* Stopwatch */
void CpmStopwatch_Reset(CpmStopwatch *sw);
void CpmStopwatch_Start(CpmStopwatch *sw);
void CpmStopwatch_Restart(CpmStopwatch *sw);
void CpmStopwatch_Stop(CpmStopwatch *sw);
uint64_t CpmStopwatch_LapNs(CpmStopwatch *sw);
uint64_t CpmStopwatch_ElapsedNs(const CpmStopwatch *sw);
uint64_t CpmStopwatch_ElapsedUs(const CpmStopwatch *sw);
double CpmStopwatch_ElapsedMs(const CpmStopwatch *sw);
double CpmStopwatch_ElapsedSeconds(const CpmStopwatch *sw);
double CpmStopwatch_ElapsedMinutes(const CpmStopwatch *sw);
double CpmStopwatch_ElapsedHours(const CpmStopwatch *sw);
void CpmStopwatch_ElapsedParts(const CpmStopwatch *sw, CpmTimeParts *out);
int CpmStopwatch_Format(const CpmStopwatch *sw, CpmDurationFormat format, char *buffer, size_t bufferSize);

/* Drift-resistant periodic loop timer */
int CpmPeriodicTimer_Init(CpmPeriodicTimer *timer, uint64_t periodUs);
int CpmPeriodicTimer_InitMs(CpmPeriodicTimer *timer, uint64_t periodMs);
void CpmPeriodicTimer_Reset(CpmPeriodicTimer *timer);
uint64_t CpmPeriodicTimer_RemainingNs(const CpmPeriodicTimer *timer);
int CpmPeriodicTimer_WaitNext(CpmPeriodicTimer *timer, int *overrun);

/* Deadline / timeout helper */
void CpmDeadline_Clear(CpmDeadline *deadline);
int CpmDeadline_AfterNs(CpmDeadline *deadline, uint64_t delayNs);
int CpmDeadline_AfterMs(CpmDeadline *deadline, uint64_t delayMs);
int CpmDeadline_AfterSeconds(CpmDeadline *deadline, double delaySeconds);
int CpmDeadline_AtMonotonicNs(CpmDeadline *deadline, uint64_t monotonicNs);
int CpmDeadline_IsExpired(const CpmDeadline *deadline);
uint64_t CpmDeadline_RemainingNs(const CpmDeadline *deadline);
uint64_t CpmDeadline_RemainingMs(const CpmDeadline *deadline);
double CpmDeadline_RemainingSeconds(const CpmDeadline *deadline);

/* Blocking relative delay: callback every intervalMs strictly BEFORE timeoutMs.
 * Callback: 0 = continue, non-zero = stop early. Returns 0 = timed out,
 * 1 = stopped by callback, negative = invalid input/clock/sleep failure.
 * No callback if timeout is 0 or interval >= timeout; no background thread.
 * Missed intervals are SKIPPED, never replayed in a burst.
 */
int CpmTime_DelayWithCallbackMs(uint64_t timeoutMs, uint64_t intervalMs,
                                CpmIntervalCallback callback, void *userData);

/* Callback scheduler. Poll() executes callbacks on the caller thread. */
void CpmScheduler_Init(CpmScheduler *scheduler);
void CpmScheduler_Free(CpmScheduler *scheduler);
void CpmScheduler_Clear(CpmScheduler *scheduler);
size_t CpmScheduler_Count(const CpmScheduler *scheduler);
CpmTimerId CpmScheduler_ScheduleAfterNs(CpmScheduler *scheduler, uint64_t delayNs, CpmTimerCallback callback, void *userData);
CpmTimerId CpmScheduler_ScheduleAfterMs(CpmScheduler *scheduler, uint64_t delayMs, CpmTimerCallback callback, void *userData);
CpmTimerId CpmScheduler_ScheduleAtMonotonicNs(CpmScheduler *scheduler, uint64_t deadlineNs, CpmTimerCallback callback, void *userData);
CpmTimerId CpmScheduler_ScheduleAtEpochMs(CpmScheduler *scheduler, uint64_t epochMs, CpmTimerCallback callback, void *userData);
CpmTimerId CpmScheduler_ScheduleEveryNs(CpmScheduler *scheduler, uint64_t periodNs, uint64_t firstDelayNs, CpmTimerCallback callback, void *userData);
CpmTimerId CpmScheduler_ScheduleEveryMs(CpmScheduler *scheduler, uint64_t periodMs, uint64_t firstDelayMs, CpmTimerCallback callback, void *userData);
/* Non-blocking interval/timeout job. First tick at start+intervalMs.
 * onFinish is called once on timeout or callback-requested stop, on Poll thread.
 * A cancellation/clear/free is silent (no onFinish callback).
 * If interval and timeout coincide, timeout has precedence; no final tick.
 * Both durations are measured with the monotonic clock. Invalid params => 0.
 */
CpmTimerId CpmScheduler_ScheduleForMs(CpmScheduler *scheduler,
                                      uint64_t timeoutMs, uint64_t intervalMs,
                                      CpmIntervalCallback callback,
                                      CpmIntervalFinishCallback onFinish,
                                      void *userData);
int CpmScheduler_Cancel(CpmScheduler *scheduler, CpmTimerId timerId);
int CpmScheduler_IsScheduled(const CpmScheduler *scheduler, CpmTimerId timerId);
uint64_t CpmScheduler_TimeUntilNextNs(const CpmScheduler *scheduler);
int CpmScheduler_Poll(CpmScheduler *scheduler, size_t maxCallbacks);
int CpmScheduler_WaitAndPoll(CpmScheduler *scheduler, uint64_t maxSleepMs, size_t maxCallbacks);

#ifdef __cplusplus
}
#endif
#endif
