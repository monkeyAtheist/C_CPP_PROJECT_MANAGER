/** @file cpm_log.h @brief Lightweight configurable logging for C applications. */
#ifndef CPM_LOG_H
#define CPM_LOG_H
#include <stddef.h>
#include <stdarg.h>
#ifdef __cplusplus
extern "C" {
#endif

typedef enum CpmLogLevel {
    CPM_LOG_TRACE = 0,
    CPM_LOG_DEBUG,
    CPM_LOG_INFO,
    CPM_LOG_WARN,
    CPM_LOG_ERROR,
    CPM_LOG_FATAL,
    CPM_LOG_OFF
} CpmLogLevel;

typedef void (*CpmLogCallback)(CpmLogLevel level, const char *formattedLine, void *userData);

void CpmLog_Init(void);
void CpmLog_Shutdown(void);
void CpmLog_SetLevel(CpmLogLevel level);
CpmLogLevel CpmLog_GetLevel(void);
void CpmLog_EnableConsole(int enabled);
int CpmLog_SetFile(const char *path, int append);
void CpmLog_CloseFile(void);
void CpmLog_SetCallback(CpmLogCallback callback, void *userData);
void CpmLog_Write(CpmLogLevel level, const char *format, ...);
void CpmLog_WriteV(CpmLogLevel level, const char *format, va_list args);
void CpmLog_Hex(CpmLogLevel level, const char *label, const void *data, size_t size, size_t bytesPerLine);
const char *CpmLog_LevelName(CpmLogLevel level);

#define CPM_LOG_T(...) CpmLog_Write(CPM_LOG_TRACE, __VA_ARGS__)
#define CPM_LOG_D(...) CpmLog_Write(CPM_LOG_DEBUG, __VA_ARGS__)
#define CPM_LOG_I(...) CpmLog_Write(CPM_LOG_INFO, __VA_ARGS__)
#define CPM_LOG_W(...) CpmLog_Write(CPM_LOG_WARN, __VA_ARGS__)
#define CPM_LOG_E(...) CpmLog_Write(CPM_LOG_ERROR, __VA_ARGS__)
#define CPM_LOG_F(...) CpmLog_Write(CPM_LOG_FATAL, __VA_ARGS__)

#ifdef __cplusplus
}
#endif
#endif
