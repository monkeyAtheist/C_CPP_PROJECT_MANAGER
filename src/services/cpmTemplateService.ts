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

interface BundledModuleChoice {
  label: string;
  description: string;
  detail: string;
  defaultFolder: string;
  entries: string[];
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


function getBuiltInMyUtilModules(): BundledModuleChoice[] {
  return [
    {
      label: 'MY_Util / Core utilities',
      description: 'Copy myUtil.cpp, myUtil.h and utility.ini.',
      detail: 'INI reader, string helpers, timestamp and error-log helper functions from MY_Util.',
      defaultFolder: 'MY_Util',
      entries: ['myUtil.cpp', 'myUtil.h', 'utility.ini']
    },
    {
      label: 'MY_Util / Error management C++',
      description: 'Copy errorManagement.cpp/.h plus required core utility files.',
      detail: 'check_negerror, check_zeroerror, set_error macros and a runtime utility.ini configuration file.',
      defaultFolder: 'MY_Util',
      entries: ['myUtil.cpp', 'myUtil.h', 'utility.ini', 'ErrorManagement/errorManagement.cpp', 'ErrorManagement/errorManagement.h']
    },
    {
      label: 'MY_Util / UART communication',
      description: 'Copy the cross-platform UART class.',
      detail: 'Serial port wrapper with text, byte and packet helpers.',
      defaultFolder: 'MY_Util',
      entries: ['Communication/uart/uart.cpp', 'Communication/uart/uart.h']
    },
    {
      label: 'MY_Util / IPC communication',
      description: 'Copy the IPC pipe class.',
      detail: 'Named-pipe, local-socket and anonymous-pipe helpers.',
      defaultFolder: 'MY_Util',
      entries: ['Communication/IPC/IPC.cpp', 'Communication/IPC/IPC.h']
    },
    {
      label: 'MY_Util / Ethernet TCP-UDP communication',
      description: 'Copy the TCP/UDP EthernetLink class.',
      detail: 'Client/server TCP and UDP helpers with packet framing.',
      defaultFolder: 'MY_Util',
      entries: ['Communication/ethernet/ethernet.cpp', 'Communication/ethernet/ethernet.h']
    },
    {
      label: 'MY_Util / Full communication stack',
      description: 'Copy Communication/* modules.',
      detail: 'UART, Bluetooth, Wi-Fi, Ethernet, I2C, SPI, IPC, CommsManager and listen service.',
      defaultFolder: 'MY_Util',
      entries: ['Communication']
    },
    {
      label: 'MY_Util / Python execution bridge',
      description: 'Copy PythonRunner/PythonSession and the companion Python scripts.',
      detail: 'Launch scripts, maintain a session and exchange lines/JSON through pipes.',
      defaultFolder: 'MY_Util',
      entries: ['external/pythonExec', 'external/pythonScript']
    },
    {
      label: 'MY_Util / Web UI server',
      description: 'Copy the lightweight HTTP/Web UI server.',
      detail: 'Embedded routes, static files, API handlers and queued UI events.',
      defaultFolder: 'MY_Util',
      entries: ['webui']
    },
    {
      label: 'MY_Util / Complete bundle',
      description: 'Copy all MY_Util modules.',
      detail: 'Core utilities, error management, communication stack, Python bridge and Web UI server.',
      defaultFolder: 'MY_Util',
      entries: ['.']
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
    const choices: Array<vscode.QuickPickItem & { value: string }> = [
      { label: 'C source file', description: 'Create an empty source or a generic main() template', value: 'c-source' },
      { label: 'C main with CPM error handling', description: 'Create main.c with file header, sections and CPM error path', value: 'c-main-error' },
      { label: 'C++ source file', description: 'Create an empty source or a generic C++ main() template', value: 'cpp-source' },
      { label: 'C/C++ header file', description: 'Create a guarded header', value: 'c-header' },
      { label: 'C module (.c + .h)', description: 'Create a paired C implementation file and guarded header', value: 'c-module' },
      { label: 'C++ class (.cpp + .hpp)', description: 'Create a minimal C++ class declaration and implementation', value: 'cpp-class' },
      { label: 'Windows DLL starter (.c + .h)', description: 'Create a minimal DllMain and export header', value: 'dll' },
      { label: 'Error/logging module (.c + .h + .ini)', description: 'Create configurable C error handling with INI-controlled logging', value: 'error-module' },
      { label: 'Error/logging configuration (.ini)', description: 'Create only the runtime error logging configuration file', value: 'error-ini' },
      { label: 'MY_Util module bundle...', description: 'Copy selected C++ utility modules from the bundled MY_Util archive', value: 'my-util-module' },
      { label: 'Text file', description: 'Create an empty .txt file', value: 'text' }
    ];
    if (userTemplates.length > 0) {
      choices.push({ label: 'Saved user template...', description: 'Create a file from one of your reusable examples', value: 'user-template' });
    }

    const selected = await vscode.window.showQuickPick(choices, { title: 'Create a new C/C++ file or starter module' });
    if (!selected) {
      return undefined;
    }

    switch (selected.value) {
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
      case 'text': return this.generateSingleTextFile(projectDirectory, '.txt', 'new_file', '', 'Text file');
      case 'user-template': return this.generateUserTemplate(projectDirectory, userTemplates);
      default: return undefined;
    }
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
    const selected = await vscode.window.showQuickPick(modules.map((module) => ({
      label: module.label,
      description: module.description,
      detail: module.detail,
      module
    })), {
      title: 'Copy a bundled MY_Util module',
      matchOnDescription: true,
      matchOnDetail: true
    });
    if (!selected) {
      return undefined;
    }

    const relativeFolder = await vscode.window.showInputBox({
      title: 'MY_Util target folder',
      prompt: 'Folder where the selected utility files will be copied, relative to the active project directory.',
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

    const bundleRoot = path.join(this.context.extensionPath, BUNDLED_MY_UTIL_ROOT);
    const files = this.collectBundledMyUtilFiles(bundleRoot, selected.module.entries, projectDirectory, normalizeRelativeTemplateFolder(relativeFolder));
    if (files.length === 0) {
      vscode.window.showErrorMessage(`No bundled files were found for ${selected.module.label}.`);
      return undefined;
    }

    const primary = files.find((file) => /\.(?:c|cc|cpp|cxx)$/i.test(file.absolutePath))?.absolutePath ?? files[0].absolutePath;
    return this.writeFiles(files, primary);
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
      const source = path.resolve(rootPath, entry);
      if (!source.startsWith(rootPath) || !fs.existsSync(source)) {
        continue;
      }
      const stat = fs.statSync(source);
      if (stat.isFile()) {
        pushFile(source, path.relative(rootPath, source));
        continue;
      }
      if (stat.isDirectory()) {
        for (const filePath of walkDirectory(source)) {
          pushFile(filePath, path.relative(rootPath, filePath));
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
