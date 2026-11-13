#if !defined(_WIN32) && !defined(_POSIX_C_SOURCE)
#define _POSIX_C_SOURCE 200809L
#endif

#include "cpm_time.h"

#include <limits.h>
#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

#if defined(_WIN32)
#include <windows.h>
#else
#include <errno.h>
#endif

#define CPM_NS_PER_US 1000ULL
#define CPM_NS_PER_MS 1000000ULL
#define CPM_NS_PER_SEC 1000000000ULL
#define CPM_NS_PER_MIN (60ULL * CPM_NS_PER_SEC)
#define CPM_NS_PER_HOUR (60ULL * CPM_NS_PER_MIN)
#define CPM_NS_PER_DAY (24ULL * CPM_NS_PER_HOUR)

static int cpm_mul_u64(uint64_t a, uint64_t b, uint64_t *out) {
    if (!out || (a != 0U && b > UINT64_MAX / a)) return -1;
    *out = a * b;
    return 0;
}

uint64_t CpmTime_MonotonicNs(void) {
#if defined(_WIN32)
    LARGE_INTEGER counter;
    LARGE_INTEGER freq;
    if (!QueryPerformanceCounter(&counter) || !QueryPerformanceFrequency(&freq) || freq.QuadPart <= 0) return 0;
    return (uint64_t)((counter.QuadPart / freq.QuadPart) * 1000000000ULL +
                      ((counter.QuadPart % freq.QuadPart) * 1000000000ULL) / freq.QuadPart);
#else
    struct timespec ts;
    if (clock_gettime(CLOCK_MONOTONIC, &ts) != 0) return 0;
    return (uint64_t)ts.tv_sec * CPM_NS_PER_SEC + (uint64_t)ts.tv_nsec;
#endif
}

uint64_t CpmTime_MonotonicUs(void) { return CpmTime_MonotonicNs() / CPM_NS_PER_US; }
uint64_t CpmTime_MonotonicMs(void) { return CpmTime_MonotonicNs() / CPM_NS_PER_MS; }

uint64_t CpmTime_EpochNs(void) {
#if defined(_WIN32)
    FILETIME ft;
    ULARGE_INTEGER value;
    GetSystemTimeAsFileTime(&ft);
    value.LowPart = ft.dwLowDateTime;
    value.HighPart = ft.dwHighDateTime;
    if (value.QuadPart < 116444736000000000ULL) return 0;
    return (value.QuadPart - 116444736000000000ULL) * 100ULL;
#else
    struct timespec ts;
    if (clock_gettime(CLOCK_REALTIME, &ts) != 0) return 0;
    return (uint64_t)ts.tv_sec * CPM_NS_PER_SEC + (uint64_t)ts.tv_nsec;
#endif
}

uint64_t CpmTime_EpochUs(void) { return CpmTime_EpochNs() / CPM_NS_PER_US; }
uint64_t CpmTime_EpochMs(void) { return CpmTime_EpochNs() / CPM_NS_PER_MS; }
uint64_t CpmTime_EpochSeconds(void) { return CpmTime_EpochNs() / CPM_NS_PER_SEC; }

double CpmTime_NsToMicroseconds(uint64_t ns) { return (double)ns / 1000.0; }
double CpmTime_NsToMilliseconds(uint64_t ns) { return (double)ns / 1000000.0; }
double CpmTime_NsToSeconds(uint64_t ns) { return (double)ns / 1000000000.0; }
double CpmTime_NsToMinutes(uint64_t ns) { return CpmTime_NsToSeconds(ns) / 60.0; }
double CpmTime_NsToHours(uint64_t ns) { return CpmTime_NsToMinutes(ns) / 60.0; }
double CpmTime_NsToDays(uint64_t ns) { return CpmTime_NsToHours(ns) / 24.0; }

static int cpm_tm_from_time(time_t value, int utc, struct tm *out) {
    if (!out) return -1;
#if defined(_WIN32)
    return (utc ? gmtime_s(out, &value) : localtime_s(out, &value)) == 0 ? 0 : -1;
#else
    return (utc ? gmtime_r(&value, out) : localtime_r(&value, out)) != NULL ? 0 : -1;
#endif
}

