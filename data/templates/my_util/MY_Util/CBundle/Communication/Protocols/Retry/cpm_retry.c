#include "cpm_retry.h"

#include <stddef.h>

static uint32_t CpmRetry_ClampU64(uint64_t value, uint32_t maximum)
{
    if (maximum && value > maximum) return maximum;
    if (value > UINT32_MAX) return UINT32_MAX;
    return (uint32_t)value;
}

void CpmRetry_DefaultPolicy(CpmRetryPolicy *policy)
{
    if (!policy) return;
    policy->maxAttempts = 3;
    policy->initialDelayMs = 100;
    policy->maxDelayMs = 5000;
    policy->backoff = CPM_RETRY_BACKOFF_EXPONENTIAL;
    policy->jitterMs = 0;
}

uint32_t CpmRetry_ComputeDelay(const CpmRetryPolicy *policy, int failedAttemptIndex)
{
    uint64_t delay;
    int i;
    if (!policy || failedAttemptIndex < 0) return 0;
    delay = policy->initialDelayMs;
    if (policy->backoff == CPM_RETRY_BACKOFF_LINEAR)
    {
        delay *= (uint64_t)(failedAttemptIndex + 1);
    }
    else if (policy->backoff == CPM_RETRY_BACKOFF_EXPONENTIAL)
    {
        for (i = 0; i < failedAttemptIndex && delay <= UINT32_MAX / 2U; ++i) delay *= 2U;
    }
    delay = CpmRetry_ClampU64(delay, policy->maxDelayMs);
    if (policy->jitterMs)
    {
        /* Deterministic jitter keeps this helper dependency-free and testable. */
        uint32_t span = policy->jitterMs * 2U + 1U;
        uint32_t pseudo = (uint32_t)((failedAttemptIndex + 1) * 1103515245U + 12345U);
        int32_t signedJitter = (int32_t)(pseudo % span) - (int32_t)policy->jitterMs;
        int64_t adjusted = (int64_t)delay + signedJitter;
        delay = adjusted < 0 ? 0U : (uint64_t)adjusted;
        delay = CpmRetry_ClampU64(delay, policy->maxDelayMs);
    }
    return (uint32_t)delay;
}

CpmRetryResult CpmRetry_Run(const CpmRetryPolicy *policy,
                            CpmRetryOperation operation,
                            void *operationContext,
                            CpmRetryShouldRetryFn shouldRetry,
                            void *retryContext,
                            CpmRetrySleepFn sleepFn,
                            void *sleepContext)
{
    CpmRetryPolicy local;
    CpmRetryResult output;
    int attempt;
    output.result = -1;
    output.attempts = 0;
    output.totalDelayMs = 0;
    if (!operation) return output;
    if (!policy)
    {
        CpmRetry_DefaultPolicy(&local);
        policy = &local;
    }
    if (policy->maxAttempts <= 0) return output;

    for (attempt = 0; attempt < policy->maxAttempts; ++attempt)
    {
        uint32_t delay;
        output.result = operation(operationContext, attempt);
        output.attempts = attempt + 1;
        if (output.result == 0) break;
        if (shouldRetry && !shouldRetry(retryContext, output.result, attempt)) break;
        if (attempt + 1 >= policy->maxAttempts) break;
        delay = CpmRetry_ComputeDelay(policy, attempt);
        output.totalDelayMs += delay;
        if (delay && sleepFn) sleepFn(sleepContext, delay);
    }
    return output;
}
