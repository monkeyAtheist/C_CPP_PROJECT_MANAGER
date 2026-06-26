import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { CpmInstallationService } from './cpmInstallationService';

interface StoredFileTemplate {
  id: string;
  label: string;
  description?: string;
  extension: string;
  content: string;
}

interface StoredSnippet {
  id: string;
  label: string;
  description?: string;
  body: string;
}

interface StoredCollection<T> {
  version: number;
  items: T[];
}

interface PendingFile {
  absolutePath: string;
  contents: string | Buffer;
  binary?: boolean;
}

export interface NewFileGenerationResult {
  files: string[];
  createdFiles: string[];
  primaryPath?: string;
  uirPath?: string;
}

export interface TemplateVariables {
  baseName: string;
  fileName: string;
  headerFile: string;
  guard: string;
  prefix: string;
  uirFile: string;
  date: string;
  year: string;
}

export interface BuiltInSnippet {
  id: string;
  label: string;
  description: string;
  body: string;
}

const FILE_TEMPLATE_STORE = 'file-templates.json';
const SNIPPET_STORE = 'snippets.json';
const TEXT_TEMPLATE_EXTENSIONS = new Set(['.c', '.h', '.cpp', '.hpp', '.txt', '.ini', '.json', '.xml', '.md', '.lua', '.js', '.ts', '.bat', '.cmd', '.ps1']);

const BUNDLED_MY_UTIL_ROOT = path.join('data', 'templates', 'my_util', 'MY_Util');
const BUNDLED_MY_UTIL_SKIP_EXTENSIONS = new Set(['.bak']);

const C_CORE_UTIL_HEADER_TEMPLATE = `#ifndef {{guard}}
#define {{guard}}

#ifdef __cplusplus
extern "C" {
#endif

#include <stddef.h>

#ifndef CPM_UTIL_TIMESTAMP_SIZE
#define CPM_UTIL_TIMESTAMP_SIZE 32
#endif

int CpmUtil_CopyString(char *dst, size_t dstSize, const char *src);
char *CpmUtil_Trim(char *text);
int CpmUtil_GetTimestamp(char *buffer, size_t bufferSize);
int CpmUtil_ReadIniValue(const char *iniPath, const char *key, char *value, size_t valueSize);

#ifdef __cplusplus
}
#endif

#endif /* {{guard}} */
`;

const C_CORE_UTIL_SOURCE_TEMPLATE = `#include "{{headerFile}}"

#include <ctype.h>
#include <stdio.h>
#include <string.h>
#include <time.h>

int CpmUtil_CopyString(char *dst, size_t dstSize, const char *src)
{
    if (dst == NULL || dstSize == 0)
    {
        return -1;
    }
    if (src == NULL)
    {
        src = "";
    }
    strncpy(dst, src, dstSize - 1);
    dst[dstSize - 1] = '\\0';
    return 0;
}

char *CpmUtil_Trim(char *text)
{
    char *end;

    if (text == NULL)
    {
        return NULL;
    }

    while (*text != '\\0' && isspace((unsigned char)*text))
    {
        ++text;
    }

    end = text + strlen(text);
    while (end > text && isspace((unsigned char)*(end - 1)))
    {
        --end;
    }
    *end = '\\0';

    return text;
}

int CpmUtil_GetTimestamp(char *buffer, size_t bufferSize)
{
    time_t now;
    struct tm localTime;

    if (buffer == NULL || bufferSize == 0)
    {
        return -1;
    }

    now = time(NULL);
#if defined(_WIN32)
    if (localtime_s(&localTime, &now) != 0)
    {
        buffer[0] = '\\0';
        return -1;
    }
#else
    if (localtime_r(&now, &localTime) == NULL)
    {
        buffer[0] = '\\0';
        return -1;
    }
#endif

    if (strftime(buffer, bufferSize, "%Y-%m-%d %H:%M:%S", &localTime) == 0)
    {
        buffer[0] = '\\0';
        return -1;
    }

    return 0;
}

int CpmUtil_ReadIniValue(const char *iniPath, const char *key, char *value, size_t valueSize)
{
    FILE *file;
    char line[512];
    size_t keyLength;

    if (iniPath == NULL || key == NULL || value == NULL || valueSize == 0)
    {
        return -1;
    }

    value[0] = '\\0';
    keyLength = strlen(key);
    file = fopen(iniPath, "r");
    if (file == NULL)
    {
        return -1;
    }

    while (fgets(line, sizeof(line), file) != NULL)
    {
        char *cursor = CpmUtil_Trim(line);
        char *separator;

        if (cursor == NULL || cursor[0] == '\\0' || cursor[0] == '#' || cursor[0] == ';' || cursor[0] == '[')
        {
            continue;
        }
        if (strncmp(cursor, key, keyLength) != 0)
        {
            continue;
        }

        separator = cursor + keyLength;
        separator = CpmUtil_Trim(separator);
        if (separator == NULL || separator[0] != '=')
        {
            continue;
        }

        ++separator;
        separator = CpmUtil_Trim(separator);
        CpmUtil_CopyString(value, valueSize, separator);
        fclose(file);
        return 0;
    }

    fclose(file);
    return 1;
}
`;

const C_CORE_UTIL_INI_TEMPLATE = `[utility]
logPath={{baseName}}.log
maxLogLines=1024
`;

const CPP_CORE_UTIL_HEADER_TEMPLATE = `#ifndef {{guard}}
#define {{guard}}

#include <string>

namespace cpm
{
std::string trim(std::string text);
std::string timestamp();
bool readIniValue(const std::string &iniPath, const std::string &key, std::string &value);
void appendLogLine(const std::string &path, const std::string &line);
}

#endif /* {{guard}} */
`;

const CPP_CORE_UTIL_SOURCE_TEMPLATE = `#include "{{headerFile}}"

#include <algorithm>
#include <chrono>
#include <cctype>
#include <ctime>
#include <fstream>
#include <iomanip>
#include <sstream>

namespace cpm
{
std::string trim(std::string text)
{
    auto isSpace = [](unsigned char ch) { return std::isspace(ch) != 0; };
    text.erase(text.begin(), std::find_if(text.begin(), text.end(), [isSpace](unsigned char ch) { return !isSpace(ch); }));
    text.erase(std::find_if(text.rbegin(), text.rend(), [isSpace](unsigned char ch) { return !isSpace(ch); }).base(), text.end());
    return text;
}

std::string timestamp()
{
    const auto now = std::chrono::system_clock::now();
    const std::time_t timeValue = std::chrono::system_clock::to_time_t(now);
    std::tm localTime{};
#if defined(_WIN32)
    localtime_s(&localTime, &timeValue);
#else
    localtime_r(&timeValue, &localTime);
#endif
    std::ostringstream stream;
    stream << std::put_time(&localTime, "%Y-%m-%d %H:%M:%S");
    return stream.str();
}

bool readIniValue(const std::string &iniPath, const std::string &key, std::string &value)
{
    std::ifstream file(iniPath);
    if (!file)
    {
        return false;
    }

    std::string line;
    while (std::getline(file, line))
    {
        line = trim(line);
        if (line.empty() || line[0] == ';' || line[0] == '#' || line[0] == '[')
        {
            continue;
        }

        const auto separator = line.find('=');
        if (separator == std::string::npos)
        {
            continue;
        }

        const std::string currentKey = trim(line.substr(0, separator));
        if (currentKey == key)
        {
            value = trim(line.substr(separator + 1));
            return true;
        }
    }

    return false;
}

void appendLogLine(const std::string &path, const std::string &line)
{
    std::ofstream file(path, std::ios::app);
    if (file)
    {
        file << line << '\n';
    }
}
}
`;

const CPP_CORE_UTIL_INI_TEMPLATE = `[utility]
logPath={{baseName}}.log
maxLogLines=1024
`;

const CPP_ERROR_HEADER_TEMPLATE = `#ifndef {{guard}}
#define {{guard}}

#include <string>

#ifndef CPM_ERROR_MESSAGE_SIZE
#define CPM_ERROR_MESSAGE_SIZE 512
#endif

#ifndef CPM_ERROR_PATH_SIZE
#define CPM_ERROR_PATH_SIZE 1024
#endif

#define ERROR_LABEL error

namespace cpm
{
struct ErrorConfig
{
    bool enabled = true;
    bool mirrorToStderr = true;
    int maxLogLines = 1024;
    std::string logPath = "cpm_error.log";
};

extern int g_errorCode;
extern ErrorConfig g_errorConfig;

void initErrorDefaults();
bool loadErrorConfig(const std::string &iniPath);
void setErrorEnabled(bool enabled);
void setErrorLogFile(const std::string &filePath);
void logError(const std::string &message);
void reportError(int code, const std::string &message, const char *file, int line, const char *functionName);
}

#define CPM_ERR_INFZ(code, message) \
    do { \
        int cpmErrorCodeLocal = (code); \
        if (cpmErrorCodeLocal < 0) { \
            cpm::g_errorCode = cpmErrorCodeLocal; \
            cpm::reportError(cpmErrorCodeLocal, (message), __FILE__, __LINE__, __func__); \
            goto ERROR_LABEL; \
        } \
    } while (0)

#define CPM_ERR_INFEQZ(code, message) \
    do { \
        int cpmErrorCodeLocal = (code); \
        if (cpmErrorCodeLocal <= 0) { \
            cpm::g_errorCode = cpmErrorCodeLocal; \
            cpm::reportError(cpmErrorCodeLocal, (message), __FILE__, __LINE__, __func__); \
            goto ERROR_LABEL; \
        } \
    } while (0)

#define CPM_ERR_PTR(pointer) \
    do { \
        if ((pointer) == nullptr) { \
            cpm::g_errorCode = -999; \
            cpm::reportError(cpm::g_errorCode, "NULL pointer: " #pointer, __FILE__, __LINE__, __func__); \
            goto ERROR_LABEL; \
        } \
    } while (0)

#endif /* {{guard}} */
`;

const CPP_ERROR_SOURCE_TEMPLATE = `#include "{{headerFile}}"

#include <fstream>
#include <iostream>
#include <sstream>

namespace cpm
{
int g_errorCode = 0;
ErrorConfig g_errorConfig{};

static std::string trim(std::string text)
{
    const auto first = text.find_first_not_of(" \t\r\n");
    if (first == std::string::npos)
    {
        return {};
    }
    const auto last = text.find_last_not_of(" \t\r\n");
    return text.substr(first, last - first + 1);
}

void initErrorDefaults()
{
    g_errorCode = 0;
    g_errorConfig = ErrorConfig{};
}

bool loadErrorConfig(const std::string &iniPath)
{
    std::ifstream file(iniPath);
    if (!file)
    {
        return false;
    }

    std::string line;
    while (std::getline(file, line))
    {
        line = trim(line);
        if (line.empty() || line[0] == ';' || line[0] == '#' || line[0] == '[')
        {
            continue;
        }
        const auto separator = line.find('=');
        if (separator == std::string::npos)
        {
            continue;
        }

        const std::string key = trim(line.substr(0, separator));
        const std::string value = trim(line.substr(separator + 1));
        if (key == "enabled")
        {
            g_errorConfig.enabled = value != "0" && value != "false";
        }
        else if (key == "mirrorToStderr")
        {
            g_errorConfig.mirrorToStderr = value != "0" && value != "false";
        }
        else if (key == "maxLogLines")
        {
            g_errorConfig.maxLogLines = std::stoi(value);
        }
        else if (key == "logPath")
        {
            g_errorConfig.logPath = value;
        }
    }

    return true;
}

void setErrorEnabled(bool enabled)
{
    g_errorConfig.enabled = enabled;
}

void setErrorLogFile(const std::string &filePath)
{
    g_errorConfig.logPath = filePath;
}

void logError(const std::string &message)
{
    if (!g_errorConfig.enabled)
    {
        return;
    }

    if (g_errorConfig.mirrorToStderr)
    {
        std::cerr << message << std::endl;
    }

    std::ofstream file(g_errorConfig.logPath, std::ios::app);
    if (file)
    {
        file << message << '\n';
    }
}

void reportError(int code, const std::string &message, const char *file, int line, const char *functionName)
{
    std::ostringstream stream;
    stream << "*** C/C++ ERROR ***\n"
           << "Code: " << code << "\n"
           << "Message: " << message << "\n"
           << "File: " << (file != nullptr ? file : "unknown") << "\n"
           << "Line: " << line << "\n"
           << "Function: " << (functionName != nullptr ? functionName : "unknown");
    logError(stream.str());
}
}
`;

const CPP_ERROR_INI_TEMPLATE = `[error]
enabled=1
mirrorToStderr=1
maxLogLines=1024
logPath={{baseName}}.log
`;

const C_PYTHON_EXEC_HEADER_TEMPLATE = String.raw`#ifndef {{guard}}
#define {{guard}}

#ifdef __cplusplus
extern "C" {
#endif

#include <stddef.h>
#include <stdint.h>

#ifndef CPM_PYTHON_PATH_SIZE
#define CPM_PYTHON_PATH_SIZE 1024
#endif

#ifndef CPM_PYTHON_LINE_SIZE
#define CPM_PYTHON_LINE_SIZE 8192
#endif

typedef struct CpmPythonConfig
{
    char pythonExe[CPM_PYTHON_PATH_SIZE];
    char scriptPath[CPM_PYTHON_PATH_SIZE];
    char workingDirectory[CPM_PYTHON_PATH_SIZE];
    int unbuffered;
    int mergeStdErrToStdOut;
    int readTimeoutMs;
    int writeTimeoutMs;
} CpmPythonConfig;

typedef struct CpmPythonResult
{
    int launched;
    int finished;
    int timedOut;
    int exitCode;
    char *output;
    size_t outputSize;
} CpmPythonResult;

typedef struct CpmPythonSession CpmPythonSession;

void CpmPython_InitConfig(CpmPythonConfig *config);
void CpmPython_ResultInit(CpmPythonResult *result);
void CpmPython_ResultFree(CpmPythonResult *result);

int CpmPython_RunScript(const CpmPythonConfig *config,
                        const char *const *args,
                        size_t argCount,
                        int timeoutMs,
                        CpmPythonResult *result);

int CpmPythonSession_Start(CpmPythonSession **session,
                           const CpmPythonConfig *config,
                           const char *const *args,
                           size_t argCount);
void CpmPythonSession_Close(CpmPythonSession **session, int forceKill);
void CpmPythonSession_CloseInput(CpmPythonSession *session);
int CpmPythonSession_IsRunning(CpmPythonSession *session);
int CpmPythonSession_Wait(CpmPythonSession *session, int timeoutMs);

int CpmPythonSession_WriteBytes(CpmPythonSession *session, const uint8_t *data, size_t size);
int CpmPythonSession_WriteString(CpmPythonSession *session, const char *text);
int CpmPythonSession_SendLine(CpmPythonSession *session, const char *line);
int CpmPythonSession_SendJson(CpmPythonSession *session, const char *jsonLine);

int CpmPythonSession_ReadBytes(CpmPythonSession *session, uint8_t *buffer, size_t maxSize, int timeoutMs);
int CpmPythonSession_ReadLine(CpmPythonSession *session, char *outLine, size_t outLineSize, int timeoutMs);
int CpmPythonSession_ReceiveJson(CpmPythonSession *session, char *jsonLine, size_t jsonLineSize, int timeoutMs);

#ifdef __cplusplus
}
#endif

#endif /* {{guard}} */
`;