static int cpm_datetime_from_epoch(uint64_t epochMs, int utc, CpmDateTime *out) {
    time_t seconds;
    struct tm tmValue;
    if (!out) return -1;
    if (epochMs / 1000ULL > (uint64_t)LLONG_MAX) return -2;
    seconds = (time_t)(epochMs / 1000ULL);
    if (cpm_tm_from_time(seconds, utc, &tmValue) != 0) return -3;
    out->year = tmValue.tm_year + 1900;
    out->month = tmValue.tm_mon + 1;
    out->day = tmValue.tm_mday;
    out->hour = tmValue.tm_hour;
    out->minute = tmValue.tm_min;
    out->second = tmValue.tm_sec;
    out->millisecond = (int)(epochMs % 1000ULL);
    out->weekday = tmValue.tm_wday;
    out->yearday = tmValue.tm_yday;
    out->epochMs = epochMs;
    return 0;
}

int CpmTime_NowLocal(CpmDateTime *out) { return cpm_datetime_from_epoch(CpmTime_EpochMs(), 0, out); }
int CpmTime_NowUtc(CpmDateTime *out) { return cpm_datetime_from_epoch(CpmTime_EpochMs(), 1, out); }
int CpmTime_FromEpochMsLocal(uint64_t epochMs, CpmDateTime *out) { return cpm_datetime_from_epoch(epochMs, 0, out); }
int CpmTime_FromEpochMsUtc(uint64_t epochMs, CpmDateTime *out) { return cpm_datetime_from_epoch(epochMs, 1, out); }

static int cpm_format_clock(char *buffer, size_t size, const char *format, int utc) {
    time_t now;
    struct tm tmValue;
    if (!buffer || size == 0U) return -1;
    if (!format) format = "%Y-%m-%d %H:%M:%S";
    now = time(NULL);
    if (cpm_tm_from_time(now, utc, &tmValue) != 0) return -2;
    return strftime(buffer, size, format, &tmValue) != 0U ? 0 : -3;
}

int CpmTime_FormatLocal(char *buffer, size_t size, const char *format) { return cpm_format_clock(buffer, size, format, 0); }
int CpmTime_FormatUtc(char *buffer, size_t size, const char *format) { return cpm_format_clock(buffer, size, format, 1); }

void CpmTime_DecomposeNs(uint64_t ns, CpmTimeParts *out) {
    if (!out) return;
    out->days = ns / CPM_NS_PER_DAY;
    ns %= CPM_NS_PER_DAY;
    out->hours = (uint32_t)(ns / CPM_NS_PER_HOUR);
    ns %= CPM_NS_PER_HOUR;
    out->minutes = (uint32_t)(ns / CPM_NS_PER_MIN);
    ns %= CPM_NS_PER_MIN;
    out->seconds = (uint32_t)(ns / CPM_NS_PER_SEC);
    ns %= CPM_NS_PER_SEC;
    out->milliseconds = (uint32_t)(ns / CPM_NS_PER_MS);
    ns %= CPM_NS_PER_MS;
    out->microseconds = (uint32_t)(ns / CPM_NS_PER_US);
    out->nanoseconds = (uint32_t)(ns % CPM_NS_PER_US);
}

int CpmTime_FormatDurationNs(uint64_t ns, CpmDurationFormat format, char *buffer, size_t bufferSize) {
    CpmTimeParts p;
    int written;
    if (!buffer || bufferSize == 0U) return -1;
    CpmTime_DecomposeNs(ns, &p);
    switch (format) {
        case CPM_DURATION_HMS:
            written = snprintf(buffer, bufferSize, "%02llu:%02u:%02u",
                (unsigned long long)(p.days * 24ULL + p.hours), p.minutes, p.seconds);
            break;
        case CPM_DURATION_HMS_MS:
            written = snprintf(buffer, bufferSize, "%02llu:%02u:%02u.%03u",
                (unsigned long long)(p.days * 24ULL + p.hours), p.minutes, p.seconds, p.milliseconds);
            break;
        case CPM_DURATION_DAYS_HMS_MS:
            written = snprintf(buffer, bufferSize, "%llud %02u:%02u:%02u.%03u",
                (unsigned long long)p.days, p.hours, p.minutes, p.seconds, p.milliseconds);
            break;
        case CPM_DURATION_COMPACT:
            if (p.days > 0U) {
                written = snprintf(buffer, bufferSize, "%llud %uh %umin %us %ums",
                    (unsigned long long)p.days, p.hours, p.minutes, p.seconds, p.milliseconds);
            } else if (p.hours > 0U) {
                written = snprintf(buffer, bufferSize, "%uh %umin %us %ums", p.hours, p.minutes, p.seconds, p.milliseconds);
            } else if (p.minutes > 0U) {
                written = snprintf(buffer, bufferSize, "%umin %us %ums", p.minutes, p.seconds, p.milliseconds);
            } else {
                written = snprintf(buffer, bufferSize, "%us %ums", p.seconds, p.milliseconds);
            }
            break;
        case CPM_DURATION_VERBOSE:
            written = snprintf(buffer, bufferSize,
                "%llu days, %u hours, %u minutes, %u seconds, %u ms, %u us, %u ns",
                (unsigned long long)p.days, p.hours, p.minutes, p.seconds,
                p.milliseconds, p.microseconds, p.nanoseconds);
            break;
        default:
            return -2;
    }
    if (written < 0) return -3;
    return (size_t)written < bufferSize ? 0 : -4;
}

