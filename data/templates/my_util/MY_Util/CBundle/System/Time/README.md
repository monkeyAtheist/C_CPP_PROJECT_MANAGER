# CPM C Time & Scheduler bundle

Cross-platform time utilities for Windows and POSIX with a small, dependency-free C API.

## What it provides

- High-resolution monotonic time in ns/us/ms.
- Unix epoch time in seconds/ms/us/ns.
- Local and UTC calendar values (`CpmDateTime`).
- Duration decomposition into days/hours/minutes/seconds/ms/us/ns.
- Duration formatting: `HH:MM:SS`, `HH:MM:SS.mmm`, compact and verbose forms.
- Portable sleeps in ns/us/ms/seconds.
- Stopwatch with start/stop/restart/lap and direct elapsed values in us/ms/s/min/h.
- Drift-resistant periodic loop timer.
- Deadline/timeout helper with remaining-time queries.
- Callback scheduler for one-shot, periodic and **bounded (interval + timeout)** jobs.
- Blocking `CpmTime_DelayWithCallbackMs` with interim callbacks and early-stop support.

## Elapsed time

```c
CpmStopwatch sw = {0};
CpmStopwatch_Start(&sw);

/* work */

double seconds = CpmStopwatch_ElapsedSeconds(&sw);
double minutes = CpmStopwatch_ElapsedMinutes(&sw);
double hours   = CpmStopwatch_ElapsedHours(&sw);

CpmTimeParts parts;
CpmStopwatch_ElapsedParts(&sw, &parts);

char text[64];
CpmStopwatch_Format(&sw, CPM_DURATION_HMS_MS, text, sizeof(text));
/* e.g. 01:42:08.532 */
```

## Current date/time

```c
CpmDateTime now;
CpmTime_NowLocal(&now);
printf("%04d-%02d-%02d %02d:%02d:%02d.%03d\n",
       now.year, now.month, now.day,
       now.hour, now.minute, now.second, now.millisecond);
```

## Deadline

```c
CpmDeadline timeout;
CpmDeadline_AfterMs(&timeout, 500);

while (!CpmDeadline_IsExpired(&timeout)) {
    /* wait for an event */
}
```

## Scheduled callbacks

The C scheduler deliberately does **not** create a hidden worker thread. Callbacks execute on the thread that calls `CpmScheduler_Poll()` / `CpmScheduler_WaitAndPoll()`. This is useful in deterministic test benches, acquisition loops and UI/event loops.

```c
static void OnTimer(CpmTimerId id,
                    uint64_t scheduledNs,
                    uint64_t firedNs,
                    uint64_t invocation,
                    void *userData)
{
    (void)id;
    (void)scheduledNs;
    (void)firedNs;
    (void)userData;
    printf("tick %llu\n", (unsigned long long)invocation);
}

CpmScheduler scheduler;
CpmScheduler_Init(&scheduler);

CpmScheduler_ScheduleAfterMs(&scheduler, 250, OnTimer, NULL);
CpmTimerId periodic = CpmScheduler_ScheduleEveryMs(
    &scheduler, 2000, 2000, OnTimer, NULL);

while (running) {
    CpmScheduler_WaitAndPoll(&scheduler, 100, 0);
}

CpmScheduler_Cancel(&scheduler, periodic);
CpmScheduler_Free(&scheduler);
```

`ScheduleAtEpochMs()` can be used for a wall-clock trigger. Internally it converts the requested epoch time to a monotonic deadline at scheduling time, so later wall-clock adjustments do not cause timer drift.

## Precision

High-resolution clocks measure time accurately, but callback/sleep scheduling latency is still limited by the operating system scheduler and current system load.

## Interval until timeout (new in 0.2.108)

Blocking, no hidden thread:

```c
static int OnInterval(CpmTimerId id, uint64_t elapsedMs,
                      uint64_t count, void *userData) {
    (void)id; (void)count; (void)userData;
    printf("elapsed = %llu ms\n", (unsigned long long)elapsedMs);
    return 0; /* nonzero: stop early */
}
int result = CpmTime_DelayWithCallbackMs(5000, 250, OnInterval, NULL);
/* result: 0 timeout, 1 early stop, negative error */
```

Non-blocking, with a finish callback:

```c
static void OnFinish(CpmTimerId id, CpmIntervalEndReason reason,
                     uint64_t elapsedMs, uint64_t calls, void *context) {
    (void)id; (void)elapsedMs; (void)calls; (void)context;
    printf("finished: %s\n", reason == CPM_INTERVAL_TIMEOUT ? "timeout" : "stopped");
}
CpmScheduler scheduler;
CpmScheduler_Init(&scheduler);
CpmTimerId id = CpmScheduler_ScheduleForMs(&scheduler, 5000, 250,
                                           OnInterval, OnFinish, NULL);
while (CpmScheduler_IsScheduled(&scheduler, id))
    CpmScheduler_WaitAndPoll(&scheduler, 100, 0);
CpmScheduler_Free(&scheduler);
```

**Semantics:** the first call is scheduled at `start + interval`; callback invocations
occur strictly before `start + timeout`. On a coincident deadline, timeout wins.
Callbacks delayed by OS scheduling are not replayed in a burst. A callback that
returns nonzero stops immediately and delivers `CPM_INTERVAL_STOPPED` to onFinish.
`Cancel`, `Clear` and `Free` are silent; they do not call `onFinish`. A timeout
of zero results in immediate completion upon polling and no tick. C scheduler
callbacks run on the thread that calls `Poll`, not a hidden worker. Neither
`WaitAndPoll` nor a blocking delay supplies hard-real-time guarantees.
Do not call `CpmScheduler_Free` from inside a callback.