const C_PYTHON_EXEC_SOURCE_TEMPLATE = String.raw`#if !defined(_WIN32) && !defined(_POSIX_C_SOURCE)
#define _POSIX_C_SOURCE 200809L
#endif

#include "{{headerFile}}"

#include <stdlib.h>
#include <string.h>

#if defined(_WIN32)
#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif
#include <windows.h>
#else
#include <errno.h>
#include <fcntl.h>
#include <signal.h>
#include <sys/select.h>
#include <sys/types.h>
#include <sys/wait.h>
#include <time.h>
#include <unistd.h>
#endif

struct CpmPythonSession
{
    CpmPythonConfig config;
#if defined(_WIN32)
    HANDLE processHandle;
    HANDLE threadHandle;
    HANDLE stdinWrite;
    HANDLE stdoutRead;
#else
    int pid;
    int stdinWrite;
    int stdoutRead;
#endif
    int finished;
    int cachedExitCode;
    uint8_t *rxBuffer;
    size_t rxSize;
    size_t rxCapacity;
};

static void CpmPy_CopyString(char *dst, size_t dstSize, const char *src)
{
    if (dst == NULL || dstSize == 0)
    {
        return;
    }
    if (src == NULL)
    {
        src = "";
    }
    strncpy(dst, src, dstSize - 1);
    dst[dstSize - 1] = '\0';
}

static int CpmPy_AppendBytes(uint8_t **buffer, size_t *size, size_t *capacity, const uint8_t *data, size_t dataSize)
{
    uint8_t *newBuffer;
    size_t newCapacity;

    if (dataSize == 0)
    {
        return 0;
    }
    if (buffer == NULL || size == NULL || capacity == NULL || data == NULL)
    {
        return -1;
    }

    if (*size + dataSize + 1 > *capacity)
    {
        newCapacity = (*capacity == 0) ? 512 : *capacity;
        while (newCapacity < *size + dataSize + 1)
        {
            newCapacity *= 2;
        }
        newBuffer = (uint8_t *)realloc(*buffer, newCapacity);
        if (newBuffer == NULL)
        {
            return -1;
        }
        *buffer = newBuffer;
        *capacity = newCapacity;
    }

    memcpy(*buffer + *size, data, dataSize);
    *size += dataSize;
    (*buffer)[*size] = 0;
    return 0;
}

static int CpmPy_AppendOutput(CpmPythonResult *result, const uint8_t *data, size_t dataSize)
{
    char *newOutput;
    size_t newSize;

    if (result == NULL || data == NULL || dataSize == 0)
    {
        return 0;
    }

    newSize = result->outputSize + dataSize;
    newOutput = (char *)realloc(result->output, newSize + 1);
    if (newOutput == NULL)
    {
        return -1;
    }

    memcpy(newOutput + result->outputSize, data, dataSize);
    newOutput[newSize] = '\0';
    result->output = newOutput;
    result->outputSize = newSize;
    return 0;
}

void CpmPython_InitConfig(CpmPythonConfig *config)
{
    if (config == NULL)
    {
        return;
    }
    memset(config, 0, sizeof(*config));
#if defined(_WIN32)
    CpmPy_CopyString(config->pythonExe, sizeof(config->pythonExe), "python");
#else
    CpmPy_CopyString(config->pythonExe, sizeof(config->pythonExe), "python3");
#endif
    config->unbuffered = 1;
    config->mergeStdErrToStdOut = 1;
    config->readTimeoutMs = 100;
    config->writeTimeoutMs = 100;
}

void CpmPython_ResultInit(CpmPythonResult *result)
{
    if (result == NULL)
    {
        return;
    }
    memset(result, 0, sizeof(*result));
    result->exitCode = -1;
}

void CpmPython_ResultFree(CpmPythonResult *result)
{
    if (result == NULL)
    {
        return;
    }
    free(result->output);
    CpmPython_ResultInit(result);
}

#if defined(_WIN32)
static void CpmPy_CloseHandle(HANDLE *handle)
{
    if (handle != NULL && *handle != NULL)
    {
        CloseHandle(*handle);
        *handle = NULL;
    }
}

static char *CpmPy_QuoteArgWin(const char *arg)
{
    size_t len;
    size_t i;
    size_t outCapacity;
    size_t outSize = 0;
    int needQuotes = 0;
    int backslashes = 0;
    char *out;

    if (arg == NULL || arg[0] == '\0')
    {
        out = (char *)malloc(3);
        if (out != NULL)
        {
            strcpy(out, "\"\"");
        }
        return out;
    }

    len = strlen(arg);
    for (i = 0; i < len; ++i)
    {
        if (arg[i] == ' ' || arg[i] == '\t' || arg[i] == '"')
        {
            needQuotes = 1;
            break;
        }
    }
    if (!needQuotes)
    {
        out = (char *)malloc(len + 1);
        if (out != NULL)
        {
            memcpy(out, arg, len + 1);
        }
        return out;
    }

    outCapacity = len * 2 + 4;
    out = (char *)malloc(outCapacity);
    if (out == NULL)
    {
        return NULL;
    }

#define CPM_PY_APPEND_CHAR(ch) do { if (outSize + 2 >= outCapacity) { char *tmp; outCapacity *= 2; tmp = (char *)realloc(out, outCapacity); if (tmp == NULL) { free(out); return NULL; } out = tmp; } out[outSize++] = (ch); } while (0)
    CPM_PY_APPEND_CHAR('"');
    for (i = 0; i < len; ++i)
    {
        char c = arg[i];
        if (c == '\\')
        {
            ++backslashes;
            continue;
        }
        if (c == '"')
        {
            int j;
            for (j = 0; j < backslashes * 2 + 1; ++j)
            {
                CPM_PY_APPEND_CHAR('\\');
            }
            CPM_PY_APPEND_CHAR('"');
            backslashes = 0;
            continue;
        }
        while (backslashes > 0)
        {
            CPM_PY_APPEND_CHAR('\\');
            --backslashes;
        }
        CPM_PY_APPEND_CHAR(c);
    }
    while (backslashes > 0)
    {
        CPM_PY_APPEND_CHAR('\\');
        CPM_PY_APPEND_CHAR('\\');
        --backslashes;
    }
    CPM_PY_APPEND_CHAR('"');
    CPM_PY_APPEND_CHAR('\0');
#undef CPM_PY_APPEND_CHAR
    return out;
}

static int CpmPy_AppendCommandPart(char **commandLine, size_t *size, size_t *capacity, const char *part)
{
    char *quoted;
    char *newCommand;
    size_t quotedLen;
    size_t required;

    quoted = CpmPy_QuoteArgWin(part);
    if (quoted == NULL)
    {
        return -1;
    }

    quotedLen = strlen(quoted);
    required = *size + quotedLen + 2;
    if (required > *capacity)
    {
        size_t newCapacity = (*capacity == 0) ? 256 : *capacity;
        while (newCapacity < required)
        {
            newCapacity *= 2;
        }
        newCommand = (char *)realloc(*commandLine, newCapacity);
        if (newCommand == NULL)
        {
            free(quoted);
            return -1;
        }
        *commandLine = newCommand;
        *capacity = newCapacity;
    }

    if (*size > 0)
    {
        (*commandLine)[(*size)++] = ' ';
    }
    memcpy(*commandLine + *size, quoted, quotedLen);
    *size += quotedLen;
    (*commandLine)[*size] = '\0';
    free(quoted);
    return 0;
}
#else
static void CpmPy_CloseFd(int *fd)
{
    if (fd != NULL && *fd >= 0)
    {
        close(*fd);
        *fd = -1;
    }
}
#endif

static void CpmPy_FreeSession(CpmPythonSession *session)
{
    if (session == NULL)
    {
        return;
    }
    free(session->rxBuffer);
    free(session);
}

int CpmPythonSession_Start(CpmPythonSession **sessionPtr,
                           const CpmPythonConfig *config,
                           const char *const *args,
                           size_t argCount)
{
    CpmPythonSession *session;

    if (sessionPtr == NULL || config == NULL || config->scriptPath[0] == '\0')
    {
        return -1;
    }

    CpmPythonSession_Close(sessionPtr, 1);

    session = (CpmPythonSession *)calloc(1, sizeof(*session));
    if (session == NULL)
    {
        return -1;
    }
    session->config = *config;
    session->cachedExitCode = -1;
#if defined(_WIN32)
    session->processHandle = NULL;
    session->threadHandle = NULL;
    session->stdinWrite = NULL;
    session->stdoutRead = NULL;
#else
    session->pid = -1;
    session->stdinWrite = -1;
    session->stdoutRead = -1;
#endif

#if defined(_WIN32)
    {
        SECURITY_ATTRIBUTES securityAttributes;
        HANDLE childStdoutRead = NULL;
        HANDLE childStdoutWrite = NULL;
        HANDLE childStdinRead = NULL;
        HANDLE childStdinWrite = NULL;
        STARTUPINFOA startupInfo;
        PROCESS_INFORMATION processInfo;
        char *commandLine = NULL;
        size_t commandSize = 0;
        size_t commandCapacity = 0;
        size_t i;
        BOOL ok;

        memset(&securityAttributes, 0, sizeof(securityAttributes));
        securityAttributes.nLength = sizeof(securityAttributes);
        securityAttributes.bInheritHandle = TRUE;

        if (!CreatePipe(&childStdoutRead, &childStdoutWrite, &securityAttributes, 0))
        {
            CpmPy_FreeSession(session);
            return -1;
        }
        if (!SetHandleInformation(childStdoutRead, HANDLE_FLAG_INHERIT, 0))
        {
            CpmPy_CloseHandle(&childStdoutRead);
            CpmPy_CloseHandle(&childStdoutWrite);
            CpmPy_FreeSession(session);
            return -1;
        }
        if (!CreatePipe(&childStdinRead, &childStdinWrite, &securityAttributes, 0))
        {
            CpmPy_CloseHandle(&childStdoutRead);
            CpmPy_CloseHandle(&childStdoutWrite);
            CpmPy_FreeSession(session);
            return -1;
        }
        if (!SetHandleInformation(childStdinWrite, HANDLE_FLAG_INHERIT, 0))
        {
            CpmPy_CloseHandle(&childStdoutRead);
            CpmPy_CloseHandle(&childStdoutWrite);
            CpmPy_CloseHandle(&childStdinRead);
            CpmPy_CloseHandle(&childStdinWrite);
            CpmPy_FreeSession(session);
            return -1;
        }

        if (CpmPy_AppendCommandPart(&commandLine, &commandSize, &commandCapacity, config->pythonExe) != 0 ||
            (config->unbuffered && CpmPy_AppendCommandPart(&commandLine, &commandSize, &commandCapacity, "-u") != 0) ||
            CpmPy_AppendCommandPart(&commandLine, &commandSize, &commandCapacity, config->scriptPath) != 0)
        {
            free(commandLine);
            CpmPy_CloseHandle(&childStdoutRead);
            CpmPy_CloseHandle(&childStdoutWrite);
            CpmPy_CloseHandle(&childStdinRead);
            CpmPy_CloseHandle(&childStdinWrite);
            CpmPy_FreeSession(session);
            return -1;
        }
        for (i = 0; i < argCount; ++i)
        {
            if (CpmPy_AppendCommandPart(&commandLine, &commandSize, &commandCapacity, args != NULL ? args[i] : "") != 0)
            {
                free(commandLine);
                CpmPy_CloseHandle(&childStdoutRead);
                CpmPy_CloseHandle(&childStdoutWrite);
                CpmPy_CloseHandle(&childStdinRead);
                CpmPy_CloseHandle(&childStdinWrite);
                CpmPy_FreeSession(session);
                return -1;
            }
        }

        memset(&startupInfo, 0, sizeof(startupInfo));
        startupInfo.cb = sizeof(startupInfo);
        startupInfo.dwFlags = STARTF_USESTDHANDLES;
        startupInfo.hStdInput = childStdinRead;
        startupInfo.hStdOutput = childStdoutWrite;
        startupInfo.hStdError = config->mergeStdErrToStdOut ? childStdoutWrite : GetStdHandle(STD_ERROR_HANDLE);
        memset(&processInfo, 0, sizeof(processInfo));

        ok = CreateProcessA(NULL,
                            commandLine,
                            NULL,
                            NULL,
                            TRUE,
                            0,
                            NULL,
                            config->workingDirectory[0] != '\0' ? config->workingDirectory : NULL,
                            &startupInfo,
                            &processInfo);
        free(commandLine);
        CpmPy_CloseHandle(&childStdoutWrite);
        CpmPy_CloseHandle(&childStdinRead);

        if (!ok)
        {
            CpmPy_CloseHandle(&childStdoutRead);
            CpmPy_CloseHandle(&childStdinWrite);
            CpmPy_FreeSession(session);
            return -1;
        }

        session->stdoutRead = childStdoutRead;
        session->stdinWrite = childStdinWrite;
        session->processHandle = processInfo.hProcess;
        session->threadHandle = processInfo.hThread;
        *sessionPtr = session;
        return 0;
    }
#else
    {
        int stdinPipe[2] = { -1, -1 };
        int stdoutPipe[2] = { -1, -1 };
        pid_t childPid;

        if (pipe(stdinPipe) != 0)
        {
            CpmPy_FreeSession(session);
            return -1;
        }
        if (pipe(stdoutPipe) != 0)
        {
            CpmPy_CloseFd(&stdinPipe[0]);
            CpmPy_CloseFd(&stdinPipe[1]);
            CpmPy_FreeSession(session);
            return -1;
        }

        childPid = fork();
        if (childPid < 0)
        {
            CpmPy_CloseFd(&stdinPipe[0]);
            CpmPy_CloseFd(&stdinPipe[1]);
            CpmPy_CloseFd(&stdoutPipe[0]);
            CpmPy_CloseFd(&stdoutPipe[1]);
            CpmPy_FreeSession(session);
            return -1;
        }

        if (childPid == 0)
        {
            char **argv;
            size_t index = 0;
            size_t i;

            dup2(stdinPipe[0], STDIN_FILENO);
            dup2(stdoutPipe[1], STDOUT_FILENO);
            if (config->mergeStdErrToStdOut)
            {
                dup2(stdoutPipe[1], STDERR_FILENO);
            }
            close(stdinPipe[0]);
            close(stdinPipe[1]);
            close(stdoutPipe[0]);
            close(stdoutPipe[1]);

            if (config->workingDirectory[0] != '\0')
            {
                chdir(config->workingDirectory);
            }

            argv = (char **)calloc(argCount + 4, sizeof(char *));
            if (argv == NULL)
            {
                _exit(127);
            }
            argv[index++] = (char *)config->pythonExe;
            if (config->unbuffered)
            {
                argv[index++] = (char *)"-u";
            }
            argv[index++] = (char *)config->scriptPath;
            for (i = 0; i < argCount; ++i)
            {
                argv[index++] = (char *)(args != NULL ? args[i] : "");
            }
            argv[index] = NULL;
            execvp(config->pythonExe, argv);
            _exit(127);
        }

        CpmPy_CloseFd(&stdinPipe[0]);
        CpmPy_CloseFd(&stdoutPipe[1]);
        session->stdinWrite = stdinPipe[1];
        session->stdoutRead = stdoutPipe[0];
        session->pid = childPid;

        {
            int flags = fcntl(session->stdoutRead, F_GETFL, 0);
            if (flags >= 0)
            {
                fcntl(session->stdoutRead, F_SETFL, flags | O_NONBLOCK);
            }
        }

        *sessionPtr = session;
        return 0;
    }
#endif
}

void CpmPythonSession_CloseInput(CpmPythonSession *session)
{
    if (session == NULL)
    {
        return;
    }
#if defined(_WIN32)
    CpmPy_CloseHandle(&session->stdinWrite);
#else
    CpmPy_CloseFd(&session->stdinWrite);
#endif
}

int CpmPythonSession_IsRunning(CpmPythonSession *session)
{
    if (session == NULL || session->finished)
    {
        return 0;
    }
#if defined(_WIN32)
    {
        DWORD exitCode = 0;
        if (session->processHandle == NULL || !GetExitCodeProcess(session->processHandle, &exitCode))
        {
            return 0;
        }
        if (exitCode == STILL_ACTIVE)
        {
            return 1;
        }
        session->finished = 1;
        session->cachedExitCode = (int)exitCode;
        return 0;
    }
#else
    {
        int status = 0;
        pid_t rc;
        if (session->pid <= 0)
        {
            return 0;
        }
        rc = waitpid(session->pid, &status, WNOHANG);
        if (rc == 0)
        {
            return 1;
        }
        if (rc == session->pid)
        {
            session->finished = 1;
            if (WIFEXITED(status))
            {
                session->cachedExitCode = WEXITSTATUS(status);
            }
            else if (WIFSIGNALED(status))
            {
                session->cachedExitCode = 128 + WTERMSIG(status);
            }
            else
            {
                session->cachedExitCode = -1;
            }
        }
        return 0;
    }
#endif
}

int CpmPythonSession_Wait(CpmPythonSession *session, int timeoutMs)
{
    if (session == NULL)
    {
        return -1;
    }
    if (session->finished)
    {
        return session->cachedExitCode;
    }
#if defined(_WIN32)
    {
        DWORD waitTime = timeoutMs < 0 ? INFINITE : (DWORD)timeoutMs;
        DWORD rc;
        DWORD exitCode = 0;
        if (session->processHandle == NULL)
        {
            return -1;
        }
        rc = WaitForSingleObject(session->processHandle, waitTime);
        if (rc != WAIT_OBJECT_0)
        {
            return -1;
        }
        if (!GetExitCodeProcess(session->processHandle, &exitCode))
        {
            return -1;
        }
        session->finished = 1;
        session->cachedExitCode = (int)exitCode;
        return session->cachedExitCode;
    }
#else
    {
        int status = 0;
        long elapsedMs = 0;
        struct timespec sleepTime;
        sleepTime.tv_sec = 0;
        sleepTime.tv_nsec = 10000000L;
        while (1)
        {
            pid_t rc = waitpid(session->pid, &status, WNOHANG);
            if (rc == session->pid)
            {
                session->finished = 1;
                if (WIFEXITED(status))
                {
                    session->cachedExitCode = WEXITSTATUS(status);
                }
                else if (WIFSIGNALED(status))
                {
                    session->cachedExitCode = 128 + WTERMSIG(status);
                }
                else
                {
                    session->cachedExitCode = -1;
                }
                return session->cachedExitCode;
            }
            if (rc < 0)
            {
                return session->finished ? session->cachedExitCode : -1;
            }
            if (timeoutMs >= 0 && elapsedMs >= timeoutMs)
            {
                return -1;
            }
            nanosleep(&sleepTime, NULL);
            elapsedMs += 10;
        }
    }
#endif
}

void CpmPythonSession_Close(CpmPythonSession **sessionPtr, int forceKill)
{
    CpmPythonSession *session;
    if (sessionPtr == NULL || *sessionPtr == NULL)
    {
        return;
    }
    session = *sessionPtr;

#if defined(_WIN32)
    if (forceKill && session->processHandle != NULL && CpmPythonSession_IsRunning(session))
    {
        TerminateProcess(session->processHandle, 1);
        WaitForSingleObject(session->processHandle, 1000);
    }
    CpmPythonSession_CloseInput(session);
    CpmPy_CloseHandle(&session->stdoutRead);
    CpmPy_CloseHandle(&session->threadHandle);
    CpmPy_CloseHandle(&session->processHandle);
#else
    if (forceKill && session->pid > 0 && CpmPythonSession_IsRunning(session))
    {
        kill(session->pid, SIGTERM);
        CpmPythonSession_Wait(session, 1000);
        if (CpmPythonSession_IsRunning(session))
        {
            kill(session->pid, SIGKILL);
            CpmPythonSession_Wait(session, 1000);
        }
    }
    CpmPythonSession_CloseInput(session);
    CpmPy_CloseFd(&session->stdoutRead);
    if (session->pid > 0 && !session->finished)
    {
        CpmPythonSession_Wait(session, 0);
    }
#endif

    CpmPy_FreeSession(session);
    *sessionPtr = NULL;
}

int CpmPythonSession_WriteBytes(CpmPythonSession *session, const uint8_t *data, size_t size)
{
    if (session == NULL || data == NULL || size == 0)
    {
        return 0;
    }
#if defined(_WIN32)
    {
        DWORD written = 0;
        if (session->stdinWrite == NULL)
        {
            return -1;
        }
        if (!WriteFile(session->stdinWrite, data, (DWORD)size, &written, NULL))
        {
            return -1;
        }
        return (int)written;
    }
#else
    {
        ssize_t written;
        if (session->stdinWrite < 0)
        {
            return -1;
        }
        written = write(session->stdinWrite, data, size);
        return written < 0 ? -1 : (int)written;
    }
#endif
}

int CpmPythonSession_WriteString(CpmPythonSession *session, const char *text)
{
    if (text == NULL)
    {
        text = "";
    }
    return CpmPythonSession_WriteBytes(session, (const uint8_t *)text, strlen(text));
}

int CpmPythonSession_SendLine(CpmPythonSession *session, const char *line)
{
    size_t len;
    if (line == NULL)
    {
        line = "";
    }
    len = strlen(line);
    if (CpmPythonSession_WriteBytes(session, (const uint8_t *)line, len) < 0)
    {
        return -1;
    }
    if (len == 0 || line[len - 1] != '\n')
    {
        return CpmPythonSession_WriteBytes(session, (const uint8_t *)"\n", 1) == 1 ? 0 : -1;
    }
    return 0;
}

int CpmPythonSession_SendJson(CpmPythonSession *session, const char *jsonLine)
{
    return CpmPythonSession_SendLine(session, jsonLine);
}

static int CpmPy_WaitReadable(CpmPythonSession *session, int timeoutMs)
{
#if defined(_WIN32)
    ULONGLONG startTick;
    if (session == NULL || session->stdoutRead == NULL)
    {
        return -1;
    }
    startTick = GetTickCount64();
    while (1)
    {
        DWORD available = 0;
        if (!PeekNamedPipe(session->stdoutRead, NULL, 0, NULL, &available, NULL))
        {
            return -1;
        }
        if (available > 0)
        {
            return 1;
        }
        if (!CpmPythonSession_IsRunning(session))
        {
            return 1;
        }
        if (timeoutMs == 0)
        {
            return 0;
        }
        if (timeoutMs > 0 && (int)(GetTickCount64() - startTick) >= timeoutMs)
        {
            return 0;
        }
        Sleep(5);
    }
#else
    fd_set readSet;
    struct timeval tv;
    struct timeval *tvPtr = NULL;
    int rc;

    if (session == NULL || session->stdoutRead < 0)
    {
        return -1;
    }
    FD_ZERO(&readSet);
    FD_SET(session->stdoutRead, &readSet);
    if (timeoutMs >= 0)
    {
        tv.tv_sec = timeoutMs / 1000;
        tv.tv_usec = (timeoutMs % 1000) * 1000;
        tvPtr = &tv;
    }
    rc = select(session->stdoutRead + 1, &readSet, NULL, NULL, tvPtr);
    return rc > 0 ? 1 : rc;
#endif
}

int CpmPythonSession_ReadBytes(CpmPythonSession *session, uint8_t *buffer, size_t maxSize, int timeoutMs)
{
    if (session == NULL || buffer == NULL || maxSize == 0)
    {
        return 0;
    }
    if (session->rxSize > 0)
    {
        size_t count = session->rxSize < maxSize ? session->rxSize : maxSize;
        memcpy(buffer, session->rxBuffer, count);
        memmove(session->rxBuffer, session->rxBuffer + count, session->rxSize - count);
        session->rxSize -= count;
        return (int)count;
    }

    if (CpmPy_WaitReadable(session, timeoutMs < 0 ? session->config.readTimeoutMs : timeoutMs) <= 0)
    {
        return 0;
    }

#if defined(_WIN32)
    {
        DWORD bytesRead = 0;
        if (session->stdoutRead == NULL)
        {
            return -1;
        }
        if (!ReadFile(session->stdoutRead, buffer, (DWORD)maxSize, &bytesRead, NULL))
        {
            return 0;
        }
        return (int)bytesRead;
    }
#else
    {
        ssize_t bytesRead;
        if (session->stdoutRead < 0)
        {
            return -1;
        }
        bytesRead = read(session->stdoutRead, buffer, maxSize);
        if (bytesRead < 0)
        {
            if (errno == EAGAIN || errno == EWOULDBLOCK)
            {
                return 0;
            }
            return -1;
        }
        return (int)bytesRead;
    }
#endif
}

int CpmPythonSession_ReadLine(CpmPythonSession *session, char *outLine, size_t outLineSize, int timeoutMs)
{
    size_t outSize = 0;
    int elapsedMs = 0;

    if (session == NULL || outLine == NULL || outLineSize == 0)
    {
        return -1;
    }
    outLine[0] = '\0';

    while (outSize + 1 < outLineSize)
    {
        size_t i;
        for (i = 0; i < session->rxSize; ++i)
        {
            if (session->rxBuffer[i] == '\n')
            {
                size_t count = i;
                if (count > 0 && session->rxBuffer[count - 1] == '\r')
                {
                    --count;
                }
                if (count > outLineSize - 1)
                {
                    count = outLineSize - 1;
                }
                memcpy(outLine, session->rxBuffer, count);
                outLine[count] = '\0';
                memmove(session->rxBuffer, session->rxBuffer + i + 1, session->rxSize - i - 1);
                session->rxSize -= i + 1;
                return 1;
            }
        }

        {
            uint8_t temp[256];
            int perTry = timeoutMs == 0 ? 0 : 20;
            int count = CpmPythonSession_ReadBytes(session, temp, sizeof(temp), perTry);
            if (count > 0)
            {
                if (CpmPy_AppendBytes(&session->rxBuffer, &session->rxSize, &session->rxCapacity, temp, (size_t)count) != 0)
                {
                    return -1;
                }
                continue;
            }
            if (count < 0)
            {
                return -1;
            }
        }

        if (timeoutMs == 0)
        {
            return 0;
        }
        if (timeoutMs > 0)
        {
            elapsedMs += 20;
            if (elapsedMs >= timeoutMs)
            {
                return 0;
            }
        }
        if (!CpmPythonSession_IsRunning(session) && session->rxSize == 0)
        {
            return 0;
        }
    }

    return -1;
}

int CpmPythonSession_ReceiveJson(CpmPythonSession *session, char *jsonLine, size_t jsonLineSize, int timeoutMs)
{
    return CpmPythonSession_ReadLine(session, jsonLine, jsonLineSize, timeoutMs);
}

int CpmPython_RunScript(const CpmPythonConfig *config,
                        const char *const *args,
                        size_t argCount,
                        int timeoutMs,
                        CpmPythonResult *result)
{
    CpmPythonSession *session = NULL;
    uint8_t temp[512];
    int rc;
    int elapsedMs = 0;

    if (result == NULL)
    {
        return -1;
    }
    CpmPython_ResultInit(result);

    if (CpmPythonSession_Start(&session, config, args, argCount) != 0)
    {
        return -1;
    }
    result->launched = 1;
    CpmPythonSession_CloseInput(session);

    while (1)
    {
        rc = CpmPythonSession_ReadBytes(session, temp, sizeof(temp), 50);
        if (rc > 0)
        {
            CpmPy_AppendOutput(result, temp, (size_t)rc);
        }

        if (!CpmPythonSession_IsRunning(session))
        {
            while ((rc = CpmPythonSession_ReadBytes(session, temp, sizeof(temp), 20)) > 0)
            {
                CpmPy_AppendOutput(result, temp, (size_t)rc);
            }
            result->exitCode = CpmPythonSession_Wait(session, 200);
            result->finished = 1;
            CpmPythonSession_Close(&session, 0);
            return 0;
        }

        if (timeoutMs >= 0)
        {
            elapsedMs += 50;
            if (elapsedMs >= timeoutMs)
            {
                result->timedOut = 1;
                CpmPythonSession_Close(&session, 1);
                return 1;
            }
        }
    }
}
`;