int CpmTime_SleepNs(uint64_t ns) {
#if defined(_WIN32)
    HANDLE timer;
    LARGE_INTEGER due;
    if (ns == 0U) return 0;
    timer = CreateWaitableTimerW(NULL, TRUE, NULL);
    if (!timer) return -1;
    /* ceil(ns/100) without overflowing ns+99; LARGE_INTEGER is signed. */
    due.QuadPart = -(LONGLONG)(ns / 100ULL + (ns % 100ULL != 0U));
    if (!SetWaitableTimer(timer, &due, 0, NULL, NULL, FALSE)) { CloseHandle(timer); return -1; }
    if (WaitForSingleObject(timer, INFINITE) != WAIT_OBJECT_0) { CloseHandle(timer); return -1; }
    CloseHandle(timer);
    return 0;
#else
    struct timespec req;
    struct timespec rem;
    req.tv_sec = (time_t)(ns / CPM_NS_PER_SEC);
    req.tv_nsec = (long)(ns % CPM_NS_PER_SEC);
    while (nanosleep(&req, &rem) != 0) {
        if (errno != EINTR) return -1;
        req = rem;
    }
    return 0;
#endif
}

int CpmTime_SleepUs(uint64_t us) {
    uint64_t ns;
    return cpm_mul_u64(us, CPM_NS_PER_US, &ns) == 0 ? CpmTime_SleepNs(ns) : -1;
}

int CpmTime_SleepMs(uint64_t ms) {
    uint64_t ns;
    return cpm_mul_u64(ms, CPM_NS_PER_MS, &ns) == 0 ? CpmTime_SleepNs(ns) : -1;
}

int CpmTime_SleepSeconds(double seconds) {
    if (!isfinite(seconds) || seconds < 0.0 ||
        (long double)seconds * 1000000000.0L > (long double)UINT64_MAX) return -1;
    return CpmTime_SleepNs((uint64_t)((long double)seconds * 1000000000.0L));
}

void CpmStopwatch_Reset(CpmStopwatch *sw) {
    if (sw) { sw->startNs = 0U; sw->elapsedNs = 0U; sw->running = 0; }
}

void CpmStopwatch_Start(CpmStopwatch *sw) {
    if (sw && !sw->running) { sw->startNs = CpmTime_MonotonicNs(); sw->running = 1; }
}

void CpmStopwatch_Restart(CpmStopwatch *sw) {
    if (sw) { sw->elapsedNs = 0U; sw->startNs = CpmTime_MonotonicNs(); sw->running = 1; }
}

void CpmStopwatch_Stop(CpmStopwatch *sw) {
    uint64_t now;
    if (sw && sw->running) {
        now = CpmTime_MonotonicNs();
        if (now >= sw->startNs) sw->elapsedNs += now - sw->startNs;
        sw->running = 0;
    }
}

uint64_t CpmStopwatch_LapNs(CpmStopwatch *sw) {
    uint64_t now;
    uint64_t lap;
    if (!sw || !sw->running) return 0U;
    now = CpmTime_MonotonicNs();
    lap = now >= sw->startNs ? now - sw->startNs : 0U;
    sw->elapsedNs += lap;
    sw->startNs = now;
    return lap;
}

