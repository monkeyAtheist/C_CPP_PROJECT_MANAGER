#pragma once

#include <algorithm>
#include <atomic>
#include <chrono>
#include <condition_variable>
#include <cstdint>
#include <cstdio>
#include <ctime>
#include <functional>
#include <limits>
#include <mutex>
#include <sstream>
#include <stdexcept>
#include <string>
#include <thread>
#include <utility>
#include <vector>

namespace cpm {

using SteadyClock = std::chrono::steady_clock;
using SystemClock = std::chrono::system_clock;
using TimerId = std::uint64_t;

struct DurationParts {
    std::uint64_t days{};
    unsigned hours{};
    unsigned minutes{};
    unsigned seconds{};
    unsigned milliseconds{};
    unsigned microseconds{};
    unsigned nanoseconds{};
};

enum class DurationFormat {
    Hms,
    HmsMilliseconds,
    DaysHmsMilliseconds,
    Compact,
    Verbose
};

inline DurationParts splitDuration(std::chrono::nanoseconds duration) {
    using namespace std::chrono;
    if (duration < nanoseconds::zero()) duration = nanoseconds::zero();
    auto ns = static_cast<std::uint64_t>(duration.count());
    DurationParts p;
    constexpr std::uint64_t nsUs = 1000ULL;
    constexpr std::uint64_t nsMs = 1000000ULL;
    constexpr std::uint64_t nsSec = 1000000000ULL;
    constexpr std::uint64_t nsMin = 60ULL * nsSec;
    constexpr std::uint64_t nsHour = 60ULL * nsMin;
    constexpr std::uint64_t nsDay = 24ULL * nsHour;
    p.days = ns / nsDay; ns %= nsDay;
    p.hours = static_cast<unsigned>(ns / nsHour); ns %= nsHour;
    p.minutes = static_cast<unsigned>(ns / nsMin); ns %= nsMin;
    p.seconds = static_cast<unsigned>(ns / nsSec); ns %= nsSec;
    p.milliseconds = static_cast<unsigned>(ns / nsMs); ns %= nsMs;
    p.microseconds = static_cast<unsigned>(ns / nsUs);
    p.nanoseconds = static_cast<unsigned>(ns % nsUs);
    return p;
}

inline std::string formatDuration(std::chrono::nanoseconds duration, DurationFormat format = DurationFormat::HmsMilliseconds) {
    const auto p = splitDuration(duration);
    char buffer[160]{};
    switch (format) {
        case DurationFormat::Hms:
            std::snprintf(buffer, sizeof(buffer), "%02llu:%02u:%02u",
                static_cast<unsigned long long>(p.days * 24ULL + p.hours), p.minutes, p.seconds);
            break;
        case DurationFormat::HmsMilliseconds:
            std::snprintf(buffer, sizeof(buffer), "%02llu:%02u:%02u.%03u",
                static_cast<unsigned long long>(p.days * 24ULL + p.hours), p.minutes, p.seconds, p.milliseconds);
            break;
        case DurationFormat::DaysHmsMilliseconds:
            std::snprintf(buffer, sizeof(buffer), "%llud %02u:%02u:%02u.%03u",
                static_cast<unsigned long long>(p.days), p.hours, p.minutes, p.seconds, p.milliseconds);
            break;
        case DurationFormat::Compact:
            if (p.days) std::snprintf(buffer, sizeof(buffer), "%llud %uh %umin %us %ums", static_cast<unsigned long long>(p.days), p.hours, p.minutes, p.seconds, p.milliseconds);
            else if (p.hours) std::snprintf(buffer, sizeof(buffer), "%uh %umin %us %ums", p.hours, p.minutes, p.seconds, p.milliseconds);
            else if (p.minutes) std::snprintf(buffer, sizeof(buffer), "%umin %us %ums", p.minutes, p.seconds, p.milliseconds);
            else std::snprintf(buffer, sizeof(buffer), "%us %ums", p.seconds, p.milliseconds);
            break;
        case DurationFormat::Verbose:
            std::snprintf(buffer, sizeof(buffer), "%llu days, %u hours, %u minutes, %u seconds, %u ms, %u us, %u ns",
                static_cast<unsigned long long>(p.days), p.hours, p.minutes, p.seconds,
                p.milliseconds, p.microseconds, p.nanoseconds);
            break;
    }
    return buffer;
}

inline std::uint64_t monotonicNs() {
    return static_cast<std::uint64_t>(std::chrono::duration_cast<std::chrono::nanoseconds>(SteadyClock::now().time_since_epoch()).count());
}
inline std::uint64_t monotonicUs() { return monotonicNs() / 1000ULL; }
inline std::uint64_t monotonicMs() { return monotonicNs() / 1000000ULL; }
inline std::uint64_t epochNs() {
    return static_cast<std::uint64_t>(std::chrono::duration_cast<std::chrono::nanoseconds>(SystemClock::now().time_since_epoch()).count());
}
inline std::uint64_t epochUs() { return epochNs() / 1000ULL; }
inline std::uint64_t epochMs() { return epochNs() / 1000000ULL; }
inline std::uint64_t epochSeconds() { return epochNs() / 1000000000ULL; }

template<class Rep, class Period>
inline void sleepFor(std::chrono::duration<Rep, Period> duration) {
    if (duration > decltype(duration)::zero()) std::this_thread::sleep_for(duration);
}

struct DateTime {
    int year{};
    int month{};
    int day{};
    int hour{};
    int minute{};
    int second{};
    int millisecond{};
    int weekday{};
    int yearday{};
    std::uint64_t epochMilliseconds{};
};

inline DateTime dateTimeFrom(SystemClock::time_point timePoint, bool utc = false) {
    const auto millis = std::chrono::duration_cast<std::chrono::milliseconds>(timePoint.time_since_epoch()).count();
    const auto value = SystemClock::to_time_t(timePoint);
    std::tm tmValue{};
#if defined(_WIN32)
    if (utc) gmtime_s(&tmValue, &value); else localtime_s(&tmValue, &value);
#else
    if (utc) gmtime_r(&value, &tmValue); else localtime_r(&value, &tmValue);
#endif
    DateTime out;
    out.year = tmValue.tm_year + 1900;
    out.month = tmValue.tm_mon + 1;
    out.day = tmValue.tm_mday;
    out.hour = tmValue.tm_hour;
    out.minute = tmValue.tm_min;
    out.second = tmValue.tm_sec;
    out.millisecond = static_cast<int>((millis % 1000 + 1000) % 1000);
    out.weekday = tmValue.tm_wday;
    out.yearday = tmValue.tm_yday;
    out.epochMilliseconds = millis < 0 ? 0ULL : static_cast<std::uint64_t>(millis);
    return out;
}

inline DateTime localNow() { return dateTimeFrom(SystemClock::now(), false); }
inline DateTime utcNow() { return dateTimeFrom(SystemClock::now(), true); }

inline std::string formatDateTime(SystemClock::time_point timePoint = SystemClock::now(), const char* format = "%Y-%m-%d %H:%M:%S", bool utc = false) {
    const auto value = SystemClock::to_time_t(timePoint);
    std::tm tmValue{};
#if defined(_WIN32)
    if (utc) gmtime_s(&tmValue, &value); else localtime_s(&tmValue, &value);
#else
    if (utc) gmtime_r(&value, &tmValue); else localtime_r(&value, &tmValue);
#endif
    char buffer[128]{};
    if (std::strftime(buffer, sizeof(buffer), format ? format : "%Y-%m-%d %H:%M:%S", &tmValue) == 0) return {};
    return buffer;
}

class Stopwatch {
public:
    void start() {
        if (!running_) { start_ = SteadyClock::now(); running_ = true; }
    }
    void restart() {
        elapsed_ = SteadyClock::duration::zero();
        start_ = SteadyClock::now();
        running_ = true;
    }
    void reset() {
        elapsed_ = SteadyClock::duration::zero();
        running_ = false;
    }
    void stop() {
        if (running_) { elapsed_ += SteadyClock::now() - start_; running_ = false; }
    }
    std::chrono::nanoseconds lap() {
        if (!running_) return std::chrono::nanoseconds::zero();
        const auto now = SteadyClock::now();
        const auto delta = now - start_;
        elapsed_ += delta;
        start_ = now;
        return std::chrono::duration_cast<std::chrono::nanoseconds>(delta);
    }
    bool running() const noexcept { return running_; }

