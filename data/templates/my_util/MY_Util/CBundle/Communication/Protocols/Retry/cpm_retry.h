#ifndef CPM_RETRY_H
#define CPM_RETRY_H

#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef int (*CpmRetryOperation)(void *context, int attemptIndex);
typedef void (*CpmRetrySleepFn)(void *context, uint32_t delayMs);
typedef int (*CpmRetryShouldRetryFn)(void *context, int operationResult, int attemptIndex);

typedef enum CpmRetryBackoff
{
    CPM_RETRY_BACKOFF_FIXED = 0,
    CPM_RETRY_BACKOFF_LINEAR,
    CPM_RETRY_BACKOFF_EXPONENTIAL
} CpmRetryBackoff;

typedef struct CpmRetryPolicy
{
    int maxAttempts;
    uint32_t initialDelayMs;
    uint32_t maxDelayMs;
    CpmRetryBackoff backoff;
    uint32_t jitterMs;
} CpmRetryPolicy;

typedef struct CpmRetryResult
{
    int result;
    int attempts;
    uint32_t totalDelayMs;
} CpmRetryResult;

void CpmRetry_DefaultPolicy(CpmRetryPolicy *policy);
uint32_t CpmRetry_ComputeDelay(const CpmRetryPolicy *policy, int failedAttemptIndex);
CpmRetryResult CpmRetry_Run(const CpmRetryPolicy *policy,
                            CpmRetryOperation operation,
                            void *operationContext,
                            CpmRetryShouldRetryFn shouldRetry,
                            void *retryContext,
                            CpmRetrySleepFn sleepFn,
                            void *sleepContext);

#ifdef __cplusplus
}
#endif
#endif