uint64_t CpmStopwatch_ElapsedNs(const CpmStopwatch *sw) {
    uint64_t now;
    if (!sw) return 0U;
    if (!sw->running) return sw->elapsedNs;
    now = CpmTime_MonotonicNs();
    return sw->elapsedNs + (now >= sw->startNs ? now - sw->startNs : 0U);
}

uint64_t CpmStopwatch_ElapsedUs(const CpmStopwatch *sw) { return CpmStopwatch_ElapsedNs(sw) / CPM_NS_PER_US; }
double CpmStopwatch_ElapsedMs(const CpmStopwatch *sw) { return CpmTime_NsToMilliseconds(CpmStopwatch_ElapsedNs(sw)); }
double CpmStopwatch_ElapsedSeconds(const CpmStopwatch *sw) { return CpmTime_NsToSeconds(CpmStopwatch_ElapsedNs(sw)); }
double CpmStopwatch_ElapsedMinutes(const CpmStopwatch *sw) { return CpmTime_NsToMinutes(CpmStopwatch_ElapsedNs(sw)); }
double CpmStopwatch_ElapsedHours(const CpmStopwatch *sw) { return CpmTime_NsToHours(CpmStopwatch_ElapsedNs(sw)); }
void CpmStopwatch_ElapsedParts(const CpmStopwatch *sw, CpmTimeParts *out) { CpmTime_DecomposeNs(CpmStopwatch_ElapsedNs(sw), out); }
int CpmStopwatch_Format(const CpmStopwatch *sw, CpmDurationFormat format, char *buffer, size_t bufferSize) {
    return CpmTime_FormatDurationNs(CpmStopwatch_ElapsedNs(sw), format, buffer, bufferSize);
}

int CpmPeriodicTimer_Init(CpmPeriodicTimer *timer, uint64_t periodUs) {
    uint64_t periodNs;
    if (!timer || periodUs == 0U || cpm_mul_u64(periodUs, CPM_NS_PER_US, &periodNs) != 0) return -1;
    timer->periodNs = periodNs;
    timer->nextDeadlineNs = 0U;
    timer->started = 0;
    return 0;
}

int CpmPeriodicTimer_InitMs(CpmPeriodicTimer *timer, uint64_t periodMs) {
    uint64_t us;
    if (cpm_mul_u64(periodMs, 1000ULL, &us) != 0) return -1;
    return CpmPeriodicTimer_Init(timer, us);
}

void CpmPeriodicTimer_Reset(CpmPeriodicTimer *timer) {
    if (timer) { timer->nextDeadlineNs = 0U; timer->started = 0; }
}

uint64_t CpmPeriodicTimer_RemainingNs(const CpmPeriodicTimer *timer) {
    uint64_t now;
    if (!timer || !timer->started) return 0U;
    now = CpmTime_MonotonicNs();
    return timer->nextDeadlineNs > now ? timer->nextDeadlineNs - now : 0U;
}

int CpmPeriodicTimer_WaitNext(CpmPeriodicTimer *timer, int *overrun) {
    uint64_t now;
    uint64_t late;
    if (!timer || timer->periodNs == 0U) return -1;
    now = CpmTime_MonotonicNs();
    if (!timer->started) {
        if (UINT64_MAX - now < timer->periodNs) return -3;
        timer->nextDeadlineNs = now + timer->periodNs;
        timer->started = 1;
    }
    if (now < timer->nextDeadlineNs) {
        if (CpmTime_SleepNs(timer->nextDeadlineNs - now) != 0) return -2;
        now = CpmTime_MonotonicNs();
    }
    late = now > timer->nextDeadlineNs ? now - timer->nextDeadlineNs : 0U;
    {
        uint64_t missed = late / timer->periodNs;
        uint64_t advance = missed + 1U;
        if (overrun) *overrun = missed > (uint64_t)INT_MAX ? INT_MAX : (int)missed;
        if (advance > (UINT64_MAX - timer->nextDeadlineNs) / timer->periodNs) {
            timer->started = 0;
            return -3;
        }
        timer->nextDeadlineNs += advance * timer->periodNs;
    }
    return 0;
}

void CpmDeadline_Clear(CpmDeadline *deadline) {
    if (deadline) { deadline->deadlineNs = 0U; deadline->active = 0; }
}

