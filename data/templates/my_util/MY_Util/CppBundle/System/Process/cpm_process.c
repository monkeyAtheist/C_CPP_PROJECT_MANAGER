#if !defined(_WIN32)
#ifndef _POSIX_C_SOURCE
#define _POSIX_C_SOURCE 200809L
#endif
#endif
#include "cpm_process.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#if defined(_WIN32)
#include <windows.h>
#define CPM_POPEN _popen
#define CPM_PCLOSE _pclose
#else
#include <sys/types.h>
#include <sys/wait.h>
#include <unistd.h>
#define CPM_POPEN popen
#define CPM_PCLOSE pclose
#endif

static int cpm_exit_code(int status) {
#if defined(_WIN32)
    return status;
#else
    if (status < 0) return status;
    if (WIFEXITED(status)) return WEXITSTATUS(status);
    if (WIFSIGNALED(status)) return 128 + WTERMSIG(status);
    return status;
#endif
}
int CpmProcess_Run(const char *commandLine, int *exitCode) {
    int status;
    if (!commandLine || !*commandLine) return -1;
    status = system(commandLine);
    if (status == -1) return -2;
    if (exitCode) *exitCode = cpm_exit_code(status);
    return 0;
}
int CpmProcess_RunCapture(const char *commandLine, char **output, size_t *outputSize, int *exitCode) {
    FILE *pipe; char chunk[1024]; char *buffer = NULL; size_t length = 0, capacity = 0; int status;
    if (!commandLine || !output) return -1;
    *output = NULL; if (outputSize) *outputSize = 0;
    pipe = CPM_POPEN(commandLine, "r");
    if (!pipe) return -2;
    while (!feof(pipe)) {
        size_t n = fread(chunk, 1, sizeof(chunk), pipe);
        if (n) {
            size_t needed = length + n + 1;
            if (needed > capacity) {
                size_t next = capacity ? capacity : 2048;
                char *grown;
                while (next < needed) next *= 2;
                grown = (char *)realloc(buffer, next);
                if (!grown) { free(buffer); CPM_PCLOSE(pipe); return -3; }
                buffer = grown; capacity = next;
            }
            memcpy(buffer + length, chunk, n); length += n;
        }
        if (ferror(pipe)) { free(buffer); CPM_PCLOSE(pipe); return -4; }
    }
    status = CPM_PCLOSE(pipe);
    if (!buffer) { buffer = (char *)malloc(1); if (!buffer) return -3; }
    buffer[length] = '\0';
    *output = buffer; if (outputSize) *outputSize = length; if (exitCode) *exitCode = cpm_exit_code(status);
    return 0;
}
int CpmProcess_StartDetached(const char *commandLine) {
    if (!commandLine || !*commandLine) return -1;
#if defined(_WIN32)
    {
        STARTUPINFOA si; PROCESS_INFORMATION pi; char *mutableCommand; size_t n = strlen(commandLine);
        memset(&si, 0, sizeof(si)); memset(&pi, 0, sizeof(pi)); si.cb = sizeof(si);
        mutableCommand = (char *)malloc(n + 1); if (!mutableCommand) return -2; memcpy(mutableCommand, commandLine, n + 1);
        if (!CreateProcessA(NULL, mutableCommand, NULL, NULL, FALSE, CREATE_NEW_PROCESS_GROUP | DETACHED_PROCESS, NULL, NULL, &si, &pi)) { free(mutableCommand); return -3; }
        free(mutableCommand); CloseHandle(pi.hThread); CloseHandle(pi.hProcess); return 0;
    }
#else
    {
        pid_t pid = fork();
        if (pid < 0) return -3;
        if (pid == 0) { if (setsid() < 0) _exit(127); execl("/bin/sh", "sh", "-c", commandLine, (char *)NULL); _exit(127); }
        return 0;
    }
#endif
}
uint64_t CpmProcess_CurrentId(void) {
#if defined(_WIN32)
    return (uint64_t)GetCurrentProcessId();
#else
    return (uint64_t)getpid();
#endif
}
int CpmProcess_GetEnv(const char *name, char *value, size_t valueSize) {
    const char *env;
    if (!name || !value || !valueSize) return -1;
    env = getenv(name); if (!env) { value[0] = '\0'; return 1; }
    if (strlen(env) + 1 > valueSize) return -2;
    strcpy(value, env); return 0;
}
int CpmProcess_SetEnv(const char *name, const char *value) {
    if (!name || !*name) return -1;
#if defined(_WIN32)
    return SetEnvironmentVariableA(name, value) ? 0 : -2;
#else
    return value ? (setenv(name, value, 1) == 0 ? 0 : -2) : (unsetenv(name) == 0 ? 0 : -2);
#endif
}