const C_WEBUI_HEADER_TEMPLATE = String.raw`#ifndef {{guard}}
#define {{guard}}

#ifdef __cplusplus
extern "C" {
#endif

#include <stddef.h>

#ifndef CPM_WEBUI_REQUEST_BODY_SIZE
#define CPM_WEBUI_REQUEST_BODY_SIZE 8192
#endif

#ifndef CPM_WEBUI_RESPONSE_BODY_SIZE
#define CPM_WEBUI_RESPONSE_BODY_SIZE 16384
#endif

#ifndef CPM_WEBUI_MAX_ROUTES
#define CPM_WEBUI_MAX_ROUTES 32
#endif

typedef struct CpmWebUiServer CpmWebUiServer;

typedef struct CpmWebUiConfig
{
    const char *bindAddress;
    unsigned short port;
    const char *documentRoot;
    const char *indexFile;
    int acceptTimeoutMs;
    int clientTimeoutMs;
    int allowDirectoryListing;
} CpmWebUiConfig;

typedef struct CpmWebUiRequest
{
    char method[16];
    char target[512];
    char path[512];
    char queryString[512];
    char httpVersion[32];
    char body[CPM_WEBUI_REQUEST_BODY_SIZE];
    char remoteIp[64];
    unsigned short remotePort;
} CpmWebUiRequest;

typedef struct CpmWebUiResponse
{
    int status;
    char contentType[96];
    char body[CPM_WEBUI_RESPONSE_BODY_SIZE];
} CpmWebUiResponse;

typedef int (*CpmWebUiRouteHandler)(const CpmWebUiRequest *request,
                                   CpmWebUiResponse *response,
                                   void *userData);
typedef const char *(*CpmWebUiStateProvider)(void *userData);
typedef void (*CpmWebUiActionHandler)(const CpmWebUiRequest *request,
                                      void *userData);

CpmWebUiServer *CpmWebUi_Create(void);
void CpmWebUi_Destroy(CpmWebUiServer **server);

void CpmWebUi_InitConfig(CpmWebUiConfig *config);
int CpmWebUi_Start(CpmWebUiServer *server, const CpmWebUiConfig *config);
void CpmWebUi_Stop(CpmWebUiServer *server);
int CpmWebUi_IsRunning(const CpmWebUiServer *server);

int CpmWebUi_RegisterGet(CpmWebUiServer *server, const char *route,
                         CpmWebUiRouteHandler handler, void *userData);
int CpmWebUi_RegisterPost(CpmWebUiServer *server, const char *route,
                          CpmWebUiRouteHandler handler, void *userData);
void CpmWebUi_SetStateProvider(CpmWebUiServer *server,
                               CpmWebUiStateProvider provider,
                               void *userData);
void CpmWebUi_SetActionHandler(CpmWebUiServer *server,
                               CpmWebUiActionHandler handler,
                               void *userData);

void CpmWebUi_SetTextResponse(CpmWebUiResponse *response, int status,
                              const char *contentType, const char *body);
const char *CpmWebUi_StatusText(int status);
void CpmWebUi_JsonEscape(char *dst, size_t dstSize, const char *src);
void CpmWebUi_MakeOkJson(char *dst, size_t dstSize, int ok, const char *message);

#ifdef __cplusplus
}
#endif

#endif /* {{guard}} */
`;

const C_WEBUI_SOURCE_TEMPLATE = String.raw`#include "{{headerFile}}"

#include <ctype.h>
#include <errno.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#if defined(_WIN32)
#  ifndef WIN32_LEAN_AND_MEAN
#    define WIN32_LEAN_AND_MEAN
#  endif
#  include <winsock2.h>
#  include <ws2tcpip.h>
#  include <process.h>
   typedef SOCKET CpmWebUiSocket;
#  define CPM_WEBUI_INVALID_SOCKET INVALID_SOCKET
#else
#  include <arpa/inet.h>
#  include <fcntl.h>
#  include <netinet/in.h>
#  include <pthread.h>
#  include <sys/select.h>
#  include <sys/socket.h>
#  include <sys/stat.h>
#  include <unistd.h>
   typedef int CpmWebUiSocket;
#  define CPM_WEBUI_INVALID_SOCKET (-1)
#endif

#ifndef CPM_WEBUI_RECV_BUFFER_SIZE
#define CPM_WEBUI_RECV_BUFFER_SIZE 32768
#endif

typedef struct CpmWebUiRoute
{
    char method[8];
    char route[128];
    CpmWebUiRouteHandler handler;
    void *userData;
} CpmWebUiRoute;

struct CpmWebUiServer
{
    CpmWebUiConfig config;
    int running;
    CpmWebUiSocket listenSocket;
    CpmWebUiRoute routes[CPM_WEBUI_MAX_ROUTES];
    size_t routeCount;
    CpmWebUiStateProvider stateProvider;
    void *stateUserData;
    CpmWebUiActionHandler actionHandler;
    void *actionUserData;
#if defined(_WIN32)
    HANDLE thread;
    CRITICAL_SECTION lock;
#else
    pthread_t thread;
    int threadStarted;
    pthread_mutex_t lock;
#endif
};

static void CpmWebUi_CopyString(char *dst, size_t dstSize, const char *src)
{
    if (dst == NULL || dstSize == 0)
        return;
    if (src == NULL)
        src = "";
    strncpy(dst, src, dstSize - 1);
    dst[dstSize - 1] = '\0';
}

static int CpmWebUi_EqualsIgnoreCase(const char *a, const char *b)
{
    if (a == NULL || b == NULL)
        return 0;
    while (*a && *b)
    {
        if (tolower((unsigned char)*a) != tolower((unsigned char)*b))
            return 0;
        ++a;
        ++b;
    }
    return *a == '\0' && *b == '\0';
}

static void CpmWebUi_NormalizeRoute(char *dst, size_t dstSize, const char *route)
{
    if (route == NULL || route[0] == '\0')
        route = "/";
    CpmWebUi_CopyString(dst, dstSize, route[0] == '/' ? route : "/");
    if (route[0] != '/' && dstSize > 2)
    {
        dst[0] = '/';
        CpmWebUi_CopyString(dst + 1, dstSize - 1, route);
    }
}

static void CpmWebUi_Lock(CpmWebUiServer *server)
{
#if defined(_WIN32)
    EnterCriticalSection(&server->lock);
#else
    pthread_mutex_lock(&server->lock);
#endif
}

static void CpmWebUi_Unlock(CpmWebUiServer *server)
{
#if defined(_WIN32)
    LeaveCriticalSection(&server->lock);
#else
    pthread_mutex_unlock(&server->lock);
#endif
}

static void CpmWebUi_CloseSocket(CpmWebUiSocket sock)
{
    if (sock == CPM_WEBUI_INVALID_SOCKET)
        return;
#if defined(_WIN32)
    closesocket(sock);
#else
    close(sock);
#endif
}

static int CpmWebUi_WaitReadable(CpmWebUiSocket sock, int timeoutMs)
{
    fd_set set;
    struct timeval tv;
    FD_ZERO(&set);
    FD_SET(sock, &set);
    tv.tv_sec = timeoutMs / 1000;
    tv.tv_usec = (timeoutMs % 1000) * 1000;
#if defined(_WIN32)
    return select(0, &set, NULL, NULL, &tv) > 0;
#else
    return select(sock + 1, &set, NULL, NULL, &tv) > 0;
#endif
}

void CpmWebUi_InitConfig(CpmWebUiConfig *config)
{
    if (config == NULL)
        return;
    config->bindAddress = "0.0.0.0";
    config->port = 8080;
    config->documentRoot = "./webui";
    config->indexFile = "index.html";
    config->acceptTimeoutMs = 250;
    config->clientTimeoutMs = 2000;
    config->allowDirectoryListing = 0;
}

CpmWebUiServer *CpmWebUi_Create(void)
{
    CpmWebUiServer *server = (CpmWebUiServer *)calloc(1, sizeof(CpmWebUiServer));
    if (server == NULL)
        return NULL;
    CpmWebUi_InitConfig(&server->config);
    server->listenSocket = CPM_WEBUI_INVALID_SOCKET;
#if defined(_WIN32)
    InitializeCriticalSection(&server->lock);
#else
    pthread_mutex_init(&server->lock, NULL);
#endif
    return server;
}

void CpmWebUi_Destroy(CpmWebUiServer **serverPtr)
{
    CpmWebUiServer *server;
    if (serverPtr == NULL || *serverPtr == NULL)
        return;
    server = *serverPtr;
    CpmWebUi_Stop(server);
#if defined(_WIN32)
    DeleteCriticalSection(&server->lock);
#else
    pthread_mutex_destroy(&server->lock);
#endif
    free(server);
    *serverPtr = NULL;
}

int CpmWebUi_IsRunning(const CpmWebUiServer *server)
{
    return server != NULL && server->running;
}

static int CpmWebUi_CreateListenSocket(CpmWebUiServer *server)
{
    struct sockaddr_in addr;
    int opt = 1;
    const char *bindAddress = server->config.bindAddress ? server->config.bindAddress : "0.0.0.0";

    server->listenSocket = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
    if (server->listenSocket == CPM_WEBUI_INVALID_SOCKET)
        return -1;

    setsockopt(server->listenSocket, SOL_SOCKET, SO_REUSEADDR, (const char *)&opt, sizeof(opt));

    memset(&addr, 0, sizeof(addr));
    addr.sin_family = AF_INET;
    addr.sin_port = htons(server->config.port);
    if (inet_pton(AF_INET, bindAddress, &addr.sin_addr) != 1)
        addr.sin_addr.s_addr = htonl(INADDR_ANY);

    if (bind(server->listenSocket, (struct sockaddr *)&addr, sizeof(addr)) != 0)
    {
        CpmWebUi_CloseSocket(server->listenSocket);
        server->listenSocket = CPM_WEBUI_INVALID_SOCKET;
        return -1;
    }
    if (listen(server->listenSocket, 16) != 0)
    {
        CpmWebUi_CloseSocket(server->listenSocket);
        server->listenSocket = CPM_WEBUI_INVALID_SOCKET;
        return -1;
    }
    return 0;
}

static int CpmWebUi_ReadRequest(CpmWebUiSocket client, CpmWebUiRequest *request, int timeoutMs)
{
    char buffer[CPM_WEBUI_RECV_BUFFER_SIZE];
    char *lineEnd;
    char *target;
    char *query;
    int received;

    memset(request, 0, sizeof(*request));
    if (!CpmWebUi_WaitReadable(client, timeoutMs))
        return -1;

    received = (int)recv(client, buffer, sizeof(buffer) - 1, 0);
    if (received <= 0)
        return -1;
    buffer[received] = '\0';

    lineEnd = strstr(buffer, "\r\n");
    if (lineEnd == NULL)
        lineEnd = strchr(buffer, '\n');
    if (lineEnd != NULL)
        *lineEnd = '\0';

    sscanf(buffer, "%15s %511s %31s", request->method, request->target, request->httpVersion);
    CpmWebUi_CopyString(request->path, sizeof(request->path), request->target);
    target = request->path;
    query = strchr(target, '?');
    if (query != NULL)
    {
        *query = '\0';
        CpmWebUi_CopyString(request->queryString, sizeof(request->queryString), query + 1);
    }

    {
        char *body = strstr(lineEnd != NULL ? lineEnd + 1 : buffer, "\r\n\r\n");
        if (body != NULL)
            CpmWebUi_CopyString(request->body, sizeof(request->body), body + 4);
    }

    return request->method[0] != '\0' && request->path[0] != '\0' ? 0 : -1;
}

void CpmWebUi_SetTextResponse(CpmWebUiResponse *response, int status, const char *contentType, const char *body)
{
    if (response == NULL)
        return;
    response->status = status;
    CpmWebUi_CopyString(response->contentType, sizeof(response->contentType), contentType ? contentType : "text/plain; charset=utf-8");
    CpmWebUi_CopyString(response->body, sizeof(response->body), body ? body : "");
}

const char *CpmWebUi_StatusText(int status)
{
    switch (status)
    {
        case 200: return "OK";
        case 201: return "Created";
        case 204: return "No Content";
        case 400: return "Bad Request";
        case 403: return "Forbidden";
        case 404: return "Not Found";
        case 500: return "Internal Server Error";
        default: return "OK";
    }
}

void CpmWebUi_JsonEscape(char *dst, size_t dstSize, const char *src)
{
    size_t out = 0;
    if (dst == NULL || dstSize == 0)
        return;
    if (src == NULL)
        src = "";
    while (*src && out + 2 < dstSize)
    {
        unsigned char c = (unsigned char)*src++;
        if (c == '"' || c == '\\')
        {
            dst[out++] = '\\';
            dst[out++] = (char)c;
        }
        else if (c == '\n')
        {
            dst[out++] = '\\'; dst[out++] = 'n';
        }
        else if (c == '\r')
        {
            dst[out++] = '\\'; dst[out++] = 'r';
        }
        else if (c == '\t')
        {
            dst[out++] = '\\'; dst[out++] = 't';
        }
        else
        {
            dst[out++] = (char)c;
        }
    }
    dst[out] = '\0';
}

void CpmWebUi_MakeOkJson(char *dst, size_t dstSize, int ok, const char *message)
{
    char escaped[512];
    CpmWebUi_JsonEscape(escaped, sizeof(escaped), message ? message : "");
    snprintf(dst, dstSize, "{\"ok\":%s,\"message\":\"%s\"}", ok ? "true" : "false", escaped);
}

static int CpmWebUi_SendAll(CpmWebUiSocket sock, const char *data, size_t length)
{
    size_t sentTotal = 0;
    while (sentTotal < length)
    {
        int sent = (int)send(sock, data + sentTotal, (int)(length - sentTotal), 0);
        if (sent <= 0)
            return -1;
        sentTotal += (size_t)sent;
    }
    return 0;
}

static int CpmWebUi_SendResponse(CpmWebUiSocket sock, const CpmWebUiResponse *response)
{
    char header[512];
    size_t bodyLen = strlen(response->body);
    int headerLen = snprintf(header, sizeof(header),
        "HTTP/1.1 %d %s\r\nContent-Type: %s\r\nContent-Length: %lu\r\nConnection: close\r\n\r\n",
        response->status,
        CpmWebUi_StatusText(response->status),
        response->contentType,
        (unsigned long)bodyLen);
    if (headerLen <= 0)
        return -1;
    if (CpmWebUi_SendAll(sock, header, (size_t)headerLen) != 0)
        return -1;
    return CpmWebUi_SendAll(sock, response->body, bodyLen);
}

static const char *CpmWebUi_ContentTypeFromPath(const char *path)
{
    const char *ext = strrchr(path, '.');
    if (ext == NULL) return "application/octet-stream";
    if (CpmWebUi_EqualsIgnoreCase(ext, ".html") || CpmWebUi_EqualsIgnoreCase(ext, ".htm")) return "text/html; charset=utf-8";
    if (CpmWebUi_EqualsIgnoreCase(ext, ".css")) return "text/css; charset=utf-8";
    if (CpmWebUi_EqualsIgnoreCase(ext, ".js")) return "application/javascript; charset=utf-8";
    if (CpmWebUi_EqualsIgnoreCase(ext, ".json")) return "application/json; charset=utf-8";
    if (CpmWebUi_EqualsIgnoreCase(ext, ".png")) return "image/png";
    if (CpmWebUi_EqualsIgnoreCase(ext, ".jpg") || CpmWebUi_EqualsIgnoreCase(ext, ".jpeg")) return "image/jpeg";
    return "application/octet-stream";
}

static int CpmWebUi_SendFile(CpmWebUiSocket sock, const char *filePath)
{
    FILE *f = fopen(filePath, "rb");
    char header[512];
    char buffer[4096];
    long size;
    int headerLen;
    if (f == NULL)
        return -1;
    fseek(f, 0, SEEK_END);
    size = ftell(f);
    fseek(f, 0, SEEK_SET);
    headerLen = snprintf(header, sizeof(header),
        "HTTP/1.1 200 OK\r\nContent-Type: %s\r\nContent-Length: %ld\r\nConnection: close\r\n\r\n",
        CpmWebUi_ContentTypeFromPath(filePath), size < 0 ? 0 : size);
    if (headerLen <= 0 || CpmWebUi_SendAll(sock, header, (size_t)headerLen) != 0)
    {
        fclose(f);
        return -1;
    }
    while (!feof(f))
    {
        size_t n = fread(buffer, 1, sizeof(buffer), f);
        if (n > 0 && CpmWebUi_SendAll(sock, buffer, n) != 0)
        {
            fclose(f);
            return -1;
        }
    }
    fclose(f);
    return 0;
}

static int CpmWebUi_TryStaticFile(CpmWebUiServer *server, CpmWebUiSocket sock, const CpmWebUiRequest *request)
{
    char relative[512];
    char filePath[1024];
    const char *root = server->config.documentRoot ? server->config.documentRoot : "./webui";
    const char *indexFile = server->config.indexFile ? server->config.indexFile : "index.html";

    if (!CpmWebUi_EqualsIgnoreCase(request->method, "GET"))
        return 0;
    if (strstr(request->path, "..") != NULL)
        return 0;

    CpmWebUi_CopyString(relative, sizeof(relative), request->path[0] == '/' ? request->path + 1 : request->path);
    if (relative[0] == '\0')
        CpmWebUi_CopyString(relative, sizeof(relative), indexFile);

    snprintf(filePath, sizeof(filePath), "%s/%s", root, relative);
    return CpmWebUi_SendFile(sock, filePath) == 0;
}

static void CpmWebUi_HandleRequest(CpmWebUiServer *server, CpmWebUiSocket sock, const CpmWebUiRequest *request)
{
    CpmWebUiResponse response;
    size_t i;
    CpmWebUi_SetTextResponse(&response, 404, "text/plain; charset=utf-8", "Not found");

    CpmWebUi_Lock(server);
    for (i = 0; i < server->routeCount; ++i)
    {
        CpmWebUiRoute *route = &server->routes[i];
        if (CpmWebUi_EqualsIgnoreCase(route->method, request->method) && strcmp(route->route, request->path) == 0)
        {
            route->handler(request, &response, route->userData);
            CpmWebUi_Unlock(server);
            CpmWebUi_SendResponse(sock, &response);
            return;
        }
    }

    if (CpmWebUi_EqualsIgnoreCase(request->method, "GET") && strcmp(request->path, "/api/state") == 0)
    {
        const char *json = server->stateProvider ? server->stateProvider(server->stateUserData) : "{}";
        CpmWebUi_SetTextResponse(&response, 200, "application/json; charset=utf-8", json);
        CpmWebUi_Unlock(server);
        CpmWebUi_SendResponse(sock, &response);
        return;
    }

    if (CpmWebUi_EqualsIgnoreCase(request->method, "POST") && strcmp(request->path, "/api/action") == 0)
    {
        char ok[256];
        if (server->actionHandler)
            server->actionHandler(request, server->actionUserData);
        CpmWebUi_MakeOkJson(ok, sizeof(ok), 1, "action accepted");
        CpmWebUi_SetTextResponse(&response, 200, "application/json; charset=utf-8", ok);
        CpmWebUi_Unlock(server);
        CpmWebUi_SendResponse(sock, &response);
        return;
    }
    CpmWebUi_Unlock(server);

    if (CpmWebUi_TryStaticFile(server, sock, request))
        return;
    CpmWebUi_SendResponse(sock, &response);
}

static void CpmWebUi_HandleClient(CpmWebUiServer *server, CpmWebUiSocket client)
{
    CpmWebUiRequest request;
    if (CpmWebUi_ReadRequest(client, &request, server->config.clientTimeoutMs) == 0)
        CpmWebUi_HandleRequest(server, client, &request);
}

static void CpmWebUi_AcceptLoop(CpmWebUiServer *server)
{
    while (server->running)
    {
        CpmWebUiSocket client;
        if (!CpmWebUi_WaitReadable(server->listenSocket, server->config.acceptTimeoutMs))
            continue;
        client = accept(server->listenSocket, NULL, NULL);
        if (client == CPM_WEBUI_INVALID_SOCKET)
            continue;
        CpmWebUi_HandleClient(server, client);
        CpmWebUi_CloseSocket(client);
    }
}

#if defined(_WIN32)
static unsigned __stdcall CpmWebUi_ThreadProc(void *arg)
{
    CpmWebUi_AcceptLoop((CpmWebUiServer *)arg);
    return 0;
}
#else
static void *CpmWebUi_ThreadProc(void *arg)
{
    CpmWebUi_AcceptLoop((CpmWebUiServer *)arg);
    return NULL;
}
#endif

int CpmWebUi_Start(CpmWebUiServer *server, const CpmWebUiConfig *config)
{
#if defined(_WIN32)
    WSADATA wsaData;
#endif
    if (server == NULL)
        return -1;
    CpmWebUi_Stop(server);
    if (config != NULL)
        server->config = *config;
    if (server->config.acceptTimeoutMs <= 0) server->config.acceptTimeoutMs = 250;
    if (server->config.clientTimeoutMs <= 0) server->config.clientTimeoutMs = 2000;

#if defined(_WIN32)
    if (WSAStartup(MAKEWORD(2, 2), &wsaData) != 0)
        return -1;
#endif
    if (CpmWebUi_CreateListenSocket(server) != 0)
        return -1;

    server->running = 1;
#if defined(_WIN32)
    server->thread = (HANDLE)_beginthreadex(NULL, 0, CpmWebUi_ThreadProc, server, 0, NULL);
    if (server->thread == NULL)
    {
        server->running = 0;
        CpmWebUi_CloseSocket(server->listenSocket);
        server->listenSocket = CPM_WEBUI_INVALID_SOCKET;
        return -1;
    }
#else
    if (pthread_create(&server->thread, NULL, CpmWebUi_ThreadProc, server) != 0)
    {
        server->running = 0;
        CpmWebUi_CloseSocket(server->listenSocket);
        server->listenSocket = CPM_WEBUI_INVALID_SOCKET;
        return -1;
    }
    server->threadStarted = 1;
#endif
    return 0;
}

void CpmWebUi_Stop(CpmWebUiServer *server)
{
    if (server == NULL)
        return;
    if (!server->running && server->listenSocket == CPM_WEBUI_INVALID_SOCKET)
        return;
    server->running = 0;
    CpmWebUi_CloseSocket(server->listenSocket);
    server->listenSocket = CPM_WEBUI_INVALID_SOCKET;
#if defined(_WIN32)
    if (server->thread != NULL)
    {
        WaitForSingleObject(server->thread, INFINITE);
        CloseHandle(server->thread);
        server->thread = NULL;
    }
    WSACleanup();
#else
    if (server->threadStarted)
    {
        pthread_join(server->thread, NULL);
        server->threadStarted = 0;
    }
#endif
}

static int CpmWebUi_RegisterRoute(CpmWebUiServer *server, const char *method, const char *route,
                                  CpmWebUiRouteHandler handler, void *userData)
{
    CpmWebUiRoute *slot;
    if (server == NULL || method == NULL || route == NULL || handler == NULL)
        return -1;
    CpmWebUi_Lock(server);
    if (server->routeCount >= CPM_WEBUI_MAX_ROUTES)
    {
        CpmWebUi_Unlock(server);
        return -1;
    }
    slot = &server->routes[server->routeCount++];
    CpmWebUi_CopyString(slot->method, sizeof(slot->method), method);
    CpmWebUi_NormalizeRoute(slot->route, sizeof(slot->route), route);
    slot->handler = handler;
    slot->userData = userData;
    CpmWebUi_Unlock(server);
    return 0;
}

int CpmWebUi_RegisterGet(CpmWebUiServer *server, const char *route,
                         CpmWebUiRouteHandler handler, void *userData)
{
    return CpmWebUi_RegisterRoute(server, "GET", route, handler, userData);
}

int CpmWebUi_RegisterPost(CpmWebUiServer *server, const char *route,
                          CpmWebUiRouteHandler handler, void *userData)
{
    return CpmWebUi_RegisterRoute(server, "POST", route, handler, userData);
}

void CpmWebUi_SetStateProvider(CpmWebUiServer *server, CpmWebUiStateProvider provider, void *userData)
{
    if (server == NULL)
        return;
    CpmWebUi_Lock(server);
    server->stateProvider = provider;
    server->stateUserData = userData;
    CpmWebUi_Unlock(server);
}

void CpmWebUi_SetActionHandler(CpmWebUiServer *server, CpmWebUiActionHandler handler, void *userData)
{
    if (server == NULL)
        return;
    CpmWebUi_Lock(server);
    server->actionHandler = handler;
    server->actionUserData = userData;
    CpmWebUi_Unlock(server);
}
`;