int CpmDeadline_AfterNs(CpmDeadline *deadline, uint64_t delayNs) {
    uint64_t now;
    if (!deadline) return -1;
    now = CpmTime_MonotonicNs();
    if (UINT64_MAX - now < delayNs) return -2;
    deadline->deadlineNs = now + delayNs;
    deadline->active = 1;
    return 0;
}

int CpmDeadline_AfterMs(CpmDeadline *deadline, uint64_t delayMs) {
    uint64_t ns;
    return cpm_mul_u64(delayMs, CPM_NS_PER_MS, &ns) == 0 ? CpmDeadline_AfterNs(deadline, ns) : -1;
}

int CpmDeadline_AfterSeconds(CpmDeadline *deadline, double delaySeconds) {
    if (!isfinite(delaySeconds) || delaySeconds < 0.0 ||
        (long double)delaySeconds * 1000000000.0L > (long double)UINT64_MAX) return -1;
    return CpmDeadline_AfterNs(deadline, (uint64_t)((long double)delaySeconds * 1000000000.0L));
}

int CpmDeadline_AtMonotonicNs(CpmDeadline *deadline, uint64_t monotonicNs) {
    if (!deadline) return -1;
    deadline->deadlineNs = monotonicNs;
    deadline->active = 1;
    return 0;
}

int CpmDeadline_IsExpired(const CpmDeadline *deadline) {
    return deadline && deadline->active ? CpmTime_MonotonicNs() >= deadline->deadlineNs : 0;
}

uint64_t CpmDeadline_RemainingNs(const CpmDeadline *deadline) {
    uint64_t now;
    if (!deadline || !deadline->active) return 0U;
    now = CpmTime_MonotonicNs();
    return deadline->deadlineNs > now ? deadline->deadlineNs - now : 0U;
}

uint64_t CpmDeadline_RemainingMs(const CpmDeadline *deadline) { return CpmDeadline_RemainingNs(deadline) / CPM_NS_PER_MS; }
double CpmDeadline_RemainingSeconds(const CpmDeadline *deadline) { return CpmTime_NsToSeconds(CpmDeadline_RemainingNs(deadline)); }

void CpmScheduler_Init(CpmScheduler *scheduler) {
    if (scheduler) {
        scheduler->timers = NULL;
        scheduler->count = 0U;
        scheduler->capacity = 0U;
        scheduler->nextId = 1U;
    }
}

void CpmScheduler_Free(CpmScheduler *scheduler) {
    if (!scheduler) return;
    free(scheduler->timers);
    CpmScheduler_Init(scheduler);
}

void CpmScheduler_Clear(CpmScheduler *scheduler) {
    if (!scheduler) return;
    scheduler->count = 0U;
}

size_t CpmScheduler_Count(const CpmScheduler *scheduler) {
    size_t i;
    size_t active = 0U;
    if (!scheduler) return 0U;
    for (i = 0U; i < scheduler->count; ++i) if (scheduler->timers[i].active) ++active;
    return active;
}

static int cpm_scheduler_reserve(CpmScheduler *scheduler, size_t needed) {
    CpmScheduledTimer *next;
    size_t capacity;
    if (needed <= scheduler->capacity) return 0;
    capacity = scheduler->capacity == 0U ? 8U : scheduler->capacity;
    while (capacity < needed) {
        if (capacity > SIZE_MAX / 2U) return -1;
        capacity *= 2U;
    }
    next = (CpmScheduledTimer *)realloc(scheduler->timers, capacity * sizeof(*next));
    if (!next) return -1;
    scheduler->timers = next;
    scheduler->capacity = capacity;
    return 0;
}

static CpmTimerId cpm_scheduler_add(CpmScheduler *scheduler, uint64_t deadlineNs, uint64_t periodNs, CpmTimerCallback callback, void *userData) {
    CpmScheduledTimer *timer;
    size_t i;
    if (!scheduler || !callback) return 0U;
    for (i = 0U; i < scheduler->count; ++i) {
        if (!scheduler->timers[i].active) break;
    }
    if (i == scheduler->count) {
        if (cpm_scheduler_reserve(scheduler, scheduler->count + 1U) != 0) return 0U;
        ++scheduler->count;
    }
    timer = &scheduler->timers[i];
    memset(timer, 0, sizeof(*timer));
    timer->id = scheduler->nextId++;
    if (scheduler->nextId == 0U) scheduler->nextId = 1U;
    timer->deadlineNs = deadlineNs;
    timer->periodNs = periodNs;
    timer->callback = callback;
    timer->userData = userData;
    timer->active = 1;
    return timer->id;
}

