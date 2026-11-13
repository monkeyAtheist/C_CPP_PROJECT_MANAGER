# CPM C++ Time & Scheduler bundle

C++17 time utilities built around `std::chrono`.

## Main types

- `cpm::Stopwatch`: elapsed ns/us/ms/s/min/h, lap, decomposition and string formatting.
- `cpm::Deadline`: simple timeout/deadline helper.
- `cpm::PeriodicTimer`: drift-resistant periodic loop.
- `cpm::Scheduler`: one-shot, periodic and **bounded interval/timeout** callbacks.
- `cpm::DateTime`: local/UTC calendar values.

## Elapsed values and formatting

```cpp
cpm::Stopwatch sw;
sw.start();

const double seconds = sw.elapsedSeconds();
const double minutes = sw.elapsedMinutes();
const double hours   = sw.elapsedHours();
const auto parts     = sw.parts();
const std::string text = sw.str(); // HH:MM:SS.mmm
```

## Scheduler

The scheduler supports two modes:

1. `poll()` / `waitAndPoll()` executes callbacks on the caller thread.
2. `startBackground()` runs callbacks on one background worker thread until `stopBackground()`.

```cpp
cpm::Scheduler scheduler;

scheduler.after(std::chrono::milliseconds(250),
    [](const cpm::TimerEvent& event) {
        // one-shot
    });

const auto id = scheduler.every(std::chrono::seconds(2),
    [](const cpm::TimerEvent& event) {
        // event.invocation, event.lateness, event.scheduled, event.fired
    });

scheduler.startBackground();
// ...
scheduler.cancel(id);
scheduler.stopBackground();
```

Callbacks in background mode execute on the scheduler worker thread. Synchronize access to shared application state as usual. Do not destroy the scheduler from one of its own callbacks.

## Timeout + interval

```cpp
const bool stoppedEarly = cpm::delayWithCallback(
    std::chrono::seconds(5), std::chrono::milliseconds(250),
    [](std::chrono::milliseconds elapsed, std::uint64_t count) {
        (void)elapsed; (void)count;
        return false; // true = stop early
    });
```

Non-blocking, either manually polled or with an explicit background worker:

```cpp
cpm::Scheduler scheduler;
const auto id = scheduler.everyUntil(
    std::chrono::milliseconds(250), std::chrono::seconds(5),
    [](const cpm::TimerEvent& e) {
        (void)e;
        return false; // true = stop early
    },
    [](cpm::TimerId id, cpm::TimedEndReason reason, std::uint64_t ticks) {
        (void)id; (void)reason; (void)ticks;
    });
while (scheduler.scheduled(id)) scheduler.waitAndPoll(std::chrono::milliseconds(100));
```

`onFinish` is called on timeout or early-stop, never after explicit `cancel`/`clear`.
No interval tick runs at or after the timeout; missed ticks are skipped. A zero
interval or negative duration is rejected. `PeriodicTimer` rejects a zero/negative
period with `std::invalid_argument`. `stopBackground()` can now be requested from
a callback; another thread (normally the owner) must subsequently join the worker.
Never destroy `Scheduler` on its own worker, and do not call `poll()` concurrently
with the background worker. Background callbacks must not leak exceptions.