    template<class Duration = std::chrono::milliseconds>
    Duration elapsed() const {
        return std::chrono::duration_cast<Duration>(elapsedDuration());
    }
    std::chrono::nanoseconds elapsedNanoseconds() const { return elapsed<std::chrono::nanoseconds>(); }
    std::chrono::microseconds elapsedMicroseconds() const { return elapsed<std::chrono::microseconds>(); }
    std::chrono::milliseconds elapsedMilliseconds() const { return elapsed<std::chrono::milliseconds>(); }
    double elapsedSeconds() const { return std::chrono::duration<double>(elapsedDuration()).count(); }
    double elapsedMinutes() const { return elapsedSeconds() / 60.0; }
    double elapsedHours() const { return elapsedMinutes() / 60.0; }
    DurationParts parts() const { return splitDuration(elapsedNanoseconds()); }
    std::string str(DurationFormat format = DurationFormat::HmsMilliseconds) const { return formatDuration(elapsedNanoseconds(), format); }

private:
    SteadyClock::duration elapsedDuration() const {
        return elapsed_ + (running_ ? SteadyClock::now() - start_ : SteadyClock::duration::zero());
    }
    SteadyClock::time_point start_{};
    SteadyClock::duration elapsed_{};
    bool running_{false};
};

class Deadline {
public:
    Deadline() = default;
    template<class Rep, class Period>
    explicit Deadline(std::chrono::duration<Rep, Period> delay) { reset(delay); }