CpmTimerId CpmScheduler_ScheduleAfterNs(CpmScheduler *scheduler, uint64_t delayNs, CpmTimerCallback callback, void *userData) {
    uint64_t now = CpmTime_MonotonicNs();
    if (UINT64_MAX - now < delayNs) return 0U;
    return cpm_scheduler_add(scheduler, now + delayNs, 0U, callback, userData);
}

CpmTimerId CpmScheduler_ScheduleAfterMs(CpmScheduler *scheduler, uint64_t delayMs, CpmTimerCallback callback, void *userData) {
    uint64_t ns;
    if (cpm_mul_u64(delayMs, CPM_NS_PER_MS, &ns) != 0) return 0U;
    return CpmScheduler_ScheduleAfterNs(scheduler, ns, callback, userData);
}

CpmTimerId CpmScheduler_ScheduleAtMonotonicNs(CpmScheduler *scheduler, uint64_t deadlineNs, CpmTimerCallback callback, void *userData) {
    return cpm_scheduler_add(scheduler, deadlineNs, 0U, callback, userData);
}

CpmTimerId CpmScheduler_ScheduleAtEpochMs(CpmScheduler *scheduler, uint64_t epochMs, CpmTimerCallback callback, void *userData) {
    uint64_t nowEpoch = CpmTime_EpochMs();
    uint64_t nowMono = CpmTime_MonotonicNs();
    uint64_t deltaMs;
    uint64_t deltaNs;
    if (epochMs <= nowEpoch) return cpm_scheduler_add(scheduler, nowMono, 0U, callback, userData);
    deltaMs = epochMs - nowEpoch;
    if (cpm_mul_u64(deltaMs, CPM_NS_PER_MS, &deltaNs) != 0 || UINT64_MAX - nowMono < deltaNs) return 0U;
    return cpm_scheduler_add(scheduler, nowMono + deltaNs, 0U, callback, userData);
}

CpmTimerId CpmScheduler_ScheduleEveryNs(CpmScheduler *scheduler, uint64_t periodNs, uint64_t firstDelayNs, CpmTimerCallback callback, void *userData) {
    uint64_t now;
    if (periodNs == 0U) return 0U;
    now = CpmTime_MonotonicNs();
    if (firstDelayNs == 0U) firstDelayNs = periodNs;
    if (UINT64_MAX - now < firstDelayNs) return 0U;
    return cpm_scheduler_add(scheduler, now + firstDelayNs, periodNs, callback, userData);
}

CpmTimerId CpmScheduler_ScheduleEveryMs(CpmScheduler *scheduler, uint64_t periodMs, uint64_t firstDelayMs, CpmTimerCallback callback, void *userData) {
    uint64_t periodNs;
    uint64_t firstNs;
    if (cpm_mul_u64(periodMs, CPM_NS_PER_MS, &periodNs) != 0) return 0U;
    if (firstDelayMs == 0U) firstNs = 0U;
    else if (cpm_mul_u64(firstDelayMs, CPM_NS_PER_MS, &firstNs) != 0) return 0U;
    else { /* firstNs already set */ }
    return CpmScheduler_ScheduleEveryNs(scheduler, periodNs, firstNs, callback, userData);
}

int CpmScheduler_Cancel(CpmScheduler *scheduler, CpmTimerId timerId) {
    size_t i;
    if (!scheduler || timerId == 0U) return -1;
    for (i = 0U; i < scheduler->count; ++i) {
        if (scheduler->timers[i].active && scheduler->timers[i].id == timerId) {
            scheduler->timers[i].active = 0;
            return 0;
        }
    }
    return 1;
}

int CpmScheduler_IsScheduled(const CpmScheduler *scheduler, CpmTimerId timerId) {
    size_t i;
    if (!scheduler || timerId == 0U) return 0;
    for (i = 0U; i < scheduler->count; ++i) {
        if (scheduler->timers[i].active && scheduler->timers[i].id == timerId) return 1;
    }
    return 0;
}