interface BundledModuleChoice {
  label: string;
  group: string;
  description: string;
  detail: string;
  defaultFolder: string;
  entries: string[];
  generator?: 'c-core' | 'c-error' | 'c-python-bridge' | 'c-webui-server' | 'cpp-core' | 'cpp-error' | 'script-python-worker' | 'script-minimal-webui';
  requiredWindowsLibraries?: string[];
}

function normalizeExtension(extension: string): string {
  const trimmed = String(extension || '').trim();
  if (!trimmed) {
    return '.txt';
  }
  return trimmed.startsWith('.') ? trimmed.toLowerCase() : `.${trimmed.toLowerCase()}`;
}

function sanitizeId(value: string): string {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || 'custom';
}

function sanitizePrefix(value: string): string {
  let prefix = String(value || '')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();
  if (!prefix) {
    prefix = 'CPP_MODULE';
  }
  if (/^[0-9]/.test(prefix)) {
    prefix = `_${prefix}`;
  }
  return prefix;
}

function toCrlf(value: string): string {
  return String(value || '').replace(/\r?\n/g, '\r\n');
}

export function headerGuardForPath(filePath: string): string {
  const withoutExtension = path.basename(filePath, path.extname(filePath));
  return `${sanitizePrefix(withoutExtension)}_H`;
}

export function renderTemplateText(template: string, variables: TemplateVariables): string {
  return String(template || '').replace(/\{\{([A-Za-z0-9_]+)\}\}/g, (_match, key: string) => {
    const value = variables[key as keyof TemplateVariables];
    return value === undefined ? `{{${key}}}` : String(value);
  });
}

export function resolveUirTemplateVersion(preference: string, installationRoot?: string): 'cpm2012' | 'cpm2020' {
  const normalizedPreference = String(preference || 'auto').toLowerCase();
  if (normalizedPreference === 'cpm2020') {
    return 'cpm2020';
  }
  if (normalizedPreference === 'cpm2012') {
    return 'cpm2012';
  }
  const root = String(installationRoot || '');
  const year = root.match(/(?:CPM|LabWindows[^0-9]*)(20\d{2})/i)?.[1];
  return year && Number(year) >= 2020 ? 'cpm2020' : 'cpm2012';
}

const GUARDED_HEADER_TEMPLATE = `#ifndef {{guard}}
#define {{guard}}

#ifdef __cplusplus
extern "C" {
#endif

/* Public declarations for {{baseName}}. */

#ifdef __cplusplus
}
#endif

#endif /* {{guard}} */
`;

const MODULE_SOURCE_TEMPLATE = `#include "{{headerFile}}"

/* Add the implementation of {{baseName}} here. */
`;

const MAIN_TEMPLATE = `#include <stdio.h>

int main(int argc, char **argv)
{
    printf("Hello from {{baseName}}!\\n");

    /* Receive arguments of the program.
       argv[0] is the program name/path.
       argv[1] is the first user parameter if argc > 1. */
    if (argc > 1)
    {
        for (int i = 1; i < argc; ++i)
        {
            printf("Argument %d: %s\\n", i, argv[i]);
        }
    }

    return 0;
}
`;

const CPP_MAIN_TEMPLATE = `#include <iostream>

int main(int argc, char **argv)
{
    std::cout << "Hello from {{baseName}}!" << std::endl;

    // Receive arguments of the program.
    // argv[0] is the program name/path.
    // argv[1] is the first user parameter if argc > 1.
    if (argc > 1)
    {
        for (int i = 1; i < argc; ++i)
        {
            std::cout << "Argument " << i << ": " << argv[i] << std::endl;
        }
    }

    return 0;
}
`;

const WINMAIN_TEMPLATE = `#include <windows.h>

int WINAPI WinMain(HINSTANCE hInstance, HINSTANCE hPrevInstance,
                   LPSTR lpCmdLine, int nCmdShow)
{
    BOOL hasCurrentInstance = (hInstance != NULL);
    BOOL hasPreviousInstance = (hPrevInstance != NULL);

    if (!hasCurrentInstance || hasPreviousInstance)
    {
        return -1;
    }

    if (nCmdShow == SW_HIDE)
    {
        return 0;
    }

    /* Receive command-line arguments.
       lpCmdLine contains the command-line text after the executable name. */
    if (lpCmdLine != NULL && lpCmdLine[0] != '\\0')
    {
        MessageBoxA(NULL, lpCmdLine, "Command line arguments", MB_OK);
    }
    else
    {
        MessageBoxA(NULL, "Hello from {{baseName}}!", "C/C++ Project", MB_OK);
    }

    return 0;
}
`;

const CPP_CLASS_HEADER_TEMPLATE = `#ifndef {{guard}}
#define {{guard}}

class {{baseName}}
{
public:
    {{baseName}}();
    ~{{baseName}}();
};

#endif /* {{guard}} */
`;

const CPP_CLASS_SOURCE_TEMPLATE = `#include "{{headerFile}}"

{{baseName}}::{{baseName}}()
{
}

{{baseName}}::~{{baseName}}()
{
}
`;

const RTMAIN_TEMPLATE = `#include <windows.h>
#include <cpmrte.h>
#include <rtutil.h>

void CPMFUNC_C RTmain (void)
{
    if (Initruntime (0, 0, 0) == 0)
        return;    /* out of memory */

    /* initialization code */

    while (!RTIsShuttingDown ())
    {
        /* periodic code */
        Sleep (100);
    }

    /* cleanup code */
    Closeruntime ();
}
`;

const DLL_HEADER_TEMPLATE = `#ifndef {{guard}}
#define {{guard}}

#ifdef __cplusplus
extern "C" {
#endif

#if defined(_WIN32)
#  if defined({{prefix}}_EXPORTS)
#    define {{prefix}}_API __declspec(dllexport)
#  else
#    define {{prefix}}_API __declspec(dllimport)
#  endif
#else
#  define {{prefix}}_API
#endif

/* Add exported declarations here. Example:
 * {{prefix}}_API int {{baseName}}_Initialize (void);
 */

#ifdef __cplusplus
}
#endif

#endif /* {{guard}} */
`;

const DLL_SOURCE_TEMPLATE = `#include <windows.h>
#include "{{headerFile}}"

BOOL WINAPI DllMain(HINSTANCE hinstDLL, DWORD fdwReason, LPVOID lpvReserved)
{
    if (hinstDLL == NULL)
    {
        return FALSE;
    }

    switch(fdwReason)
    {
        case DLL_PROCESS_ATTACH:
            // Code to run when the DLL is loaded
            break;
        case DLL_THREAD_ATTACH:
            // Code to run when a thread is created
            break;
        case DLL_THREAD_DETACH:
            // Code to run when a thread ends
            break;
        case DLL_PROCESS_DETACH:
            if (lpvReserved != NULL)
            {
                // The process is terminating.
            }
            // Code to run when the DLL is unloaded
            break;
    }
    return TRUE;
}
`;

const UI_APP_SOURCE_TEMPLATE = `//==============================================================================
//
// Title:       {{baseName}}
// Purpose:     C/C++ user-interface application starter.
//
// Generated on: {{date}}
//
//==============================================================================

#include <cpmrte.h>
#include <userint.h>
#include "{{headerFile}}"

static int panelHandle = 0;

int CPMCALLBACK panelCB (int panel, int event, void *callbackData,
                         int eventData1, int eventData2);

int main (int argc, char *argv[])
{
    int status = 0;

    if (Initruntime (0, argv, 0) == 0)
        return -1;

    panelHandle = LoadPanel (0, "{{uirFile}}", PANEL);
    if (panelHandle < 0)
    {
        status = -2;
        goto Cleanup;
    }

    DisplayPanel (panelHandle);
    RunUserInterface ();

Cleanup:
    if (panelHandle > 0)
        DiscardPanel (panelHandle);
    Closeruntime ();
    return status;
}

int CPMCALLBACK panelCB (int panel, int event, void *callbackData,
                         int eventData1, int eventData2)
{
    (void)panel;
    (void)callbackData;
    (void)eventData1;
    (void)eventData2;

    if (event == EVENT_CLOSE)
        QuitUserInterface (0);

    return 0;
}
`;

const ERROR_HEADER_TEMPLATE = `#ifndef {{guard}}
#define {{guard}}

#ifdef __cplusplus
extern "C" {
#endif

#include <stddef.h>

#ifndef CPM_ERROR_MESSAGE_SIZE
#define CPM_ERROR_MESSAGE_SIZE 512
#endif

#ifndef CPM_ERROR_PATH_SIZE
#define CPM_ERROR_PATH_SIZE 1024
#endif

#define ERROR_LABEL error

typedef struct CpmErrorConfig
{
    int enabled;
    int mirrorToStderr;
    int maxLogLines;
    char logPath[CPM_ERROR_PATH_SIZE];
} CpmErrorConfig;

extern int g_cpmErrorCode;
extern CpmErrorConfig g_cpmErrorConfig;

void CpmError_InitDefaults(void);
int CpmError_LoadConfig(const char *iniPath);
void CpmError_SetEnabled(int enabled);
void CpmError_SetLogFile(const char *filePath);
void CpmError_Log(const char *format, ...);
void CpmError_Report(int code, const char *message, const char *file,
                     int line, const char *functionName);

#if defined(_MSC_VER)
#  define CPM_ERROR_FUNCTION __FUNCTION__
#else
#  define CPM_ERROR_FUNCTION __func__
#endif

#define CPM_ERR_INFZ(code, message) \\
    do { \\
        int cpmErrorCodeLocal = (code); \\
        if (cpmErrorCodeLocal < 0) { \\
            g_cpmErrorCode = cpmErrorCodeLocal; \\
            CpmError_Report(cpmErrorCodeLocal, (message), __FILE__, __LINE__, CPM_ERROR_FUNCTION); \\
            goto ERROR_LABEL; \\
        } \\
    } while (0)

#define CPM_ERR_INFEQZ(code, message) \\
    do { \\
        int cpmErrorCodeLocal = (code); \\
        if (cpmErrorCodeLocal <= 0) { \\
            g_cpmErrorCode = cpmErrorCodeLocal; \\
            CpmError_Report(cpmErrorCodeLocal, (message), __FILE__, __LINE__, CPM_ERROR_FUNCTION); \\
            goto ERROR_LABEL; \\
        } \\
    } while (0)

#define CPM_ERR_CHCK_INFZ(expression) \\
    CPM_ERR_INFZ((expression), #expression)

#define CPM_ERR_CHCK_INFEQZ(expression) \\
    CPM_ERR_INFEQZ((expression), #expression)

#define CPM_ERR_PTR(pointer) \\
    do { \\
        if ((pointer) == NULL) { \\
            g_cpmErrorCode = -999; \\
            CpmError_Report(g_cpmErrorCode, "NULL pointer: " #pointer, __FILE__, __LINE__, CPM_ERROR_FUNCTION); \\
            goto ERROR_LABEL; \\
        } \\
    } while (0)

#ifdef __cplusplus
}
#endif

#endif /* {{guard}} */
`;

const ERROR_SOURCE_TEMPLATE = `#include "{{headerFile}}"

#include <ctype.h>
#include <stdarg.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
#if defined(_WIN32)
#  define CPM_STRICMP _stricmp
#else
#  include <strings.h>
#  define CPM_STRICMP strcasecmp
#endif

int g_cpmErrorCode = 0;
CpmErrorConfig g_cpmErrorConfig;

static void CpmError_CopyString(char *dst, size_t dstSize, const char *src)
{
    if (dst == NULL || dstSize == 0)
        return;
    if (src == NULL)
        src = "";
    strncpy(dst, src, dstSize - 1);
    dst[dstSize - 1] = '\\0';
}

static char *CpmError_Trim(char *text)
{
    char *end;
    while (*text != '\\0' && isspace((unsigned char)*text))
        ++text;
    end = text + strlen(text);
    while (end > text && isspace((unsigned char)*(end - 1)))
        --end;
    *end = '\\0';
    return text;
}

static int CpmError_ParseBool(const char *text, int defaultValue)
{
    if (text == NULL)
        return defaultValue;
    if (CPM_STRICMP(text, "true") == 0 || CPM_STRICMP(text, "yes") == 0 || strcmp(text, "1") == 0 || CPM_STRICMP(text, "on") == 0)
        return 1;
    if (CPM_STRICMP(text, "false") == 0 || CPM_STRICMP(text, "no") == 0 || strcmp(text, "0") == 0 || CPM_STRICMP(text, "off") == 0)
        return 0;
    return defaultValue;
}

static void CpmError_TrimLogIfNeeded(void)
{
    FILE *file;
    char line[512];
    int lineCount = 0;

    if (!g_cpmErrorConfig.enabled || g_cpmErrorConfig.maxLogLines <= 0 || g_cpmErrorConfig.logPath[0] == '\\0')
        return;

    file = fopen(g_cpmErrorConfig.logPath, "r");
    if (file == NULL)
        return;

    while (fgets(line, sizeof(line), file) != NULL)
        ++lineCount;
    fclose(file);

    if (lineCount > g_cpmErrorConfig.maxLogLines)
    {
        file = fopen(g_cpmErrorConfig.logPath, "w");
        if (file != NULL)
            fclose(file);
    }
}

void CpmError_InitDefaults(void)
{
    g_cpmErrorConfig.enabled = 1;
    g_cpmErrorConfig.mirrorToStderr = 1;
    g_cpmErrorConfig.maxLogLines = 5000;
    CpmError_CopyString(g_cpmErrorConfig.logPath, sizeof(g_cpmErrorConfig.logPath), "logs/error.log");
}

int CpmError_LoadConfig(const char *iniPath)
{
    FILE *file;
    char line[1024];

    CpmError_InitDefaults();
    if (iniPath == NULL || iniPath[0] == '\\0')
        return 0;

    file = fopen(iniPath, "r");
    if (file == NULL)
        return -1;

    while (fgets(line, sizeof(line), file) != NULL)
    {
        char *trimmed = CpmError_Trim(line);
        char *equals;
        char *key;
        char *value;
        if (trimmed[0] == '\\0' || trimmed[0] == '#' || trimmed[0] == ';' || trimmed[0] == '[')
            continue;
        equals = strchr(trimmed, '=');
        if (equals == NULL)
            continue;
        *equals = '\\0';
        key = CpmError_Trim(trimmed);
        value = CpmError_Trim(equals + 1);

        if (CPM_STRICMP(key, "enabled") == 0)
            g_cpmErrorConfig.enabled = CpmError_ParseBool(value, g_cpmErrorConfig.enabled);
        else if (CPM_STRICMP(key, "mirror_to_stderr") == 0)
            g_cpmErrorConfig.mirrorToStderr = CpmError_ParseBool(value, g_cpmErrorConfig.mirrorToStderr);
        else if (CPM_STRICMP(key, "max_log_lines") == 0)
            g_cpmErrorConfig.maxLogLines = atoi(value);
        else if (CPM_STRICMP(key, "log_path") == 0)
            CpmError_CopyString(g_cpmErrorConfig.logPath, sizeof(g_cpmErrorConfig.logPath), value);
    }

    fclose(file);
    return 0;
}

void CpmError_SetEnabled(int enabled)
{
    g_cpmErrorConfig.enabled = enabled ? 1 : 0;
}

void CpmError_SetLogFile(const char *filePath)
{
    CpmError_CopyString(g_cpmErrorConfig.logPath, sizeof(g_cpmErrorConfig.logPath), filePath);
}

void CpmError_Log(const char *format, ...)
{
    char message[2048];
    FILE *file;
    va_list args;

    va_start(args, format);
    vsnprintf(message, sizeof(message), format, args);
    va_end(args);
    message[sizeof(message) - 1] = '\\0';

    if (g_cpmErrorConfig.enabled && g_cpmErrorConfig.logPath[0] != '\\0')
    {
        CpmError_TrimLogIfNeeded();
        file = fopen(g_cpmErrorConfig.logPath, "a");
        if (file != NULL)
        {
            fputs(message, file);
            fflush(file);
            fclose(file);
        }
    }

    if (g_cpmErrorConfig.mirrorToStderr)
        fputs(message, stderr);
}

void CpmError_Report(int code, const char *message, const char *file,
                     int line, const char *functionName)
{
    time_t now = time(NULL);
    const char *timestamp = ctime(&now);

    CpmError_Log("*** C/C++ ERROR ***\\n"
                 "Code: %d\\n"
                 "Message: %s\\n"
                 "File: %s\\n"
                 "Line: %d\\n"
                 "Function: %s\\n"
                 "Time: %s\\n",
                 code,
                 message != NULL ? message : "(none)",
                 file != NULL ? file : "(unknown)",
                 line,
                 functionName != NULL ? functionName : "(unknown)",
                 timestamp != NULL ? timestamp : "(unknown)\\n");
}
`;