    template<class Rep, class Period>
    void reset(std::chrono::duration<Rep, Period> delay) {
        deadline_ = SteadyClock::now() + std::chrono::duration_cast<SteadyClock::duration>(delay);
        active_ = true;
    }
    void set(SteadyClock::time_point deadline) { deadline_ = deadline; active_ = true; }
    void clear() noexcept { active_ = false; }
    bool active() const noexcept { return active_; }
    bool expired() const { return active_ && SteadyClock::now() >= deadline_; }
    SteadyClock::time_point timePoint() const noexcept { return deadline_; }

    template<class Duration = std::chrono::milliseconds>
    Duration remaining() const {
        if (!active_) return Duration::zero();
        const auto now = SteadyClock::now();
        if (now >= deadline_) return Duration::zero();
        return std::chrono::duration_cast<Duration>(deadline_ - now);
    }

private:
    SteadyClock::time_point deadline_{};
    bool active_{false};
};

class PeriodicTimer {
public:
    explicit PeriodicTimer(std::chrono::nanoseconds period)
        : period_(checkedPeriod(period)), next_(SteadyClock::now() + period_) {}

    template<class Rep, class Period>
    explicit PeriodicTimer(std::chrono::duration<Rep, Period> period)
        : PeriodicTimer(std::chrono::duration_cast<std::chrono::nanoseconds>(period)) {}

    std::uint64_t waitNext() {
        auto now = SteadyClock::now();
        if (now < next_) {
            std::this_thread::sleep_until(next_);
            now = SteadyClock::now();
        }
        if (now < next_) now = next_;
        const auto missed = (now - next_) / period_;
        const auto step = period_ - ((now - next_) % period_);
        next_ = now + step;
        return static_cast<std::uint64_t>(missed);
    }

