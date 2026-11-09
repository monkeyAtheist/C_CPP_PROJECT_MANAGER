#pragma once
#include "cpm_retry.h"
#include <chrono>
#include <functional>
#include <thread>

namespace cpm {
struct RetryPolicy {
    int maxAttempts{3};
    std::chrono::milliseconds initialDelay{100};
    std::chrono::milliseconds maxDelay{5000};
    CpmRetryBackoff backoff{CPM_RETRY_BACKOFF_EXPONENTIAL};
    std::chrono::milliseconds jitter{0};
};

inline CpmRetryResult retry(const RetryPolicy& p, const std::function<int(int)>& operation,
                            const std::function<bool(int,int)>& shouldRetry = {}) {
    CpmRetryPolicy cp{}; cp.maxAttempts = p.maxAttempts; cp.initialDelayMs = static_cast<std::uint32_t>(p.initialDelay.count()); cp.maxDelayMs = static_cast<std::uint32_t>(p.maxDelay.count()); cp.backoff = p.backoff; cp.jitterMs = static_cast<std::uint32_t>(p.jitter.count());
    struct Context { const std::function<int(int)>* op; const std::function<bool(int,int)>* pred; } ctx{&operation, &shouldRetry};
    auto op = [](void* c, int a)->int { auto* x = static_cast<Context*>(c); return (*x->op)(a); };
    auto pred = [](void* c, int r, int a)->int { auto* x = static_cast<Context*>(c); return !*x->pred || (*x->pred)(r,a); };
    auto sleep = [](void*, std::uint32_t ms) { std::this_thread::sleep_for(std::chrono::milliseconds(ms)); };
    return CpmRetry_Run(&cp, op, &ctx, pred, &ctx, sleep, nullptr);
}
}