const ERROR_INI_TEMPLATE = `[error]
enabled=true
mirror_to_stderr=true
log_path=logs/error.log
max_log_lines=5000
`;


const FILE_DESCRIPTION_HEADER_TEMPLATE = `//****************************************************************************
//**                                                                        **
//**   {{company}}                                                          **
//**   {{address1}}                                                         **
//**   {{address2}}                                                         **
//**   {{tel}}                                                              **
//**   {{fax}}                                                              **
//**   {{email}}                                                            **
//**                                                                        **
//****************************************************************************
//**                         CHANGES/EVOLUTIONS                             **
//**________________________________________________________________________**
//**   Date   |   Author   | Version |          Description                 **
//**__________|____________|_________|______________________________________**
{{changeLine}}
//**          |            |         |                                      **
//****************************************************************************

`;

const MAIN_WITH_ERROR_SOURCE_TEMPLATE = `{{fileHeader}}// Includes files
{{mainHeaderInclude}}#include "cpm_error.h"

//==============================================================================
// Error management
/*
    CPM_ERR_INFZ(code, message)     // Jump to error if code < 0
    CPM_ERR_INFEQZ(code, message)   // Jump to error if code <= 0
    CPM_ERR_CHCK_INFZ(expression)   // Evaluate expression and check < 0
    CPM_ERR_CHCK_INFEQZ(expression) // Evaluate expression and check <= 0
    CPM_ERR_PTR(pointer)            // Jump to error if pointer == NULL
*/

//==============================================================================
// Constants

//==============================================================================
// Types

//==============================================================================
// Static global variables

//==============================================================================
// Static functions

//==============================================================================
// Global variables

//==============================================================================
// Global functions

int main(int argc, char **argv)
{
    int status = 0;

    CpmError_InitDefaults();
    CpmError_LoadConfig("cpm_error.ini");

    //==============================================================================
    // Command-line arguments
    if (argc > 1)
    {
        const char *firstArgument = argv[1];

        if (firstArgument == NULL)
        {
            g_cpmErrorCode = -1;
            CpmError_Report(g_cpmErrorCode, "Invalid first argument", __FILE__, __LINE__, CPM_ERROR_FUNCTION);
            goto error;
        }

        /* Use firstArgument or iterate argv[1..argc-1] here. */
    }

    /* Application code starts here. */

    goto cleanup;

error:
    status = g_cpmErrorCode;

cleanup:
    return status;
}
`;

const MAIN_WITH_ERROR_HEADER_TEMPLATE = `#ifndef {{guard}}
#define {{guard}}

#ifdef __cplusplus
extern "C" {
#endif

/* Public declarations for {{baseName}}. */

#ifdef __cplusplus
}
#endif

#endif /* {{guard}} */
`;

function formatDateDdMmYy(date = new Date()): string {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yy = String(date.getFullYear()).slice(-2);
  return `${dd}/${mm}/${yy}`;
}

function sanitizeHeaderText(value: string | undefined, fallback: string): string {
  const cleaned = String(value ?? '').replace(/[\r\n]+/g, ' ').trim();
  return cleaned || fallback;
}

function fitCell(value: string, width: number, align: 'left' | 'center' = 'left'): string {
  const clean = sanitizeHeaderText(value, '').replace(/\t/g, ' ');
  const text = clean.length > width ? clean.slice(0, Math.max(0, width - 1)) + '…' : clean;
  if (align === 'center') {
    const left = Math.floor((width - text.length) / 2);
    const right = Math.max(0, width - text.length - left);
    return `${' '.repeat(Math.max(0, left))}${text}${' '.repeat(right)}`;
  }
  return text.padEnd(width, ' ');
}

function renderHeaderChangeLine(date: string, author: string, version: string, description: string): string {
  return `//** ${fitCell(date, 8)} | ${fitCell(author, 10)} | ${fitCell(version, 7, 'center')} | ${fitCell(description, 36)} **`;
}

function renderFileDescriptionHeader(values: { company: string; address1: string; address2: string; tel: string; fax: string; email: string; date: string; author: string; version: string; description: string }): string {
  return FILE_DESCRIPTION_HEADER_TEMPLATE
    .replace('{{company}}', fitCell(values.company, 64))
    .replace('{{address1}}', fitCell(values.address1, 64))
    .replace('{{address2}}', fitCell(values.address2, 64))
    .replace('{{tel}}', fitCell(values.tel, 64))
    .replace('{{fax}}', fitCell(values.fax, 64))
    .replace('{{email}}', fitCell(values.email, 64))
    .replace('{{changeLine}}', renderHeaderChangeLine(values.date, values.author, values.version, values.description));
}

function renderCommentSection(title: string, style: string): string {
  const label = sanitizeHeaderText(title, 'Section');
  if (style === 'line') {
    return `//==============================================================================\n// ${label}\n\n`;
  }
  if (style === 'compact') {
    return `/* ${label} */\n`;
  }
  const content = ` ${label} `;
  const total = 54;
  const left = Math.max(1, Math.floor((total - content.length - 2) / 2));
  const right = Math.max(1, total - content.length - left - 2);
  return `/${'*'.repeat(left)}${content}${'*'.repeat(right)}/\n/${'*'.repeat(total - 2)}/\n`;
}

async function promptInput(title: string, prompt: string, value: string): Promise<string | undefined> {
  return vscode.window.showInputBox({ title, prompt, value });
}


const C_CORE_UTIL_README_TEMPLATE = `# CPM C core utilities

Generated C helpers for small project utilities.

## Files

- 'cpm_util.c' / 'cpm_util.h': string helpers, trimming helpers, timestamp helper and simple INI key reading.
- 'cpm_util.ini': example runtime configuration file.

## Typical use

'''c
#include "cpm_util.h"

char value[128];
if (CpmUtil_ReadIniString("cpm_util.ini", "utility", "logPath", value, sizeof(value)) == 0)
{
    /* use value */
}
'''
`;

const C_ERROR_README_TEMPLATE = `# CPM C error management

Generated C error/logging module with INI-controlled runtime configuration.

## Files

- 'cpm_error.c' / 'cpm_error.h': logging API and error-check macros.
- 'cpm_error.ini': runtime options such as log enable state and log path.

## Typical use

'''c
#include "cpm_error.h"

int status = 0;
CpmError_InitDefaults();
CpmError_LoadConfig("cpm_error.ini");

CPM_ERR_CHCK_INFZ(status);

cleanup:
    return status;
error:
    status = g_cpmErrorCode;
    goto cleanup;
'''
`;

const C_PYTHON_EXEC_README_TEMPLATE = `# CPM C Python execution bridge

Generated C bridge for launching Python scripts and exchanging text or JSON-like payloads through process pipes.

## Files

- 'cpm_python_exec.c' / 'cpm_python_exec.h': C API for one-shot script execution and interactive Python sessions.

## Related bundle

Python scripts are intentionally not copied with this backend bridge. Add them separately with:

'Module bundles > Scripts > Python worker protocol starter'

or, for the old project-specific demo scripts:

'Module bundles > Scripts > Robot demo Python scripts'
`;

const C_WEBUI_README_TEMPLATE = `# CPM C Web UI backend bridge

Generated C HTTP backend for serving a static frontend folder and exchanging state/action JSON with the application.

## Files

- 'cpm_webui.c' / 'cpm_webui.h': minimal HTTP server, static-file serving, '/api/state' and '/api/action' hooks.

## Windows link dependency

On Windows, this backend requires 'ws2_32'. CPM automatically adds 'ws2_32' to the workspace linker libraries when this bundle is added.

## Related frontend bundles

Use one of these script bundles separately:

- 'Module bundles > Scripts > Minimal Web UI frontend'
- 'Module bundles > Scripts > Embedded demo Web UI frontend'
`;

const PYTHON_WORKER_PROTOCOL_README_TEMPLATE = `# Python worker protocol starter

Small generic Python side of the CPM Python execution bridge.

## Files

- 'catj_py_helper.py': helper for line/JSON style stdin/stdout exchanges.
- 'example_worker.py': minimal worker loop example.
- 'logger.py': small logging helper.

This starter is intentionally generic. Project-specific robot, camera, LiDAR or ESP32 scripts are available separately in 'Robot demo Python scripts'.
`;

const PYTHON_WORKER_HELPER_TEMPLATE = `#!/usr/bin/env python3
"""Small helper functions for CPM Python worker scripts."""

import json
import sys
from typing import Any, Dict


def send_json(payload: Dict[str, Any]) -> None:
    print(json.dumps(payload, separators=(",", ":")), flush=True)


def read_json_line() -> Dict[str, Any]:
    line = sys.stdin.readline()
    if not line:
        return {"type": "eof"}
    try:
        value = json.loads(line)
        if isinstance(value, dict):
            return value
        return {"type": "value", "value": value}
    except json.JSONDecodeError as exc:
        return {"type": "error", "message": str(exc), "raw": line.rstrip("\\n")}
`;

const PYTHON_WORKER_LOGGER_TEMPLATE = `#!/usr/bin/env python3
"""Minimal logger for CPM Python worker scripts."""

from datetime import datetime
from pathlib import Path
from typing import Optional


class WorkerLogger:
    def __init__(self, path: Optional[str] = None) -> None:
        self.path = Path(path) if path else None

    def log(self, message: str) -> None:
        text = f"[{datetime.now().isoformat(timespec='seconds')}] {message}"
        if self.path:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            with self.path.open("a", encoding="utf-8") as stream:
                stream.write(text + "\\n")
        else:
            print(text, flush=True)
`;

const PYTHON_WORKER_EXAMPLE_TEMPLATE = `#!/usr/bin/env python3
"""Example Python worker for the CPM Python execution bridge."""

from catj_py_helper import read_json_line, send_json
from logger import WorkerLogger


def main() -> int:
    logger = WorkerLogger()
    send_json({"type": "ready"})
    while True:
        request = read_json_line()
        if request.get("type") in {"eof", "quit", "exit"}:
            send_json({"type": "bye"})
            return 0
        logger.log(f"request={request}")
        send_json({"type": "response", "ok": True, "echo": request})


if __name__ == "__main__":
    raise SystemExit(main())
`;

const MINIMAL_WEBUI_INDEX_TEMPLATE = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>CPM Web UI</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <main class="page">
    <h1>CPM Web UI</h1>
    <section class="card">
      <h2>State</h2>
      <pre id="state">Loading...</pre>
      <button id="refresh">Refresh state</button>
    </section>
    <section class="card">
      <h2>Action</h2>
      <input id="actionName" value="ping" aria-label="Action name">
      <button id="sendAction">Send action</button>
      <pre id="result"></pre>
    </section>
  </main>
  <script src="app.js"></script>
</body>
</html>
`;

const MINIMAL_WEBUI_APP_TEMPLATE = `async function getState() {
  const stateElement = document.getElementById('state');
  try {
    const response = await fetch('/api/state');
    const text = await response.text();
    stateElement.textContent = text || '{}';
  } catch (error) {
    stateElement.textContent = String(error);
  }
}

async function sendAction() {
  const name = document.getElementById('actionName').value || 'ping';
  const resultElement = document.getElementById('result');
  try {
    const response = await fetch('/api/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: name, timestamp: new Date().toISOString() })
    });
    resultElement.textContent = await response.text();
    await getState();
  } catch (error) {
    resultElement.textContent = String(error);
  }
}

document.getElementById('refresh').addEventListener('click', getState);
document.getElementById('sendAction').addEventListener('click', sendAction);
getState();
`;

const MINIMAL_WEBUI_STYLE_TEMPLATE = `:root {
  font-family: system-ui, Segoe UI, sans-serif;
  color: #222;
  background: #f4f4f4;
}

.page {
  max-width: 900px;
  margin: 32px auto;
  padding: 0 16px;
}

.card {
  background: white;
  border: 1px solid #ddd;
  border-radius: 8px;
  padding: 16px;
  margin: 16px 0;
}

pre {
  background: #111;
  color: #f4f4f4;
  padding: 12px;
  overflow: auto;
}

button, input {
  font: inherit;
  padding: 8px 10px;
  margin-right: 8px;
}
`;

const MINIMAL_WEBUI_README_TEMPLATE = `# Minimal CPM Web UI frontend

Generic static frontend compatible with the CPM C or C++ Web UI backend.

Expected backend routes:

- 'GET /api/state'
- 'POST /api/action'