    void reset() { next_ = SteadyClock::now() + period_; }
    std::chrono::nanoseconds period() const noexcept { return period_; }
    std::chrono::nanoseconds remaining() const {
        const auto now = SteadyClock::now();
        return now < next_ ? std::chrono::duration_cast<std::chrono::nanoseconds>(next_ - now) : std::chrono::nanoseconds::zero();
    }

private:
    static std::chrono::nanoseconds checkedPeriod(std::chrono::nanoseconds period) {
        if (period <= std::chrono::nanoseconds::zero())
            throw std::invalid_argument("PeriodicTimer period must be positive");
        return period;
    }
    std::chrono::nanoseconds period_;
    SteadyClock::time_point next_;
};

struct TimerEvent {
    TimerId id{};
    SteadyClock::time_point scheduled{};
    SteadyClock::time_point fired{};
    std::uint64_t invocation{};
    std::chrono::nanoseconds lateness{};
};

enum class TimedEndReason { Timeout, Stopped };

/* Blocking helper: run callback at each positive interval strictly before timeout.
 * True from callback stops early. Returns true if stopped, false if timed out.
 * Skips missed ticks; uses a monotonic clock. */
template<class RepT, class PeriodT, class RepI, class PeriodI, class Callback>
bool delayWithCallback(std::chrono::duration<RepT, PeriodT> timeout,
                       std::chrono::duration<RepI, PeriodI> interval,
                       Callback&& callback) {
    const auto t = std::chrono::duration_cast<SteadyClock::duration>(timeout);
    const auto p = std::chrono::duration_cast<SteadyClock::duration>(interval);
    if (t < SteadyClock::duration::zero() || p <= SteadyClock::duration::zero())
        throw std::invalid_argument("timeout must be nonnegative and interval positive");
    const auto start = SteadyClock::now();
    const auto end = start + t;
    auto next = (p < t) ? start + p : end;
    std::uint64_t count = 0;
    for (;;) {
        const auto now = SteadyClock::now();
        if (now >= end) return false;
        const auto target = std::min(next, end);
        if (now < target) { std::this_thread::sleep_until(target); continue; }
        if (next >= end) return false;
        if (callback(std::chrono::duration_cast<std::chrono::milliseconds>(now - start), ++count))
            return true;
        const auto after = SteadyClock::now();
        next = after + (p - ((after - next) % p));
    }
}

class Scheduler {
public:
    using Callback = std::function<void(const TimerEvent&)>;
    using IntervalCallback = std::function<bool(const TimerEvent&)>;
    using FinishCallback = std::function<void(TimerId, TimedEndReason, std::uint64_t)>;

    Scheduler() = default;
    Scheduler(const Scheduler&) = delete;
    Scheduler& operator=(const Scheduler&) = delete;
    ~Scheduler() { stopBackground(); }

    template<class Rep, class Period>
    TimerId after(std::chrono::duration<Rep, Period> delay, Callback callback) {
        return at(SteadyClock::now() + std::chrono::duration_cast<SteadyClock::duration>(delay), std::move(callback));
    }

    TimerId at(SteadyClock::time_point deadline, Callback callback) {
        return add(deadline, SteadyClock::duration::zero(), std::move(callback));
    }

    TimerId at(SystemClock::time_point wallClockDeadline, Callback callback) {
        const auto nowSystem = SystemClock::now();
        const auto delay = wallClockDeadline > nowSystem ? wallClockDeadline - nowSystem : SystemClock::duration::zero();
        return at(SteadyClock::now() + std::chrono::duration_cast<SteadyClock::duration>(delay), std::move(callback));
    }

    template<class Rep, class Period>
    TimerId every(std::chrono::duration<Rep, Period> period, Callback callback) {
        return every(period, period, std::move(callback));
    }

    template<class RepP, class PeriodP, class RepD, class PeriodD>
    TimerId every(std::chrono::duration<RepP, PeriodP> period,
                  std::chrono::duration<RepD, PeriodD> firstDelay,
                  Callback callback) {
        const auto p = std::chrono::duration_cast<SteadyClock::duration>(period);
        const auto d = std::chrono::duration_cast<SteadyClock::duration>(firstDelay);
        if (p <= SteadyClock::duration::zero()) return 0;
        return add(SteadyClock::now() + d, p, std::move(callback));
    }

    /* Calls onTick every interval strictly before total timeout; true stops early.
     * onFinish once on timeout or early stop (on poll/worker thread).
     * cancel()/clear() do not call onFinish. Timeout wins at equal instant.
     * Do not poll concurrently with the background worker. */
    template<class RepP, class PeriodP, class RepT, class PeriodT>
    TimerId everyUntil(std::chrono::duration<RepP, PeriodP> interval,
                       std::chrono::duration<RepT, PeriodT> timeout,
                       IntervalCallback onTick, FinishCallback onFinish = {}) {
        const auto p = std::chrono::duration_cast<SteadyClock::duration>(interval);
        const auto t = std::chrono::duration_cast<SteadyClock::duration>(timeout);
        if (p <= SteadyClock::duration::zero() || t < SteadyClock::duration::zero() || !onTick)
            return 0;
        const auto now = SteadyClock::now();
        const auto stop = now + t;
        const auto first = p < t ? now + p : stop;
        std::lock_guard<std::mutex> lock(mutex_);
        Entry* slot = nullptr;
        for (auto& timer : timers_) if (!timer.active) { slot = &timer; break; }
        if (!slot) { timers_.push_back(Entry{}); slot = &timers_.back(); }
        const TimerId id = nextId_++;
        if (nextId_ == 0) nextId_ = 1;
        *slot = Entry{};
        slot->id = id;
        slot->deadline = first;
        slot->period = p;
        slot->until = stop;
        slot->bounded = true;
        slot->intervalCallback = std::move(onTick);
        slot->finishCallback = std::move(onFinish);
        slot->active = true;
        cv_.notify_all();
        return id;
    }