uint64_t CpmScheduler_TimeUntilNextNs(const CpmScheduler *scheduler) {
    size_t i;
    uint64_t now;
    uint64_t best = UINT64_MAX;
    if (!scheduler) return UINT64_MAX;
    now = CpmTime_MonotonicNs();
    for (i = 0U; i < scheduler->count; ++i) {
        const CpmScheduledTimer *timer = &scheduler->timers[i];
        uint64_t remaining;
        if (!timer->active) continue;
        if (timer->deadlineNs <= now) return 0U;
        remaining = timer->deadlineNs - now;
        if (remaining < best) best = remaining;
    }
    return best;
}

/* Advance to the first future tick in O(1), even after suspend/resume. */
static int cpm_timer_advance(CpmScheduledTimer *timer, uint64_t now) {
    uint64_t count;
    if (timer->periodNs == 0U || now < timer->deadlineNs) return -1;
    count = (now - timer->deadlineNs) / timer->periodNs + 1U;
    if (count > (UINT64_MAX - timer->deadlineNs) / timer->periodNs) {
        timer->active = 0;
        return -1;
    }
    timer->deadlineNs += count * timer->periodNs;
    return 0;
}

/* A synchronous delay with interim callbacks. Never spin or replay missed ticks. */
int CpmTime_DelayWithCallbackMs(uint64_t timeoutMs, uint64_t intervalMs,
                                CpmIntervalCallback callback, void *userData) {
    uint64_t start, end, next, timeoutNs, intervalNs, count = 0;
    if (!callback || intervalMs == 0U ||
        cpm_mul_u64(timeoutMs, CPM_NS_PER_MS, &timeoutNs) != 0 ||
        cpm_mul_u64(intervalMs, CPM_NS_PER_MS, &intervalNs) != 0) return -1;
    start = CpmTime_MonotonicNs();
    if (!start || UINT64_MAX - start < timeoutNs) return -2;
    end = start + timeoutNs;
    next = (intervalNs >= timeoutNs) ? end : start + intervalNs;
    for (;;) {
        uint64_t now = CpmTime_MonotonicNs();
        uint64_t target;
        if (!now) return -2;
        if (now >= end) return 0;
        target = next < end ? next : end;
        if (now < target) {
            if (CpmTime_SleepNs(target - now) != 0) return -3;
            continue;
        }
        /* The target was the deadline, not an interval tick. */
        if (next >= end) return 0;
        ++count;
        if (callback(0U, (now - start) / CPM_NS_PER_MS, count, userData) != 0) return 1;
        {
            uint64_t after = CpmTime_MonotonicNs();
            uint64_t ticks;
            if (!after) return -2;
            ticks = after >= next ? (after - next) / intervalNs + 1U : 1U;
            if (ticks > (UINT64_MAX - next) / intervalNs) next = end;
            else next += ticks * intervalNs;
        }
    }
}

static void cpm_scheduler_placeholder(CpmTimerId id, uint64_t scheduledNs,
                                     uint64_t firedNs, uint64_t invocation,
                                     void *userData) {
    (void)id; (void)scheduledNs; (void)firedNs; (void)invocation; (void)userData;
}

CpmTimerId CpmScheduler_ScheduleForMs(CpmScheduler *scheduler,
                                      uint64_t timeoutMs, uint64_t intervalMs,
                                      CpmIntervalCallback callback,
                                      CpmIntervalFinishCallback onFinish,
                                      void *userData) {
    uint64_t now, timeoutNs, intervalNs, end, first;
    CpmTimerId id;
    size_t i;
    if (!scheduler || !callback || intervalMs == 0U ||
        cpm_mul_u64(timeoutMs, CPM_NS_PER_MS, &timeoutNs) != 0 ||
        cpm_mul_u64(intervalMs, CPM_NS_PER_MS, &intervalNs) != 0) return 0U;
    now = CpmTime_MonotonicNs();
    if (!now || UINT64_MAX - now < timeoutNs) return 0U;
    end = now + timeoutNs;
    first = intervalNs < timeoutNs ? now + intervalNs : end;
    id = cpm_scheduler_add(scheduler, first, intervalNs, cpm_scheduler_placeholder, userData);
    if (!id) return 0U;
    for (i = 0U; i < scheduler->count; ++i) {
        CpmScheduledTimer *timer = &scheduler->timers[i];
        if (timer->active && timer->id == id) {
            timer->intervalStartNs = now;
            timer->timeoutNs = end;
            timer->intervalCallback = callback;
            timer->finishCallback = onFinish;
            break;
        }
    }
    return id;
}