No project-specific GPIO, camera, LiDAR or Raspberry Pi assets are included in this starter.
`;

function getBuiltInMyUtilModules(): BundledModuleChoice[] {
  return [
    {
      label: 'Core utilities',
      group: 'C bundles',
      description: 'Create cpm_util.c, cpm_util.h and cpm_util.ini.',
      detail: 'Small C helpers for strings, trimming, timestamps and simple INI key reading.',
      defaultFolder: 'Bundle/C/CPM_Util',
      generator: 'c-core',
      entries: [],
      requiredWindowsLibraries: []
    },
    {
      label: 'Error management',
      group: 'C bundles',
      description: 'Create cpm_error.c, cpm_error.h and cpm_error.ini.',
      detail: 'INI-controlled logging and ERROR_LABEL macros for C projects.',
      defaultFolder: 'Bundle/C/CPM_Error',
      generator: 'c-error',
      entries: []
    },
    {
      label: 'Python execution bridge',
      group: 'C bundles',
      description: 'Create cpm_python_exec.c and cpm_python_exec.h.',
      detail: 'Pure C bridge for launching Python scripts and exchanging lines or JSON through pipes.',
      defaultFolder: 'Bundle/C/PythonExec',
      generator: 'c-python-bridge',
      entries: []
    },
    {
      label: 'Web UI backend bridge',
      group: 'C bundles',
      description: 'Create cpm_webui.c and cpm_webui.h.',
      detail: 'Pure C HTTP backend for serving a frontend folder and exchanging state/action JSON with the application.',
      defaultFolder: 'Bundle/C/WebUI',
      generator: 'c-webui-server',
      entries: [],
      requiredWindowsLibraries: ['ws2_32']
    },
    {
      label: 'UART communication',
      group: 'C bundles',
      description: 'Create cpm_uart.c and cpm_uart.h.',
      detail: 'Pure C serial-port wrapper with open/read/write/read-line helpers for Windows and POSIX.',
      defaultFolder: 'Bundle/C/Communication/UART',
      entries: ['CBundle/Communication/UART/cpm_uart.c=>cpm_uart.c', 'CBundle/Communication/UART/cpm_uart.h=>cpm_uart.h', 'CBundle/Communication/UART/README.md=>README.md']
    },
    {
      label: 'IPC communication',
      group: 'C bundles',
      description: 'Create cpm_ipc.c and cpm_ipc.h.',
      detail: 'Pure C named-pipe/FIFO wrapper for simple local process communication.',
      defaultFolder: 'Bundle/C/Communication/IPC',
      entries: ['CBundle/Communication/IPC/cpm_ipc.c=>cpm_ipc.c', 'CBundle/Communication/IPC/cpm_ipc.h=>cpm_ipc.h', 'CBundle/Communication/IPC/README.md=>README.md']
    },
    {
      label: 'Ethernet TCP-UDP communication',
      group: 'C bundles',
      description: 'Create cpm_socket.c and cpm_socket.h.',
      detail: 'Pure C TCP client/server and UDP socket wrapper. On Windows, CPM automatically adds ws2_32 to linker libraries.',
      defaultFolder: 'Bundle/C/Communication/Ethernet',
      entries: ['CBundle/Communication/Ethernet/cpm_socket.c=>cpm_socket.c', 'CBundle/Communication/Ethernet/cpm_socket.h=>cpm_socket.h', 'CBundle/Communication/Ethernet/README.md=>README.md'],
      requiredWindowsLibraries: ['ws2_32']
    },
    {
      label: 'Wi-Fi communication',
      group: 'C bundles',
      description: 'Create cpm_wifi.c and cpm_wifi.h.',
      detail: 'Pure C TCP/UDP wrapper for Wi-Fi-connected systems. It handles application IP traffic, not SSID association.',
      defaultFolder: 'Bundle/C/Communication/WiFi',
      entries: ['CBundle/Communication/WiFi/cpm_wifi.c=>cpm_wifi.c', 'CBundle/Communication/WiFi/cpm_wifi.h=>cpm_wifi.h', 'CBundle/Communication/WiFi/README.md=>README.md'],
      requiredWindowsLibraries: ['ws2_32']
    },
    {
      label: 'Bluetooth RFCOMM communication',
      group: 'C bundles',
      description: 'Create cpm_bluetooth.c and cpm_bluetooth.h.',
      detail: 'Pure C Bluetooth Classic RFCOMM client wrapper. Windows implementation included; other platforms return unsupported by default.',
      defaultFolder: 'Bundle/C/Communication/Bluetooth',
      entries: ['CBundle/Communication/Bluetooth/cpm_bluetooth.c=>cpm_bluetooth.c', 'CBundle/Communication/Bluetooth/cpm_bluetooth.h=>cpm_bluetooth.h', 'CBundle/Communication/Bluetooth/README.md=>README.md'],
      requiredWindowsLibraries: ['ws2_32']
    },
    {
      label: 'CAN communication',
      group: 'C bundles',
      description: 'Create cpm_can.c and cpm_can.h.',
      detail: 'Pure C CAN/SocketCAN helper with classical CAN, CAN FD, filters, timeout and diagnostic formatting.',
      defaultFolder: 'Bundle/C/Communication/CAN',
      entries: ['CBundle/Communication/CAN/cpm_can.c=>cpm_can.c', 'CBundle/Communication/CAN/cpm_can.h=>cpm_can.h', 'CBundle/Communication/CAN/README.md=>README.md']
    },
    {
      label: 'I2C communication',
      group: 'C bundles',
      description: 'Create cpm_i2c.c and cpm_i2c.h.',
      detail: 'Pure C Linux /dev/i2c wrapper with register read/write helpers. Other platforms return a clear unsupported status.',
      defaultFolder: 'Bundle/C/Communication/I2C',
      entries: ['CBundle/Communication/I2C/cpm_i2c.c=>cpm_i2c.c', 'CBundle/Communication/I2C/cpm_i2c.h=>cpm_i2c.h', 'CBundle/Communication/I2C/README.md=>README.md']
    },
    {
      label: 'SPI communication',
      group: 'C bundles',
      description: 'Create cpm_spi.c and cpm_spi.h.',
      detail: 'Pure C Linux spidev wrapper with mode/speed/bits configuration and full-duplex transfer helpers. Other platforms return unsupported.',
      defaultFolder: 'Bundle/C/Communication/SPI',
      entries: ['CBundle/Communication/SPI/cpm_spi.c=>cpm_spi.c', 'CBundle/Communication/SPI/cpm_spi.h=>cpm_spi.h', 'CBundle/Communication/SPI/README.md=>README.md']
    },
    {
      label: 'Full communication stack',
      group: 'C bundles',
      description: 'Create C UART, IPC, Ethernet, Wi-Fi, Bluetooth, CAN, I2C and SPI modules.',
      detail: 'Pure C communication stack converted from the common MY_Util C++ communication bundles. CAN targets Linux SocketCAN by default; I2C/SPI target Linux device files; Bluetooth RFCOMM is Windows-first.',
      defaultFolder: 'Bundle/C/Communication',
      entries: ['CBundle/Communication/README.md=>README.md', 'CBundle/Communication/UART=>UART', 'CBundle/Communication/IPC=>IPC', 'CBundle/Communication/Ethernet=>Ethernet', 'CBundle/Communication/WiFi=>WiFi', 'CBundle/Communication/Bluetooth=>Bluetooth', 'CBundle/Communication/CAN=>CAN', 'CBundle/Communication/I2C=>I2C', 'CBundle/Communication/SPI=>SPI'],
      requiredWindowsLibraries: ['ws2_32']
    },
    {
      label: 'Core utilities',
      group: 'C++ bundles',
      description: 'Create cpm_util.cpp, cpm_util.hpp and cpm_util.ini.',
      detail: 'C++ equivalent of the generated C utility bundle with std::string helpers.',
      defaultFolder: 'Bundle/C++/CPM_Util',
      generator: 'cpp-core',
      entries: []
    },
    {
      label: 'Error management',
      group: 'C++ bundles',
      description: 'Create cpm_error.cpp, cpm_error.hpp and cpm_error.ini.',
      detail: 'C++ equivalent of the generated C error bundle with namespace-scoped helpers and macros.',
      defaultFolder: 'Bundle/C++/CPM_Error',
      generator: 'cpp-error',
      entries: []
    },
    {
      label: 'MY_Util core utilities',
      group: 'C++ bundles',
      description: 'Copy myUtil.cpp, myUtil.h and utility.ini.',
      detail: 'INI reader, string helpers, timestamp and error-log helper functions from MY_Util.',
      defaultFolder: 'Bundle/C++/MY_Util',
      entries: ['myUtil.cpp', 'myUtil.h', 'utility.ini']
    },
    {
      label: 'MY_Util error management',
      group: 'C++ bundles',
      description: 'Copy errorManagement.cpp/.h plus required core utility files.',
      detail: 'check_negerror, check_zeroerror, set_error macros and a runtime utility.ini configuration file.',
      defaultFolder: 'Bundle/C++/MY_Util',
      entries: ['myUtil.cpp', 'myUtil.h', 'utility.ini', 'ErrorManagement/errorManagement.cpp', 'ErrorManagement/errorManagement.h']
    },
    {
      label: 'UART communication',
      group: 'C++ bundles',
      description: 'Copy the cross-platform UART class.',
      detail: 'Serial port wrapper with text, byte and packet helpers.',
      defaultFolder: 'Bundle/C++/MY_Util',
      entries: ['Communication/uart/uart.cpp', 'Communication/uart/uart.h']
    },
    {
      label: 'IPC communication',
      group: 'C++ bundles',
      description: 'Copy the IPC pipe class.',
      detail: 'Named-pipe, local-socket and anonymous-pipe helpers.',
      defaultFolder: 'Bundle/C++/MY_Util',
      entries: ['Communication/IPC/IPC.cpp', 'Communication/IPC/IPC.h']
    },
    {
      label: 'Ethernet TCP-UDP communication',
      group: 'C++ bundles',
      description: 'Copy the TCP/UDP EthernetLink class.',
      detail: 'Client/server TCP and UDP helpers with packet framing.',
      defaultFolder: 'Bundle/C++/MY_Util',
      entries: ['Communication/ethernet/ethernet.cpp', 'Communication/ethernet/ethernet.h'],
      requiredWindowsLibraries: ['ws2_32']
    },
    {
      label: 'Wi-Fi communication',
      group: 'C++ bundles',
      description: 'Copy the C++ Wi-Fi TCP/UDP link class.',
      detail: 'Application-layer Wi-Fi communication using regular TCP/UDP sockets once the OS network is connected.',
      defaultFolder: 'Bundle/C++/MY_Util',
      entries: ['Communication/wifi/wifi.cpp', 'Communication/wifi/wifi.h'],
      requiredWindowsLibraries: ['ws2_32']
    },
    {
      label: 'Bluetooth communication',
      group: 'C++ bundles',
      description: 'Copy the C++ Bluetooth communication class.',
      detail: 'Bluetooth helper from the original MY_Util communication set, kept separate from the full stack.',
      defaultFolder: 'Bundle/C++/MY_Util',
      entries: ['Communication/bluetooth/bluetooth.cpp', 'Communication/bluetooth/bluetooth.h'],
      requiredWindowsLibraries: ['ws2_32']
    },
    {
      label: 'CAN communication',
      group: 'C++ bundles',
      description: 'Copy the C++ SocketCAN communication class.',
      detail: 'C++ CAN helper with classical CAN, CAN FD, filters, timeout and diagnostic formatting. Linux SocketCAN backend by default.',
      defaultFolder: 'Bundle/C++/MY_Util',
      entries: ['Communication/can/can.cpp', 'Communication/can/can.h']
    },
    {
      label: 'I2C communication',
      group: 'C++ bundles',
      description: 'Copy the C++ I2C class.',
      detail: 'Linux I2C helper from the original MY_Util communication set.',
      defaultFolder: 'Bundle/C++/MY_Util',
      entries: ['Communication/I2C/I2C.cpp', 'Communication/I2C/I2C.h']
    },
    {
      label: 'SPI communication',
      group: 'C++ bundles',
      description: 'Copy the C++ SPI class.',
      detail: 'Linux SPI helper from the original MY_Util communication set.',
      defaultFolder: 'Bundle/C++/MY_Util',
      entries: ['Communication/SPI/SPI.cpp', 'Communication/SPI/SPI.h']
    },
    {
      label: 'Full communication stack',
      group: 'C++ bundles',
      description: 'Copy Communication/* modules.',
      detail: 'UART, Bluetooth, Wi-Fi, Ethernet, CAN, I2C, SPI, IPC, CommsManager and listen service.',
      defaultFolder: 'Bundle/C++/MY_Util',
      entries: ['Communication'],
      requiredWindowsLibraries: ['ws2_32']
    },
    {
      label: 'Python execution bridge',
      group: 'C++ bundles',
      description: 'Copy only the Python execution bridge.',
      detail: 'C++ bridge files only: launch a Python process and exchange lines/JSON through pipes.',
      defaultFolder: 'Bundle/C++/MY_Util',
      entries: ['external/pythonExec']
    },
    {
      label: 'Web UI backend server',
      group: 'C++ bundles',
      description: 'Copy only webui.cpp and webui.h.',
      detail: 'C++ HTTP/Web UI backend source only. Static HTML/JS/CSS assets are available from Scripts > Minimal Web UI frontend or Scripts > Embedded demo Web UI frontend.',
      defaultFolder: 'Bundle/C++/WebUI',
      entries: ['webui/webui.cpp=>webui.cpp', 'webui/webui.h=>webui.h'],
      requiredWindowsLibraries: ['ws2_32']
    },
    {
      label: 'Complete bundle',
      group: 'C++ bundles',
      description: 'Copy the curated MY_Util C++ modules.',
      detail: 'Core utilities, error management, communication stack, Python bridge and Web UI backend. Demo/static frontend files and OpenCV realtime demo are not included.',
      defaultFolder: 'Bundle/C++/MY_Util',
      entries: ['myUtil.cpp', 'myUtil.h', 'utility.ini', 'ErrorManagement', 'Communication', 'external/pythonExec', 'webui/webui.cpp=>webui/webui.cpp', 'webui/webui.h=>webui/webui.h'],
      requiredWindowsLibraries: ['ws2_32']
    },
    {
      label: 'Python worker protocol starter',
      group: 'Script bundles',
      description: 'Create a generic Python worker protocol starter.',
      detail: 'Minimal Python files for stdin/stdout JSON-style exchange with the CPM Python execution bridge.',
      defaultFolder: 'Bundle/Scripts/PythonWorker',
      generator: 'script-python-worker',
      entries: []
    },
    {
      label: 'Robot demo Python scripts',
      group: 'Script bundles',
      description: 'Copy the original project-specific Python demo scripts.',
      detail: 'Robot/Raspberry Pi/ESP32/LiDAR/camera scripts kept separate from the generic worker protocol starter.',
      defaultFolder: 'Bundle/Scripts/RobotDemoPython',
      entries: ['external/pythonScript']
    },
    {
      label: 'Minimal Web UI frontend',
      group: 'Script bundles',
      description: 'Create a generic HTML/JS/CSS frontend.',
      detail: 'Minimal frontend for /api/state and /api/action, compatible with the C or C++ Web UI backend.',
      defaultFolder: 'Bundle/Scripts/WebUI/MinimalFrontend',
      generator: 'script-minimal-webui',
      entries: []
    },
    {
      label: 'Embedded demo Web UI frontend',
      group: 'Script bundles',
      description: 'Copy the original embedded demo HTML, JavaScript, CSS and image assets.',
      detail: 'Raspberry Pi/GPIO/camera/bus/captor oriented frontend kept separate from the generic starter.',
      defaultFolder: 'Bundle/Scripts/WebUI/EmbeddedDemoFrontend',
      entries: ['webui/example/frontEnd=>frontEnd']
    }
  ];
}

function buildBlankUirHeader(): string {
  return `/**************************************************************************/
/* C/C++ User Interface Resource (UIR) Include File              */
/*                                                                        */
/* WARNING: Do not add to, delete from, or otherwise modify the contents  */
/*          of this include file.                                         */
/**************************************************************************/

#include <userint.h>

#ifdef __cplusplus
    extern "C" {
#endif

     /* Panels and Controls: */

#define  PANEL                            1


     /* Control Arrays: */

          /* (no control arrays in the resource file) */


     /* Menu Bars, Menus, and Menu Items: */

          /* (no menu bars in the resource file) */


     /* (no callbacks specified in the resource file) */


#ifdef __cplusplus
    }