    bool cancel(TimerId id) {
        std::lock_guard<std::mutex> lock(mutex_);
        for (auto& timer : timers_) {
            if (timer.active && timer.id == id) {
                timer.active = false;
                cv_.notify_all();
                return true;
            }
        }
        return false;
    }

    void clear() {
        std::lock_guard<std::mutex> lock(mutex_);
        for (auto& timer : timers_) timer.active = false;
        cv_.notify_all();
    }

    std::size_t count() const {
        std::lock_guard<std::mutex> lock(mutex_);
        return static_cast<std::size_t>(std::count_if(timers_.begin(), timers_.end(), [](const Entry& e) { return e.active; }));
    }

    bool scheduled(TimerId id) const {
        std::lock_guard<std::mutex> lock(mutex_);
        return std::any_of(timers_.begin(), timers_.end(), [id](const Entry& e) { return e.active && e.id == id; });
    }

    std::chrono::nanoseconds timeUntilNext() const {
        std::lock_guard<std::mutex> lock(mutex_);
        const auto now = SteadyClock::now();
        auto best = SteadyClock::duration::max();
        for (const auto& timer : timers_) {
            if (!timer.active) continue;
            if (timer.deadline <= now) return std::chrono::nanoseconds::zero();
            best = std::min(best, timer.deadline - now);
        }
        if (best == SteadyClock::duration::max()) return std::chrono::nanoseconds::max();
        return std::chrono::duration_cast<std::chrono::nanoseconds>(best);
    }

    std::size_t poll(std::size_t maxCallbacks = 0) {
        std::size_t handled = 0;
        for (;;) {
            Callback callback;
            IntervalCallback intervalCallback;
            FinishCallback finishCallback;
            TimerEvent event;
            TimedEndReason reason = TimedEndReason::Timeout;
            bool finishing = false;
            bool bounded = false;
            {
                std::lock_guard<std::mutex> lock(mutex_);
                const auto now = SteadyClock::now();
                auto selected = timers_.end();
                for (auto it = timers_.begin(); it != timers_.end(); ++it) {
                    if (!it->active || it->deadline > now) continue;
                    if (selected == timers_.end() || it->deadline < selected->deadline) selected = it;
                }
                if (selected == timers_.end()) break;
                event.id = selected->id;
                event.scheduled = selected->deadline;
                event.fired = now;
                event.invocation = selected->invocation;
                bounded = selected->bounded;
                if (bounded && now >= selected->until) {
                    selected->active = false;
                    finishing = true;
                    finishCallback = selected->finishCallback;
                } else {
                    event.invocation = ++selected->invocation;
                    event.lateness = std::chrono::duration_cast<std::chrono::nanoseconds>(now - selected->deadline);
                    if (selected->period <= SteadyClock::duration::zero()) selected->active = false;
                    else {
                        const auto step = selected->period - ((now - selected->deadline) % selected->period);
                        selected->deadline = now + step;
                        if (bounded && selected->deadline > selected->until)
                            selected->deadline = selected->until;
                    }
                    callback = selected->callback;
                    intervalCallback = selected->intervalCallback;
                    finishCallback = selected->finishCallback;
                }
            }
            if (finishing) {
                if (finishCallback) finishCallback(event.id, reason, event.invocation);
            } else if (bounded && intervalCallback) {
                const bool stop = intervalCallback(event);
                if (stop) {
                    bool owned = false;
                    {
                        std::lock_guard<std::mutex> lock(mutex_);
                        for (auto& timer : timers_) {
                            if (timer.active && timer.id == event.id) {
                                timer.active = false;
                                owned = true;
                                break;
                            }
                        }
                    }
                    if (owned && finishCallback) finishCallback(event.id, TimedEndReason::Stopped, event.invocation);
                } else {
                    const auto after = SteadyClock::now();
                    std::lock_guard<std::mutex> lock(mutex_);
                    for (auto& timer : timers_) {
                        if (timer.active && timer.id == event.id) {
                            if (after >= timer.deadline) {
                                const auto step = timer.period - ((after - timer.deadline) % timer.period);
                                timer.deadline = after + step;
                            }
                            if (timer.deadline > timer.until) timer.deadline = timer.until;
                            break;
                        }
                    }
                }
            } else if (callback) callback(event);
            ++handled;
            if (maxCallbacks != 0 && handled >= maxCallbacks) break;
        }
        return handled;
    }