int CpmScheduler_Poll(CpmScheduler *scheduler, size_t maxCallbacks) {
    size_t firedCount = 0U;
    if (!scheduler) return -1;
    for (;;) {
        size_t i, dueIndex = SIZE_MAX;
        uint64_t now = CpmTime_MonotonicNs();
        uint64_t earliest = UINT64_MAX;
        CpmScheduledTimer event;
        CpmIntervalEndReason reason = CPM_INTERVAL_TIMEOUT;
        int finish = 0;
        if (!now) return -2;
        for (i = 0U; i < scheduler->count; ++i) {
            const CpmScheduledTimer *timer = &scheduler->timers[i];
            if (!timer->active || timer->deadlineNs > now) continue;
            if (timer->deadlineNs < earliest) { earliest = timer->deadlineNs; dueIndex = i; }
        }
        if (dueIndex == SIZE_MAX) break;
        event = scheduler->timers[dueIndex];
        if (event.intervalCallback && now >= event.timeoutNs) {
            scheduler->timers[dueIndex].active = 0;
            finish = 1;
        } else {
            ++scheduler->timers[dueIndex].invocation;
            event.invocation = scheduler->timers[dueIndex].invocation;
            if (event.periodNs == 0U) scheduler->timers[dueIndex].active = 0;
            else {
                cpm_timer_advance(&scheduler->timers[dueIndex], now);
                if (event.intervalCallback && scheduler->timers[dueIndex].active &&
                    scheduler->timers[dueIndex].deadlineNs > event.timeoutNs)
                    scheduler->timers[dueIndex].deadlineNs = event.timeoutNs;
            }
        }
        if (finish) {
            if (event.finishCallback)
                event.finishCallback(event.id, reason,
                    (now - event.intervalStartNs) / CPM_NS_PER_MS,
                    event.invocation, event.userData);
        } else if (event.intervalCallback) {
            int stop = event.intervalCallback(event.id,
                (now - event.intervalStartNs) / CPM_NS_PER_MS,
                event.invocation, event.userData);
            if (stop == 0) {
                uint64_t after = CpmTime_MonotonicNs();
                for (i = 0U; i < scheduler->count; ++i) {
                    CpmScheduledTimer *timer = &scheduler->timers[i];
                    if (timer->active && timer->id == event.id) {
                        if (after >= timer->deadlineNs) cpm_timer_advance(timer, after);
                        if (timer->active && timer->deadlineNs > event.timeoutNs)
                            timer->deadlineNs = event.timeoutNs;
                        break;
                    }
                }
            } else {
                for (i = 0U; i < scheduler->count; ++i) {
                    CpmScheduledTimer *timer = &scheduler->timers[i];
                    if (timer->active && timer->id == event.id) {
                        timer->active = 0;
                        reason = CPM_INTERVAL_STOPPED;
                        if (event.finishCallback)
                            event.finishCallback(event.id, reason,
                                (CpmTime_MonotonicNs() - event.intervalStartNs) / CPM_NS_PER_MS,
                                event.invocation, event.userData);
                        break;
                    }
                }
            }
        } else {
            event.callback(event.id, event.deadlineNs, now, event.invocation, event.userData);
        }
        ++firedCount;
        if (maxCallbacks != 0U && firedCount >= maxCallbacks) break;
    }
    return firedCount > (size_t)INT_MAX ? INT_MAX : (int)firedCount;
}

int CpmScheduler_WaitAndPoll(CpmScheduler *scheduler, uint64_t maxSleepMs, size_t maxCallbacks) {
    uint64_t waitNs;
    uint64_t maxNs;
    if (!scheduler) return -1;
    waitNs = CpmScheduler_TimeUntilNextNs(scheduler);
    if (cpm_mul_u64(maxSleepMs, CPM_NS_PER_MS, &maxNs) != 0) maxNs = UINT64_MAX;
    if (waitNs == UINT64_MAX || waitNs > maxNs) waitNs = maxNs;
    if (waitNs > 0U && waitNs != UINT64_MAX && CpmTime_SleepNs(waitNs) != 0) return -2;
    return CpmScheduler_Poll(scheduler, maxCallbacks);
}