#endif
`;
}

export function getBuiltInSnippets(): BuiltInSnippet[] {
  return [
    {
      id: 'cpp-main',
      label: 'C++ main entry point',
      description: 'Minimal console application entry point using std::cout.',
      body: CPP_MAIN_TEMPLATE
    },
    {
      id: 'c-main',
      label: 'C main entry point',
      description: 'Minimal C console application entry point using printf().',
      body: MAIN_TEMPLATE
    },
    {
      id: 'c-main-with-cpm-error',
      label: 'C main with CPM error handling',
      description: 'main() skeleton with CPM error initialization, error label and cleanup path.',
      body: MAIN_WITH_ERROR_SOURCE_TEMPLATE
        .replace('{{fileHeader}}', '')
        .replace('{{mainHeaderInclude}}', '#include "${1:main.h}"\n')
        .replace(/\{\{[^}]+\}\}/g, '')
    },
    {
      id: 'doc-file-header',
      label: 'Documentation / file description header',
      description: 'Program/file header with company block and changes table.',
      body: renderFileDescriptionHeader({
        company: '${1:Company}',
        address1: '${2:Address 1}',
        address2: '${3:Address 2}',
        tel: '${4:Tel}',
        fax: '${5:Fax}',
        email: '${6:E-mail}',
        date: formatDateDdMmYy(),
        author: '${7:S.NAME}',
        version: '${8:1.0.0}',
        description: '${9:Creation}'
      })
    },
    {
      id: 'doc-change-line',
      label: 'Documentation / header change line',
      description: 'One formatted CHANGES/EVOLUTIONS table entry.',
      body: renderHeaderChangeLine('${1:' + formatDateDdMmYy() + '}', '${2:S.NAME}', '${3:1.0.0}', '${4:Description}') + '\n'
    },
    {
      id: 'doc-comment-section',
      label: 'Documentation / comment section',
      description: 'Boxed section comment for Parameters, Constants, Types, etc.',
      body: renderCommentSection('${1:Parameters}', 'box')
    },
    {
      id: 'winmain',
      label: 'WinMain entry point',
      description: 'Minimal Windows GUI application entry point.',
      body: WINMAIN_TEMPLATE
    },
    {
      id: 'dllmain',
      label: 'DllMain lifecycle',
      description: 'Minimal Windows DLL entry point.',
      body: DLL_SOURCE_TEMPLATE.replace('#include "{{headerFile}}"\n', '')
    },
    {
      id: 'header-guard',
      label: 'Header guard',
      description: 'Portable include guard skeleton.',
      body: '#ifndef ${1:MODULE_H}\n#define ${1:MODULE_H}\n\n${0}\n\n#endif /* ${1:MODULE_H} */\n'
    },
    {
      id: 'extern-c-block',
      label: 'extern "C" block',
      description: 'C ABI block usable from C++ headers.',
      body: '#ifdef __cplusplus\nextern "C" {\n#endif\n\n${0}\n\n#ifdef __cplusplus\n}\n#endif\n'
    },
    {
      id: 'error-goto-cleanup',
      label: 'Error handling / goto cleanup',
      description: 'C-style error path with one cleanup label.',
      body: 'int status = 0;\n\n${1:resource} = ${2:OpenResource()};\nif (${1:resource} == ${3:NULL})\n{\n    status = -1;\n    goto Cleanup;\n}\n\n${0}\n\nCleanup:\n    if (${1:resource} != ${3:NULL})\n    {\n        ${4:CloseResource}(${1:resource});\n    }\n    return status;\n'
    },
    {
      id: 'error-check-macro',
      label: 'Error handling / check macro',
      description: 'Reusable macro that jumps to cleanup when an expression fails.',
      body: '#define CHECK_STATUS(expr) \\\n    do { \\\n        status = (expr); \\\n        if (status < 0) { \\\n            goto Cleanup; \\\n        } \\\n    } while (0)\n\n${0}\n'
    },
    {
      id: 'error-ini-load',
      label: 'Error logging / load INI config',
      description: 'Initialize the CPM error module and load runtime logging options.',
      body: '#include "cpm_error.h"\n\nCpmError_InitDefaults();\nif (CpmError_LoadConfig("${1:error.ini}") < 0)\n{\n    CpmError_Log("Warning: error configuration file not found: %s\\n", "${1:error.ini}");\n}\n\n${0}\n'
    },
    {
      id: 'file-read-loop',
      label: 'File I/O / read lines',
      description: 'Open a text file and read it line by line.',
      body: '#include <stdio.h>\n\nFILE *file = fopen("${1:input.txt}", "r");\nif (file == NULL)\n{\n    return -1;\n}\n\nchar line[${2:512}];\nwhile (fgets(line, sizeof(line), file) != NULL)\n{\n    ${0:// process line}\n}\n\nfclose(file);\n'
    },
    {
      id: 'win32-serial-open',
      label: 'Communication / Win32 serial open',
      description: 'Open and configure a COM port with the Windows API.',
      body: '#ifdef _WIN32\n#include <windows.h>\n\nHANDLE serial = CreateFileA("\\\\.\\${1:COM3}", GENERIC_READ | GENERIC_WRITE, 0, NULL, OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, NULL);\nif (serial == INVALID_HANDLE_VALUE)\n{\n    return -1;\n}\n\nDCB dcb;\nSecureZeroMemory(&dcb, sizeof(dcb));\ndcb.DCBlength = sizeof(dcb);\nGetCommState(serial, &dcb);\ndcb.BaudRate = CBR_${2:115200};\ndcb.ByteSize = 8;\ndcb.Parity = NOPARITY;\ndcb.StopBits = ONESTOPBIT;\nSetCommState(serial, &dcb);\n${0}\nCloseHandle(serial);\n#endif\n'
    },
    {
      id: 'tcp-client-socket',
      label: 'Communication / TCP client socket',
      description: 'Minimal cross-platform TCP client skeleton.',
      body: '#if defined(_WIN32)\n#include <winsock2.h>\n#include <ws2tcpip.h>\n#pragma comment(lib, "ws2_32.lib")\n#else\n#include <arpa/inet.h>\n#include <sys/socket.h>\n#include <unistd.h>\n#define closesocket close\n#endif\n\n${0:// create socket, connect, send and receive}\n'
    },
    {
      id: 'state-machine-switch',
      label: 'Architecture / finite state machine',
      description: 'Simple switch-based state machine skeleton.',
      body: 'typedef enum\n{\n    STATE_INIT,\n    STATE_IDLE,\n    STATE_RUN,\n    STATE_ERROR\n} ${1:AppState};\n\nvoid ${2:RunStateMachine}(${1:AppState} *state)\n{\n    switch (*state)\n    {\n        case STATE_INIT:\n            *state = STATE_IDLE;\n            break;\n        case STATE_IDLE:\n            break;\n        case STATE_RUN:\n            break;\n        case STATE_ERROR:\n            break;\n        default:\n            *state = STATE_ERROR;\n            break;\n    }\n}\n'
    }
  ];
}

export class CpmTemplateService {
  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly installations: CpmInstallationService,
    private readonly output: vscode.OutputChannel
  ) {}

  async generateNewFiles(projectDirectory: string): Promise<NewFileGenerationResult | undefined> {
    const userTemplates = this.loadFileTemplates();
    const selectedValue = await this.pickNewFileWorkflow(userTemplates.length > 0);
    if (!selectedValue) {
      return undefined;
    }

    switch (selectedValue) {
      case 'c-source': return this.generateCSource(projectDirectory);
      case 'c-main-error': return this.generateCMainWithErrorHandling(projectDirectory);
      case 'cpp-source': return this.generateCppSource(projectDirectory);
      case 'c-header': return this.generateHeader(projectDirectory);
      case 'c-module': return this.generateModulePair(projectDirectory);
      case 'cpp-class': return this.generateCppClass(projectDirectory);
      case 'dll': return this.generateDll(projectDirectory);
      case 'error-module': return this.generateErrorModule(projectDirectory);
      case 'error-ini': return this.generateSingleTextFile(projectDirectory, '.ini', 'error', ERROR_INI_TEMPLATE, 'Error logging configuration');
      case 'my-util-module': return this.generateBundledMyUtilModule(projectDirectory);
      case 'python-source': return this.generateSingleTextFile(projectDirectory, '.py', 'script', `#!/usr/bin/env python3\n\n\ndef main():\n    pass\n\n\nif __name__ == "__main__":\n    main()\n`, 'Python script file');
      case 'text': return this.generateSingleTextFile(projectDirectory, '.txt', 'new_file', '', 'Text file');
      case 'user-template': return this.generateUserTemplate(projectDirectory, userTemplates);
      default: return undefined;
    }
  }

  private async pickNewFileWorkflow(hasUserTemplates: boolean): Promise<string | undefined> {
    const groups: Array<vscode.QuickPickItem & { value: string }> = [
      { label: 'C', description: 'C sources, headers, DLL starter and C error/logging modules', value: 'group-c' },
      { label: 'C++', description: 'C++ sources, classes and reusable C++ starters', value: 'group-cpp' },
      { label: 'Module bundles', description: 'Generated C/C++ bundles and bundled utility modules', value: 'group-bundles' },
      { label: 'Scripts and text', description: 'Python scripts and plain text files', value: 'group-scripts' }
    ];

    if (hasUserTemplates) {
      groups.push({ label: 'Saved templates', description: 'Create a file from one of your saved creation templates', value: 'group-user-templates' });
    }

    const group = await vscode.window.showQuickPick(groups, {
      title: 'Create a new file or starter module',
      placeHolder: 'Select a CPM creation category'
    });
    if (!group) {
      return undefined;
    }

    if (group.value === 'group-bundles') {
      return 'my-util-module';
    }
    if (group.value === 'group-user-templates') {
      return 'user-template';
    }

    const choicesByGroup: Record<string, Array<vscode.QuickPickItem & { value: string }>> = {
      'group-c': [
        { label: 'Source file', description: 'Create an empty C source or a generic main() template', value: 'c-source' },
        { label: 'Main with CPM error handling', description: 'Create main.c with file header, sections and CPM error path', value: 'c-main-error' },
        { label: 'Module (.c + .h)', description: 'Create a paired C implementation file and guarded header', value: 'c-module' },
        { label: 'Header file', description: 'Create a guarded header usable from C or C++', value: 'c-header' },
        { label: 'Windows DLL starter (.c + .h)', description: 'Create a minimal DllMain and export header', value: 'dll' },
        { label: 'Error/logging module (.c + .h + .ini)', description: 'Create configurable C error handling with INI-controlled logging', value: 'error-module' },
        { label: 'Error/logging configuration (.ini)', description: 'Create only the runtime error logging configuration file', value: 'error-ini' }
      ],
      'group-cpp': [
        { label: 'Source file', description: 'Create an empty C++ source or a generic C++ main() template', value: 'cpp-source' },
        { label: 'Class (.cpp + .hpp)', description: 'Create a minimal C++ class declaration and implementation', value: 'cpp-class' },
        { label: 'Header file', description: 'Create a guarded header usable from C or C++', value: 'c-header' }
      ],
      'group-scripts': [
        { label: 'Python script file', description: 'Create an empty .py script file', value: 'python-source' },
        { label: 'Text file', description: 'Create an empty .txt file', value: 'text' }
      ]
    };

    const selected = await vscode.window.showQuickPick(choicesByGroup[group.value] ?? [], {
      title: `Create > ${group.label}`,
      placeHolder: `Select what to create in ${group.label}`,
      matchOnDescription: true
    });
    return selected?.value;
  }

  async insertSnippet(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showErrorMessage('Open a source file before inserting a C/C++ snippet.');
      return;
    }

    const builtIns = getBuiltInSnippets();
    const userSnippets = this.loadSnippets();
    const items: Array<vscode.QuickPickItem & { body: string }> = [
      ...builtIns.map((snippet) => ({ label: snippet.label, description: snippet.description, detail: 'Built-in C/C++ snippet', body: snippet.body })),
      ...userSnippets.map((snippet) => ({ label: snippet.label, description: snippet.description || '', detail: 'Saved user snippet', body: snippet.body }))
    ];
    const selected = await vscode.window.showQuickPick(items, {
      title: 'CPM: Insert snippet',
      placeHolder: 'Select a reusable code fragment to insert at the current cursor position',
      matchOnDescription: true,
      matchOnDetail: true
    });
    if (!selected) {
      return;
    }
    await editor.insertSnippet(new vscode.SnippetString(selected.body));
  }

  async insertFileDescriptionHeader(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showErrorMessage('Open a C/C++ editor before inserting a file header.');
      return;
    }

    const title = 'CPM: Insert file description header';
    const defaultAuthor = sanitizeHeaderText(process.env.USERNAME || process.env.USER || 'S.NAME', 'S.NAME');
    const company = await promptInput(title, 'Company name shown in the header.', 'Company');
    if (company === undefined) return;
    const author = await promptInput(title, 'Author used in the first CHANGES/EVOLUTIONS row.', defaultAuthor);
    if (author === undefined) return;
    const version = await promptInput(title, 'Initial version.', '1.0.0');
    if (version === undefined) return;
    const description = await promptInput(title, 'Initial change description.', 'Creation');
    if (description === undefined) return;

    const header = renderFileDescriptionHeader({
      company: sanitizeHeaderText(company, 'Company'),
      address1: 'Address 1',
      address2: 'Address 2',
      tel: 'Tel',
      fax: 'Fax',
      email: 'E-mail',
      date: formatDateDdMmYy(),
      author: sanitizeHeaderText(author, defaultAuthor),
      version: sanitizeHeaderText(version, '1.0.0'),
      description: sanitizeHeaderText(description, 'Creation')
    });
    await this.insertTextAtSelections(editor, header);
  }

  async insertHeaderChangeEntry(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showErrorMessage('Open a C/C++ editor before inserting a header change entry.');
      return;
    }

    const title = 'CPM: Insert header change line';
    const defaultAuthor = sanitizeHeaderText(process.env.USERNAME || process.env.USER || 'S.NAME', 'S.NAME');
    const date = await promptInput(title, 'Date displayed in the CHANGES/EVOLUTIONS table.', formatDateDdMmYy());
    if (date === undefined) return;
    const author = await promptInput(title, 'Author initials or name.', defaultAuthor);
    if (author === undefined) return;
    const version = await promptInput(title, 'Version for this change.', '1.0.1');
    if (version === undefined) return;
    const description = await promptInput(title, 'Change description.', 'Description');
    if (description === undefined) return;

    await this.insertTextAtSelections(editor, `${renderHeaderChangeLine(date, author, version, description)}\n`);
  }

  async insertCommentSection(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showErrorMessage('Open a C/C++ editor before inserting a comment section.');
      return;
    }

    const title = await promptInput('CPM: Insert comment section', 'Section title, for example Parameters, Constants, Types, Static functions.', 'Parameters');
    if (title === undefined) return;
    const style = await vscode.window.showQuickPick([
      { label: 'Boxed C section', description: '/**************** Parameters **********************/', value: 'box' },
      { label: 'CPM line section', description: '//==============================================================================', value: 'line' },
      { label: 'Compact one-line section', description: '/* Parameters */', value: 'compact' }
    ], { title: 'Comment section style' });
    if (!style) return;

    await this.insertTextAtSelections(editor, renderCommentSection(title, style.value));
  }

  async saveSelectionAsSnippet(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showErrorMessage('Open a source file before saving a snippet.');
      return;
    }
    const selectedText = editor.document.getText(editor.selection);
    const body = selectedText || editor.document.getText();
    if (!body.trim()) {
      vscode.window.showErrorMessage('The current selection or document is empty.');
      return;
    }
    const label = await vscode.window.showInputBox({
      title: 'Save C/C++ snippet',
      prompt: 'Name displayed in the snippet picker',
      validateInput: validateRequiredName
    });
    if (!label) {
      return;
    }
    const description = await vscode.window.showInputBox({
      title: 'Save C/C++ snippet',
      prompt: 'Optional description',
      value: ''
    });
    if (description === undefined) {
      return;
    }
    const snippets = this.loadSnippets();
    snippets.push({ id: `${sanitizeId(label)}-${Date.now()}`, label, description, body });
    this.saveSnippets(snippets);
    vscode.window.showInformationMessage(`Saved C/C++ snippet: ${label}`);
  }

  async manageSnippets(): Promise<void> {
    const snippets = this.loadSnippets();
    const selected = await vscode.window.showQuickPick([
      { label: 'Save current selection as snippet...', value: 'save' },
      { label: 'Import snippet from text file...', value: 'import' },
      { label: 'Delete a saved snippet...', value: 'delete', description: `${snippets.length} saved snippet(s)` },
      { label: 'Open saved snippets JSON', value: 'open' }
    ], { title: 'Manage C/C++ snippets' });
    if (!selected) {
      return;
    }
    if (selected.value === 'save') {
      await this.saveSelectionAsSnippet();
      return;
    }
    if (selected.value === 'import') {
      const files = await vscode.window.showOpenDialog({ title: 'Import a snippet text file', canSelectFiles: true, canSelectFolders: false, canSelectMany: false });
      if (!files?.[0]) {
        return;
      }
      await this.saveTextAsSnippet(path.basename(files[0].fsPath, path.extname(files[0].fsPath)), fs.readFileSync(files[0].fsPath, 'utf8'));
      return;
    }
    if (selected.value === 'delete') {
      const item = await vscode.window.showQuickPick(snippets.map((snippet) => ({ label: snippet.label, description: snippet.description, snippet })), { title: 'Delete a saved C/C++ snippet' });
      if (!item) {
        return;
      }
      this.saveSnippets(snippets.filter((snippet) => snippet.id !== item.snippet.id));
      vscode.window.showInformationMessage(`Deleted C/C++ snippet: ${item.snippet.label}`);
      return;
    }
    await this.openJsonStore(this.getSnippetStorePath(), { version: 1, items: snippets });
  }

  async saveCurrentFileAsTemplate(filePath?: string): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    const resolvedPath = filePath || editor?.document.uri.fsPath;
    if (!resolvedPath || !fs.existsSync(resolvedPath)) {
      vscode.window.showErrorMessage('Open or select a text file before saving a creation template.');
      return;
    }
    const activeContents = editor && path.normalize(editor.document.uri.fsPath) === path.normalize(resolvedPath)
      ? editor.document.getText()
      : undefined;
    await this.saveTemplateFromPath(resolvedPath, activeContents);
  }

  async importFileTemplate(): Promise<void> {
    const files = await vscode.window.showOpenDialog({ title: 'Import a reusable file template', canSelectFiles: true, canSelectFolders: false, canSelectMany: false });
    if (!files?.[0]) {
      return;
    }
    await this.saveTemplateFromPath(files[0].fsPath);
  }

  async manageFileTemplates(): Promise<void> {
    const templates = this.loadFileTemplates();
    const selected = await vscode.window.showQuickPick([
      { label: 'Save current file as template...', value: 'save' },
      { label: 'Import template from file...', value: 'import' },
      { label: 'Delete a saved template...', value: 'delete', description: `${templates.length} saved template(s)` },
      { label: 'Open saved templates JSON', value: 'open' }
    ], { title: 'Manage C/C++ creation templates' });
    if (!selected) {
      return;
    }
    if (selected.value === 'save') {
      await this.saveCurrentFileAsTemplate();
      return;
    }
    if (selected.value === 'import') {
      await this.importFileTemplate();
      return;
    }
    if (selected.value === 'delete') {
      const item = await vscode.window.showQuickPick(templates.map((template) => ({ label: template.label, description: `${template.extension} · ${template.description || ''}`, template })), { title: 'Delete a saved creation template' });
      if (!item) {
        return;
      }
      this.saveFileTemplates(templates.filter((template) => template.id !== item.template.id));
      vscode.window.showInformationMessage(`Deleted creation template: ${item.template.label}`);
      return;
    }
    await this.openJsonStore(this.getFileTemplateStorePath(), { version: 1, items: templates });
  }

  private async insertTextAtSelections(editor: vscode.TextEditor, text: string): Promise<void> {
    const selections = editor.selections.length > 0 ? editor.selections : [editor.selection];
    await editor.edit((edit) => {
      for (const selection of selections) {
        if (selection.isEmpty) {
          edit.insert(selection.active, text);
        } else {
          edit.replace(selection, text);
        }
      }
    });
  }

  private async generateCSource(projectDirectory: string): Promise<NewFileGenerationResult | undefined> {
    const choice = await vscode.window.showQuickPick([
      { label: 'Empty C source', value: 'empty', description: 'Create a blank .c file' },
      { label: 'main()', value: 'main', description: 'Generic C console executable entry point' },
      { label: 'WinMain()', value: 'winmain', description: 'Windows GUI executable entry point' }
    ], { title: 'Select a C source template' });
    if (!choice) {
      return undefined;
    }
    const content = choice.value === 'main' ? MAIN_TEMPLATE : choice.value === 'winmain' ? WINMAIN_TEMPLATE : '';
    const suggested = choice.value === 'main' ? 'main' : choice.value === 'winmain' ? 'winmain' : 'new_file';
    return this.generateSingleTextFile(projectDirectory, '.c', suggested, content, 'C source file');
  }

  private async generateCMainWithErrorHandling(projectDirectory: string): Promise<NewFileGenerationResult | undefined> {
    const sourcePath = await this.askTargetPath(projectDirectory, '.c', 'main', 'C main with CPM error handling');
    if (!sourcePath) {
      return undefined;
    }

    const pairedHeader = await vscode.window.showQuickPick([
      { label: 'Create main.h', description: 'Create and include a paired guarded header.', value: true },
      { label: 'Do not create main.h', description: 'Generate only the source file.', value: false }
    ], { title: 'Main header option' });
    if (!pairedHeader) {
      return undefined;
    }

    const errorModule = await vscode.window.showQuickPick([
      { label: 'Create CPM error module if missing', description: 'Add cpm_error.c, cpm_error.h and cpm_error.ini when they are not already present.', value: true },
      { label: 'Only reference existing cpm_error.h', description: 'Do not create the CPM error module files.', value: false }
    ], { title: 'Error module option' });
    if (!errorModule) {
      return undefined;
    }

    const base = sourcePath.slice(0, -path.extname(sourcePath).length);
    const headerPath = `${base}.h`;
    const variables = this.createVariables(sourcePath, headerPath, undefined);
    const defaultAuthor = sanitizeHeaderText(process.env.USERNAME || process.env.USER || 'S.NAME', 'S.NAME');
    const fileHeader = renderFileDescriptionHeader({
      company: 'Company',
      address1: 'Address 1',
      address2: 'Address 2',
      tel: 'Tel',
      fax: 'Fax',
      email: 'E-mail',
      date: formatDateDdMmYy(),
      author: defaultAuthor,
      version: '1.0.0',
      description: 'Creation'
    });

    const source = MAIN_WITH_ERROR_SOURCE_TEMPLATE
      .replace('{{fileHeader}}', fileHeader)
      .replace('{{mainHeaderInclude}}', pairedHeader.value ? `#include "${path.basename(headerPath)}"\n` : '')
      .replace(/\{\{[^}]+\}\}/g, '');

    const files: PendingFile[] = [
      { absolutePath: sourcePath, contents: toCrlf(renderTemplateText(source, variables)) }
    ];
    if (pairedHeader.value) {
      files.push({ absolutePath: headerPath, contents: toCrlf(renderTemplateText(MAIN_WITH_ERROR_HEADER_TEMPLATE, variables)) });
    }
    if (errorModule.value) {
      const errorSourcePath = path.join(projectDirectory, 'cpm_error.c');
      const errorHeaderPath = path.join(projectDirectory, 'cpm_error.h');
      const errorIniPath = path.join(projectDirectory, 'cpm_error.ini');
      const errorVariables = this.createVariables(errorSourcePath, errorHeaderPath, undefined);
      files.push(
        { absolutePath: errorSourcePath, contents: toCrlf(renderTemplateText(ERROR_SOURCE_TEMPLATE, errorVariables)) },
        { absolutePath: errorHeaderPath, contents: toCrlf(renderTemplateText(ERROR_HEADER_TEMPLATE, errorVariables)) },
        { absolutePath: errorIniPath, contents: toCrlf(renderTemplateText(ERROR_INI_TEMPLATE, errorVariables)) }
      );
    }

    return this.writeFiles(files, sourcePath);
  }

  private async generateCppSource(projectDirectory: string): Promise<NewFileGenerationResult | undefined> {
    const choice = await vscode.window.showQuickPick([
      { label: 'Empty C++ source', value: 'empty', description: 'Create a blank .cpp file' },
      { label: 'main()', value: 'main', description: 'Generic C++ console executable entry point' }
    ], { title: 'Select a C++ source template' });
    if (!choice) {
      return undefined;
    }
    const content = choice.value === 'main' ? CPP_MAIN_TEMPLATE : '';
    const suggested = choice.value === 'main' ? 'main' : 'new_file';
    return this.generateSingleTextFile(projectDirectory, '.cpp', suggested, content, 'C++ source file');
  }


  private async generateHeader(projectDirectory: string): Promise<NewFileGenerationResult | undefined> {
    const target = await this.askTargetPath(projectDirectory, '.h', 'new_header', 'C header file');
    if (!target) {
      return undefined;
    }
    const variables = this.createVariables(target, target, undefined);
    return this.writeFiles([{ absolutePath: target, contents: toCrlf(renderTemplateText(GUARDED_HEADER_TEMPLATE, variables)) }], target);
  }

  private async generateModulePair(projectDirectory: string): Promise<NewFileGenerationResult | undefined> {
    const sourcePath = await this.askTargetPath(projectDirectory, '.c', 'new_module', 'C module implementation');
    if (!sourcePath) {
      return undefined;
    }
    const base = sourcePath.slice(0, -path.extname(sourcePath).length);
    const headerPath = `${base}.h`;
    const variables = this.createVariables(sourcePath, headerPath, undefined);
    return this.writeFiles([
      { absolutePath: sourcePath, contents: toCrlf(renderTemplateText(MODULE_SOURCE_TEMPLATE, variables)) },
      { absolutePath: headerPath, contents: toCrlf(renderTemplateText(GUARDED_HEADER_TEMPLATE, variables)) }
    ], sourcePath);
  }

  private async generateCppClass(projectDirectory: string): Promise<NewFileGenerationResult | undefined> {
    const sourcePath = await this.askTargetPath(projectDirectory, '.cpp', 'NewClass', 'C++ class implementation');
    if (!sourcePath) {
      return undefined;
    }
    const base = sourcePath.slice(0, -path.extname(sourcePath).length);
    const headerPath = `${base}.hpp`;
    const variables = this.createVariables(sourcePath, headerPath, undefined);
    return this.writeFiles([
      { absolutePath: sourcePath, contents: toCrlf(renderTemplateText(CPP_CLASS_SOURCE_TEMPLATE, variables)) },
      { absolutePath: headerPath, contents: toCrlf(renderTemplateText(CPP_CLASS_HEADER_TEMPLATE, variables)) }
    ], sourcePath);
  }

  private async generateUir(projectDirectory: string, includeApplicationSource: boolean): Promise<NewFileGenerationResult | undefined> {
    const uirPath = await this.askTargetPath(projectDirectory, '.uir', includeApplicationSource ? 'interface' : 'new_panel', 'C/C++ user-interface resource');
    if (!uirPath) {
      return undefined;
    }
    const base = uirPath.slice(0, -path.extname(uirPath).length);
    const headerPath = `${base}.h`;
    const sourcePath = `${base}.c`;
    const variables = this.createVariables(sourcePath, headerPath, uirPath);
    const binary = this.readBundledUirTemplate();
    const files: PendingFile[] = [
      { absolutePath: uirPath, contents: binary, binary: true },
      { absolutePath: headerPath, contents: toCrlf(buildBlankUirHeader()) }
    ];
    if (includeApplicationSource) {
      files.unshift({ absolutePath: sourcePath, contents: toCrlf(renderTemplateText(UI_APP_SOURCE_TEMPLATE, variables)) });
    }
    return this.writeFiles(files, includeApplicationSource ? sourcePath : headerPath, uirPath);
  }

  private async generateDll(projectDirectory: string): Promise<NewFileGenerationResult | undefined> {
    const sourcePath = await this.askTargetPath(projectDirectory, '.c', 'my_dll', 'Windows DLL source file');
    if (!sourcePath) {
      return undefined;
    }
    const base = sourcePath.slice(0, -path.extname(sourcePath).length);
    const headerPath = `${base}.h`;
    const variables = this.createVariables(sourcePath, headerPath, undefined);
    return this.writeFiles([
      { absolutePath: sourcePath, contents: toCrlf(renderTemplateText(DLL_SOURCE_TEMPLATE, variables)) },
      { absolutePath: headerPath, contents: toCrlf(renderTemplateText(DLL_HEADER_TEMPLATE, variables)) }
    ], sourcePath);
  }

  private async generateErrorModule(projectDirectory: string): Promise<NewFileGenerationResult | undefined> {
    const sourcePath = await this.askTargetPath(projectDirectory, '.c', 'cpm_error', 'C/C++ error-management source file');
    if (!sourcePath) {
      return undefined;
    }
    const base = sourcePath.slice(0, -path.extname(sourcePath).length);
    const headerPath = `${base}.h`;
    const variables = this.createVariables(sourcePath, headerPath, undefined);
    const iniPath = `${base}.ini`;
    return this.writeFiles([
      { absolutePath: sourcePath, contents: toCrlf(renderTemplateText(ERROR_SOURCE_TEMPLATE, variables)) },
      { absolutePath: headerPath, contents: toCrlf(renderTemplateText(ERROR_HEADER_TEMPLATE, variables)) },
      { absolutePath: iniPath, contents: toCrlf(renderTemplateText(ERROR_INI_TEMPLATE, variables)) }
    ], sourcePath);
  }


  private async generateBundledMyUtilModule(projectDirectory: string): Promise<NewFileGenerationResult | undefined> {
    const modules = getBuiltInMyUtilModules();
    const categories = [
      { label: 'C', description: 'Generated C utility bundles', group: 'C bundles' },
      { label: 'C++', description: 'Generated C++ bundles and MY_Util C++ modules', group: 'C++ bundles' },
      { label: 'Scripts', description: 'Companion scripts and non-compiled helpers', group: 'Script bundles' }
    ].filter((category) => modules.some((module) => module.group === category.group));

    const selectedCategory = await vscode.window.showQuickPick(categories, {
      title: 'Module bundles',
      placeHolder: 'Select a bundle folder'
    });
    if (!selectedCategory) {
      return undefined;
    }

    const quickPickItems: Array<vscode.QuickPickItem & { module: BundledModuleChoice }> = modules
      .filter((module) => module.group === selectedCategory.group)
      .map((module) => ({
        label: module.label,
        description: module.description,
        detail: module.detail,
        module
      }));

    const selected = await vscode.window.showQuickPick(quickPickItems, {
      title: `Module bundles > ${selectedCategory.label}`,
      matchOnDescription: true,
      matchOnDetail: true
    });
    if (!selected?.module) {
      return undefined;
    }

    const relativeFolder = await vscode.window.showInputBox({
      title: 'Module bundle target folder',
      prompt: 'Folder where the selected utility files will be created or copied, relative to the active project directory.',
      value: selected.module.defaultFolder,
      validateInput: (value) => {
        const normalized = normalizeRelativeTemplateFolder(value);
        if (!normalized) {
          return 'A target folder is required.';
        }
        if (path.isAbsolute(value)) {
          return 'Use a relative folder inside the project directory.';
        }
        if (normalized.split(/[\/]+/).includes('..')) {
          return 'Parent directory segments are not allowed.';
        }
        return undefined;
      }
    });
    if (relativeFolder === undefined) {
      return undefined;
    }

    const normalizedFolder = normalizeRelativeTemplateFolder(relativeFolder);
    if (selected.module.generator) {
      const result = await this.generateBuiltInModuleBundle(projectDirectory, normalizedFolder, selected.module);
      if (result) {
        await this.applyBundledModuleProjectHints(selected.module);
      }
      return result;
    }

    const bundleRoot = path.join(this.context.extensionPath, BUNDLED_MY_UTIL_ROOT);
    const files = this.collectBundledMyUtilFiles(bundleRoot, selected.module.entries, projectDirectory, normalizedFolder);
    if (files.length === 0) {
      vscode.window.showErrorMessage(`No bundled files were found for ${selected.module.label}.`);
      return undefined;
    }

    const primary = files.find((file) => /\.(?:c|cc|cpp|cxx)$/i.test(file.absolutePath))?.absolutePath ?? files[0].absolutePath;
    const result = await this.writeFiles(files, primary);
    if (result) {
      await this.applyBundledModuleProjectHints(selected.module);
    }
    return result;
  }

  private async applyBundledModuleProjectHints(module: BundledModuleChoice): Promise<void> {
    if (process.platform !== 'win32' || !module.requiredWindowsLibraries?.length) {
      return;
    }
    const configuration = vscode.workspace.getConfiguration('cpm');
    const current = configuration.get<string[]>('libraries', []);
    const normalized = new Set(current.map((entry) => String(entry).replace(/^-l/, '').trim().toLowerCase()).filter(Boolean));
    const additions = module.requiredWindowsLibraries.filter((entry) => !normalized.has(entry.toLowerCase()));
    if (!additions.length) {
      return;
    }
    const next = [...current, ...additions];
    await configuration.update('libraries', next, vscode.ConfigurationTarget.Workspace);
    this.output.appendLine(`[C/C++ Templates] Added Windows linker libraries for ${module.label}: ${additions.join(', ')}`);
  }

  private async generateBuiltInModuleBundle(projectDirectory: string, relativeFolder: string, module: BundledModuleChoice): Promise<NewFileGenerationResult | undefined> {
    const targetRoot = path.join(projectDirectory, relativeFolder);
    if (module.generator === 'c-error') {
      const sourcePath = path.join(targetRoot, 'cpm_error.c');
      const headerPath = path.join(targetRoot, 'cpm_error.h');
      const iniPath = path.join(targetRoot, 'cpm_error.ini');
      const variables = this.createVariables(sourcePath, headerPath, undefined);
      const readmePath = path.join(targetRoot, 'README.md');
      return this.writeFiles([
        { absolutePath: sourcePath, contents: toCrlf(renderTemplateText(ERROR_SOURCE_TEMPLATE, variables)) },
        { absolutePath: headerPath, contents: toCrlf(renderTemplateText(ERROR_HEADER_TEMPLATE, variables)) },
        { absolutePath: iniPath, contents: toCrlf(renderTemplateText(ERROR_INI_TEMPLATE, variables)) },
        { absolutePath: readmePath, contents: toCrlf(C_ERROR_README_TEMPLATE) }
      ], sourcePath);
    }

    if (module.generator === 'c-core') {
      const sourcePath = path.join(targetRoot, 'cpm_util.c');
      const headerPath = path.join(targetRoot, 'cpm_util.h');
      const iniPath = path.join(targetRoot, 'cpm_util.ini');
      const variables = this.createVariables(sourcePath, headerPath, undefined);
      const readmePath = path.join(targetRoot, 'README.md');
      return this.writeFiles([
        { absolutePath: sourcePath, contents: toCrlf(renderTemplateText(C_CORE_UTIL_SOURCE_TEMPLATE, variables)) },
        { absolutePath: headerPath, contents: toCrlf(renderTemplateText(C_CORE_UTIL_HEADER_TEMPLATE, variables)) },
        { absolutePath: iniPath, contents: toCrlf(renderTemplateText(C_CORE_UTIL_INI_TEMPLATE, variables)) },
        { absolutePath: readmePath, contents: toCrlf(C_CORE_UTIL_README_TEMPLATE) }
      ], sourcePath);
    }

    if (module.generator === 'c-python-bridge') {
      const sourcePath = path.join(targetRoot, 'cpm_python_exec.c');
      const headerPath = path.join(targetRoot, 'cpm_python_exec.h');
      const variables = this.createVariables(sourcePath, headerPath, undefined);
      const readmePath = path.join(targetRoot, 'README.md');
      return this.writeFiles([
        { absolutePath: sourcePath, contents: toCrlf(renderTemplateText(C_PYTHON_EXEC_SOURCE_TEMPLATE, variables)) },
        { absolutePath: headerPath, contents: toCrlf(renderTemplateText(C_PYTHON_EXEC_HEADER_TEMPLATE, variables)) },
        { absolutePath: readmePath, contents: toCrlf(C_PYTHON_EXEC_README_TEMPLATE) }
      ], sourcePath);
    }

    if (module.generator === 'c-webui-server') {
      const sourcePath = path.join(targetRoot, 'cpm_webui.c');
      const headerPath = path.join(targetRoot, 'cpm_webui.h');
      const variables = this.createVariables(sourcePath, headerPath, undefined);
      const readmePath = path.join(targetRoot, 'README.md');
      return this.writeFiles([
        { absolutePath: sourcePath, contents: toCrlf(renderTemplateText(C_WEBUI_SOURCE_TEMPLATE, variables)) },
        { absolutePath: headerPath, contents: toCrlf(renderTemplateText(C_WEBUI_HEADER_TEMPLATE, variables)) },
        { absolutePath: readmePath, contents: toCrlf(C_WEBUI_README_TEMPLATE) }
      ], sourcePath);
    }

    if (module.generator === 'script-python-worker') {
      const readmePath = path.join(targetRoot, 'README_python_worker_protocol.md');
      const helperPath = path.join(targetRoot, 'catj_py_helper.py');
      const loggerPath = path.join(targetRoot, 'logger.py');
      const examplePath = path.join(targetRoot, 'example_worker.py');
      return this.writeFiles([
        { absolutePath: readmePath, contents: toCrlf(PYTHON_WORKER_PROTOCOL_README_TEMPLATE) },
        { absolutePath: helperPath, contents: toCrlf(PYTHON_WORKER_HELPER_TEMPLATE) },
        { absolutePath: loggerPath, contents: toCrlf(PYTHON_WORKER_LOGGER_TEMPLATE) },
        { absolutePath: examplePath, contents: toCrlf(PYTHON_WORKER_EXAMPLE_TEMPLATE) }
      ], examplePath);
    }

    if (module.generator === 'script-minimal-webui') {
      const indexPath = path.join(targetRoot, 'index.html');
      const appPath = path.join(targetRoot, 'app.js');
      const stylePath = path.join(targetRoot, 'style.css');
      const readmePath = path.join(targetRoot, 'README.md');
      return this.writeFiles([
        { absolutePath: indexPath, contents: toCrlf(MINIMAL_WEBUI_INDEX_TEMPLATE) },
        { absolutePath: appPath, contents: toCrlf(MINIMAL_WEBUI_APP_TEMPLATE) },
        { absolutePath: stylePath, contents: toCrlf(MINIMAL_WEBUI_STYLE_TEMPLATE) },
        { absolutePath: readmePath, contents: toCrlf(MINIMAL_WEBUI_README_TEMPLATE) }
      ], indexPath);
    }

    if (module.generator === 'cpp-core') {
      const sourcePath = path.join(targetRoot, 'cpm_util.cpp');
      const headerPath = path.join(targetRoot, 'cpm_util.hpp');
      const iniPath = path.join(targetRoot, 'cpm_util.ini');
      const variables = this.createVariables(sourcePath, headerPath, undefined);
      return this.writeFiles([
        { absolutePath: sourcePath, contents: toCrlf(renderTemplateText(CPP_CORE_UTIL_SOURCE_TEMPLATE, variables)) },
        { absolutePath: headerPath, contents: toCrlf(renderTemplateText(CPP_CORE_UTIL_HEADER_TEMPLATE, variables)) },
        { absolutePath: iniPath, contents: toCrlf(renderTemplateText(CPP_CORE_UTIL_INI_TEMPLATE, variables)) }
      ], sourcePath);
    }

    if (module.generator === 'cpp-error') {
      const sourcePath = path.join(targetRoot, 'cpm_error.cpp');
      const headerPath = path.join(targetRoot, 'cpm_error.hpp');
      const iniPath = path.join(targetRoot, 'cpm_error.ini');
      const variables = this.createVariables(sourcePath, headerPath, undefined);
      return this.writeFiles([
        { absolutePath: sourcePath, contents: toCrlf(renderTemplateText(CPP_ERROR_SOURCE_TEMPLATE, variables)) },
        { absolutePath: headerPath, contents: toCrlf(renderTemplateText(CPP_ERROR_HEADER_TEMPLATE, variables)) },
        { absolutePath: iniPath, contents: toCrlf(renderTemplateText(CPP_ERROR_INI_TEMPLATE, variables)) }
      ], sourcePath);
    }

    vscode.window.showErrorMessage(`Unsupported generated module bundle: ${module.label}.`);
    return undefined;
  }

  private collectBundledMyUtilFiles(bundleRoot: string, entries: string[], projectDirectory: string, targetFolder: string): PendingFile[] {
    const files: PendingFile[] = [];
    const rootPath = path.resolve(bundleRoot);
    const pushFile = (absoluteSource: string, relativeSource: string) => {
      const ext = path.extname(absoluteSource).toLowerCase();
      if (BUNDLED_MY_UTIL_SKIP_EXTENSIONS.has(ext)) {
        return;
      }
      const relative = normalizeRelativeTemplateFolder(relativeSource);
      if (!relative) {
        return;
      }
      const target = path.join(projectDirectory, targetFolder, relative);
      files.push({ absolutePath: target, contents: fs.readFileSync(absoluteSource) });
    };

    for (const entry of entries) {
      const [rawSourceEntry, rawTargetEntry] = entry.split('=>').map((part) => part.trim());
      const source = path.resolve(rootPath, rawSourceEntry);
      const targetRoot = rawTargetEntry ? normalizeRelativeTemplateFolder(rawTargetEntry) : '';
      if (!source.startsWith(rootPath) || !fs.existsSync(source)) {
        continue;
      }
      const stat = fs.statSync(source);
      if (stat.isFile()) {
        pushFile(source, targetRoot || path.relative(rootPath, source));
        continue;
      }
      if (stat.isDirectory()) {
        for (const filePath of walkDirectory(source)) {
          const relativeInsideEntry = path.relative(source, filePath);
          const mappedRelative = targetRoot ? path.join(targetRoot, relativeInsideEntry) : path.relative(rootPath, filePath);
          pushFile(filePath, mappedRelative);
        }
      }
    }

    const seen = new Set<string>();
    return files.filter((file) => {
      const key = path.resolve(file.absolutePath).toLowerCase();
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  private async generateSingleTextFile(projectDirectory: string, extension: string, suggestedBaseName: string, template: string, title: string): Promise<NewFileGenerationResult | undefined> {
    const target = await this.askTargetPath(projectDirectory, extension, suggestedBaseName, title);
    if (!target) {
      return undefined;
    }
    const variables = this.createVariables(target, target, undefined);
    return this.writeFiles([{ absolutePath: target, contents: toCrlf(renderTemplateText(template, variables)) }], target);
  }

  private async generateUserTemplate(projectDirectory: string, templates: StoredFileTemplate[]): Promise<NewFileGenerationResult | undefined> {
    const selected = await vscode.window.showQuickPick(templates.map((template) => ({
      label: template.label,
      description: `${template.extension} · ${template.description || ''}`,
      template
    })), { title: 'Select a saved creation template' });
    if (!selected) {
      return undefined;
    }
    const target = await this.askTargetPath(projectDirectory, selected.template.extension, `new_${sanitizeId(selected.template.label).replace(/-/g, '_')}`, selected.template.label);
    if (!target) {
      return undefined;
    }
    const variables = this.createVariables(target, target, undefined);
    return this.writeFiles([{ absolutePath: target, contents: toCrlf(renderTemplateText(selected.template.content, variables)) }], target);
  }

  private async askTargetPath(projectDirectory: string, extension: string, suggestedBaseName: string, title: string): Promise<string | undefined> {
    const normalizedExtension = normalizeExtension(extension);
    const uri = await vscode.window.showSaveDialog({
      title: `Create ${title}`,
      defaultUri: vscode.Uri.file(path.join(projectDirectory, `${suggestedBaseName}${normalizedExtension}`)),
      filters: { [title]: [normalizedExtension.slice(1)] }
    });
    if (!uri) {
      return undefined;
    }
    return path.extname(uri.fsPath) ? uri.fsPath : `${uri.fsPath}${normalizedExtension}`;
  }

  private async writeFiles(files: PendingFile[], primaryPath?: string, uirPath?: string): Promise<NewFileGenerationResult | undefined> {
    const existing = files.filter((file) => fs.existsSync(file.absolutePath));
    let overwrite = false;
    if (existing.length > 0) {
      const names = existing.map((file) => path.basename(file.absolutePath)).join(', ');
      const action = await vscode.window.showWarningMessage(
        `${names} already exist. Choose whether to preserve them or overwrite them with the selected C/C++ template.`,
        { modal: true },
        'Keep existing and add references',
        'Overwrite generated files'
      );
      if (!action) {
        return undefined;
      }
      overwrite = action === 'Overwrite generated files';
    }

    const createdFiles: string[] = [];
    for (const file of files) {
      if (fs.existsSync(file.absolutePath) && !overwrite) {
        continue;
      }
      fs.mkdirSync(path.dirname(file.absolutePath), { recursive: true });
      fs.writeFileSync(file.absolutePath, file.contents, file.binary ? undefined : 'utf8');
      createdFiles.push(file.absolutePath);
      this.output.appendLine(`[C/C++ Templates] Wrote ${file.absolutePath}`);
    }
    return { files: files.map((file) => file.absolutePath), createdFiles, primaryPath, uirPath };
  }

  private readBundledUirTemplate(): Buffer {
    const preference = vscode.workspace.getConfiguration('cpm').get<string>('uirTemplateVersion', 'auto');
    const installation = this.installations.getActiveInstallation();
    const version = resolveUirTemplateVersion(preference, installation?.root);
    const filePath = path.join(this.context.extensionPath, 'data', 'templates', `blank-${version}.uir`);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Bundled ${version} UIR template not found: ${filePath}`);
    }
    this.output.appendLine(`[C/C++ Templates] Using ${version} blank UIR template.`);
    return fs.readFileSync(filePath);
  }

  private createVariables(filePath: string, headerPath: string, uirPath?: string): TemplateVariables {
    const baseName = path.basename(filePath, path.extname(filePath));
    const now = new Date();
    return {
      baseName,
      fileName: path.basename(filePath),
      headerFile: path.basename(headerPath),
      guard: headerGuardForPath(headerPath),
      prefix: sanitizePrefix(baseName),
      uirFile: path.basename(uirPath || `${baseName}.uir`),
      date: now.toISOString().slice(0, 10),
      year: String(now.getFullYear())
    };
  }

  private getStorageDirectory(): string {
    const directory = path.join(this.context.globalStorageUri.fsPath, 'templates');
    fs.mkdirSync(directory, { recursive: true });
    return directory;
  }

  private getFileTemplateStorePath(): string {
    return path.join(this.getStorageDirectory(), FILE_TEMPLATE_STORE);
  }

  private getSnippetStorePath(): string {
    return path.join(this.getStorageDirectory(), SNIPPET_STORE);
  }

  private loadFileTemplates(): StoredFileTemplate[] {
    return this.readCollection<StoredFileTemplate>(this.getFileTemplateStorePath());
  }

  private saveFileTemplates(items: StoredFileTemplate[]): void {
    this.writeCollection(this.getFileTemplateStorePath(), items);
  }

  private loadSnippets(): StoredSnippet[] {
    return this.readCollection<StoredSnippet>(this.getSnippetStorePath());
  }

  private saveSnippets(items: StoredSnippet[]): void {
    this.writeCollection(this.getSnippetStorePath(), items);
  }

  private readCollection<T>(filePath: string): T[] {
    if (!fs.existsSync(filePath)) {
      return [];
    }
    try {
      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as StoredCollection<T> | T[];
      return Array.isArray(parsed) ? parsed : Array.isArray(parsed?.items) ? parsed.items : [];
    } catch (error) {
      this.output.appendLine(`[C/C++ Templates] Cannot read ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
      return [];
    }
  }

  private writeCollection<T>(filePath: string, items: T[]): void {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, `${JSON.stringify({ version: 1, items }, null, 2)}\n`, 'utf8');
  }

  private async saveTemplateFromPath(filePath: string, suppliedContents?: string): Promise<void> {
    const extension = normalizeExtension(path.extname(filePath));
    if (!TEXT_TEMPLATE_EXTENSIONS.has(extension)) {
      vscode.window.showErrorMessage(`The ${extension} file type is not handled as a text creation template.`);
      return;
    }
    const label = await vscode.window.showInputBox({
      title: 'Save creation template',
      prompt: 'Name displayed when creating a new C/C++ file',
      value: path.basename(filePath),
      validateInput: validateRequiredName
    });
    if (!label) {
      return;
    }
    const description = await vscode.window.showInputBox({ title: 'Save creation template', prompt: 'Optional description', value: '' });
    if (description === undefined) {
      return;
    }
    const templates = this.loadFileTemplates();
    templates.push({ id: `${sanitizeId(label)}-${Date.now()}`, label, description, extension, content: suppliedContents ?? fs.readFileSync(filePath, 'utf8') });
    this.saveFileTemplates(templates);
    vscode.window.showInformationMessage(`Saved creation template: ${label}`);
  }

  private async saveTextAsSnippet(defaultLabel: string, body: string): Promise<void> {
    const label = await vscode.window.showInputBox({ title: 'Import C/C++ snippet', prompt: 'Name displayed in the snippet picker', value: defaultLabel, validateInput: validateRequiredName });
    if (!label) {
      return;
    }
    const snippets = this.loadSnippets();
    snippets.push({ id: `${sanitizeId(label)}-${Date.now()}`, label, body });
    this.saveSnippets(snippets);
    vscode.window.showInformationMessage(`Imported C/C++ snippet: ${label}`);
  }

  private async openJsonStore<T>(filePath: string, initial: StoredCollection<T>): Promise<void> {
    if (!fs.existsSync(filePath)) {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, `${JSON.stringify(initial, null, 2)}\n`, 'utf8');
    }
    const document = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
    await vscode.window.showTextDocument(document, { preview: false });
  }
}


function normalizeRelativeTemplateFolder(value: string): string {
  return String(value || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '').replace(/\/{2,}/g, '/').trim();
}

function walkDirectory(directory: string): string[] {
  const result: string[] = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '.vscode' || entry.name === '.git') {
        continue;
      }
      result.push(...walkDirectory(absolute));
    } else if (entry.isFile()) {
      result.push(absolute);
    }
  }
  return result;
}

function validateRequiredName(value: string): string | undefined {
  return value.trim() ? undefined : 'A name is required.';
}