    template<class Rep, class Period>
    std::size_t waitAndPoll(std::chrono::duration<Rep, Period> maxWait, std::size_t maxCallbacks = 0) {
        const auto until = timeUntilNext();
        const auto maxNs = std::chrono::duration_cast<std::chrono::nanoseconds>(maxWait);
        if (until != std::chrono::nanoseconds::max()) sleepFor(std::min(until, maxNs));
        else sleepFor(maxNs);
        return poll(maxCallbacks);
    }

    void startBackground() {
        if (backgroundRunning_.load()) return;
        /* A previous callback may have requested stop from the worker itself. */
        if (worker_.joinable()) {
            if (worker_.get_id() == std::this_thread::get_id()) return;
            worker_.join();
        }
        backgroundRunning_.store(true);
        try { worker_ = std::thread([this] { backgroundLoop(); }); }
        catch (...) { backgroundRunning_.store(false); throw; }
    }

    void stopBackground() {
        backgroundRunning_.store(false);
        cv_.notify_all();
        if (worker_.joinable() && worker_.get_id() != std::this_thread::get_id())
            worker_.join();
        /* If called inside a worker callback, the OWNER must later join.
           Never destroy Scheduler from its own callback. */
    }

    bool backgroundRunning() const noexcept { return backgroundRunning_.load(); }

private:
    struct Entry {
        TimerId id{};
        SteadyClock::time_point deadline{};
        SteadyClock::duration period{};
        std::uint64_t invocation{};
        Callback callback;
        bool active{};
        bool bounded{};
        SteadyClock::time_point until{};
        IntervalCallback intervalCallback;
        FinishCallback finishCallback;
    };

    TimerId add(SteadyClock::time_point deadline, SteadyClock::duration period, Callback callback) {
        if (!callback) return 0;
        std::lock_guard<std::mutex> lock(mutex_);
        Entry* slot = nullptr;
        for (auto& timer : timers_) {
            if (!timer.active) { slot = &timer; break; }
        }
        if (!slot) {
            timers_.push_back(Entry{});
            slot = &timers_.back();
        }
        TimerId id = nextId_++;
        if (nextId_ == 0) nextId_ = 1;
        *slot = Entry{};
        slot->id = id;
        slot->deadline = deadline;
        slot->period = period;
        slot->callback = std::move(callback);
        slot->active = true;
        cv_.notify_all();
        return id;
    }

    SteadyClock::time_point nextDeadlineLocked() const {
        auto best = SteadyClock::time_point::max();
        for (const auto& timer : timers_) if (timer.active && timer.deadline < best) best = timer.deadline;
        return best;
    }

    void backgroundLoop() {
        while (backgroundRunning_.load()) {
            {
                std::unique_lock<std::mutex> lock(mutex_);
                const auto next = nextDeadlineLocked();
                if (next == SteadyClock::time_point::max()) {
                    cv_.wait(lock, [this] { return !backgroundRunning_.load() || nextDeadlineLocked() != SteadyClock::time_point::max(); });
                } else {
                    cv_.wait_until(lock, next, [this, next] { return !backgroundRunning_.load() || nextDeadlineLocked() < next; });
                }
            }
            if (backgroundRunning_.load()) poll();
        }
    }

    mutable std::mutex mutex_;
    std::condition_variable cv_;
    std::vector<Entry> timers_;
    TimerId nextId_{1};
    std::atomic<bool> backgroundRunning_{false};
    std::thread worker_;
};

} // namespace cpm
