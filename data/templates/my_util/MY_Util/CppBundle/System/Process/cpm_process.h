/** @file cpm_process.h @brief Small cross-platform process/shell helpers. */
#ifndef CPM_PROCESS_H
#define CPM_PROCESS_H
#include <stddef.h>
#include <stdint.h>
#ifdef __cplusplus
extern "C" {
#endif

int CpmProcess_Run(const char *commandLine, int *exitCode);
int CpmProcess_RunCapture(const char *commandLine, char **output, size_t *outputSize, int *exitCode);
int CpmProcess_StartDetached(const char *commandLine);
uint64_t CpmProcess_CurrentId(void);
int CpmProcess_GetEnv(const char *name, char *value, size_t valueSize);
int CpmProcess_SetEnv(const char *name, const char *value);

#ifdef __cplusplus
}
#endif
#endif
