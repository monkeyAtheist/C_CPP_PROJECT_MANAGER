#if !defined(_WIN32)
#ifndef _POSIX_C_SOURCE
#define _POSIX_C_SOURCE 200809L
#endif
#endif
#include "cpm_file.h"

#include <errno.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>

#if defined(_WIN32)
#include <direct.h>
#include <windows.h>
#define CPM_MKDIR(path) _mkdir(path)
#define CPM_PATH_SEP '\\'
#else
#include <limits.h>
#include <unistd.h>
#define CPM_MKDIR(path) mkdir((path), 0777)
#define CPM_PATH_SEP '/'
#endif

static int cpm_copy(char *output, size_t outputSize, const char *text)
{
    size_t length;
    if (output == NULL || outputSize == 0 || text == NULL) return CPM_FILE_ERR_ARGUMENT;
    length = strlen(text);
    if (length + 1 > outputSize) return CPM_FILE_ERR_RANGE;
    memcpy(output, text, length + 1);
    return CPM_FILE_OK;
}

static int cpm_is_sep(char ch)
{
    return ch == '/' || ch == '\\';
}

int CpmFile_Exists(const char *path)
{
    struct stat info;
    return path != NULL && stat(path, &info) == 0;
}

int CpmFile_IsDirectory(const char *path)
{
    struct stat info;
    if (path == NULL || stat(path, &info) != 0) return 0;
#if defined(_WIN32)
    return (info.st_mode & _S_IFDIR) != 0;
#else
    return S_ISDIR(info.st_mode);
#endif
}

int CpmFile_Size(const char *path, uint64_t *size)
{
    struct stat info;
    if (path == NULL || size == NULL) return CPM_FILE_ERR_ARGUMENT;
    if (stat(path, &info) != 0) return errno == ENOENT ? CPM_FILE_NOT_FOUND : CPM_FILE_ERR_IO;
    if (info.st_size < 0) return CPM_FILE_ERR_IO;
    *size = (uint64_t)info.st_size;
    return CPM_FILE_OK;
}

int CpmFile_ReadAllBinary(const char *path, unsigned char **data, size_t *size)
{
    FILE *file;
    long length;
    unsigned char *buffer;
    size_t readCount;
    if (path == NULL || data == NULL || size == NULL) return CPM_FILE_ERR_ARGUMENT;
    *data = NULL;
    *size = 0;
    file = fopen(path, "rb");
    if (file == NULL) return errno == ENOENT ? CPM_FILE_NOT_FOUND : CPM_FILE_ERR_IO;
    if (fseek(file, 0, SEEK_END) != 0 || (length = ftell(file)) < 0 || fseek(file, 0, SEEK_SET) != 0) {
        fclose(file);
        return CPM_FILE_ERR_IO;
    }
    if ((unsigned long)length > (size_t)-1) {
        fclose(file);
        return CPM_FILE_ERR_RANGE;
    }
    buffer = (unsigned char *)malloc((size_t)length + 1u);
    if (buffer == NULL) {
        fclose(file);
        return CPM_FILE_ERR_MEMORY;
    }
    readCount = fread(buffer, 1, (size_t)length, file);
    if (readCount != (size_t)length && ferror(file)) {
        free(buffer);
        fclose(file);
        return CPM_FILE_ERR_IO;
    }
    fclose(file);
    buffer[readCount] = 0;
    *data = buffer;
    *size = readCount;
    return CPM_FILE_OK;
}

int CpmFile_ReadAllText(const char *path, char **text, size_t *size)
{
    unsigned char *data = NULL;
    int status;
    if (text == NULL) return CPM_FILE_ERR_ARGUMENT;
    status = CpmFile_ReadAllBinary(path, &data, size);
    if (status != CPM_FILE_OK) return status;
    *text = (char *)data;
    return CPM_FILE_OK;
}

int CpmFile_WriteAllBinary(const char *path, const void *data, size_t size)
{
    FILE *file;
    if (path == NULL || (data == NULL && size != 0)) return CPM_FILE_ERR_ARGUMENT;
    file = fopen(path, "wb");
    if (file == NULL) return CPM_FILE_ERR_IO;
    if (size != 0 && fwrite(data, 1, size, file) != size) {
        fclose(file);
        return CPM_FILE_ERR_IO;
    }
    if (fclose(file) != 0) return CPM_FILE_ERR_IO;
    return CPM_FILE_OK;
}

int CpmFile_WriteAllText(const char *path, const char *text)
{
    if (text == NULL) return CPM_FILE_ERR_ARGUMENT;
    return CpmFile_WriteAllBinary(path, text, strlen(text));
}

int CpmFile_AppendText(const char *path, const char *text)
{
    FILE *file;
    size_t size;
    if (path == NULL || text == NULL) return CPM_FILE_ERR_ARGUMENT;
    file = fopen(path, "ab");
    if (file == NULL) return CPM_FILE_ERR_IO;
    size = strlen(text);
    if (size != 0 && fwrite(text, 1, size, file) != size) {
        fclose(file);
        return CPM_FILE_ERR_IO;
    }
    if (fclose(file) != 0) return CPM_FILE_ERR_IO;
    return CPM_FILE_OK;
}

int CpmPath_NormalizeSeparators(char *path)
{
    char *cursor;
    if (path == NULL) return CPM_FILE_ERR_ARGUMENT;
    for (cursor = path; *cursor != '\0'; ++cursor) {
        if (cpm_is_sep(*cursor)) *cursor = CPM_PATH_SEP;
    }
    return CPM_FILE_OK;
}

int CpmFile_CreateDirectories(const char *path)
{
    char *copy;
    size_t length;
    size_t i;
    if (path == NULL || *path == '\0') return CPM_FILE_ERR_ARGUMENT;
    length = strlen(path);
    copy = (char *)malloc(length + 1u);
    if (copy == NULL) return CPM_FILE_ERR_MEMORY;
    memcpy(copy, path, length + 1u);
    CpmPath_NormalizeSeparators(copy);
    while (length > 1 && cpm_is_sep(copy[length - 1])) copy[--length] = '\0';
    for (i = 1; i <= length; ++i) {
        if (i == length || cpm_is_sep(copy[i])) {
            char saved = copy[i];
            copy[i] = '\0';
#if defined(_WIN32)
            if (i == 2 && copy[1] == ':') { copy[i] = saved; continue; }
#endif
            if (*copy != '\0' && !CpmFile_IsDirectory(copy)) {
                if (CPM_MKDIR(copy) != 0 && errno != EEXIST) {
                    free(copy);
                    return CPM_FILE_ERR_IO;
                }
            }
            copy[i] = saved;
        }
    }
    free(copy);
    return CPM_FILE_OK;
}

int CpmFile_Remove(const char *path)
{
    if (path == NULL) return CPM_FILE_ERR_ARGUMENT;
    if (remove(path) == 0) return CPM_FILE_OK;
    return errno == ENOENT ? CPM_FILE_NOT_FOUND : CPM_FILE_ERR_IO;
}

int CpmFile_Rename(const char *fromPath, const char *toPath)
{
    if (fromPath == NULL || toPath == NULL) return CPM_FILE_ERR_ARGUMENT;
    return rename(fromPath, toPath) == 0 ? CPM_FILE_OK : CPM_FILE_ERR_IO;
}

int CpmPath_Join(char *output, size_t outputSize, const char *left, const char *right)
{
    size_t leftLength;
    size_t rightOffset = 0;
    size_t needed;
    int addSeparator;
    if (output == NULL || outputSize == 0 || left == NULL || right == NULL) return CPM_FILE_ERR_ARGUMENT;
    leftLength = strlen(left);
    while (right[rightOffset] != '\0' && cpm_is_sep(right[rightOffset])) ++rightOffset;
    addSeparator = leftLength != 0 && !cpm_is_sep(left[leftLength - 1]) && right[rightOffset] != '\0';
    needed = leftLength + (size_t)addSeparator + strlen(right + rightOffset) + 1u;
    if (needed > outputSize) return CPM_FILE_ERR_RANGE;
    memcpy(output, left, leftLength);
    if (addSeparator) output[leftLength++] = CPM_PATH_SEP;
    strcpy(output + leftLength, right + rightOffset);
    CpmPath_NormalizeSeparators(output);
    return CPM_FILE_OK;
}

int CpmPath_DirName(const char *path, char *output, size_t outputSize)
{
    const char *last = NULL;
    const char *cursor;
    size_t length;
    if (path == NULL || output == NULL || outputSize == 0) return CPM_FILE_ERR_ARGUMENT;
    for (cursor = path; *cursor != '\0'; ++cursor) if (cpm_is_sep(*cursor)) last = cursor;
    if (last == NULL) return cpm_copy(output, outputSize, ".");
    length = (size_t)(last - path);
    if (length == 0) length = 1;
    if (length + 1 > outputSize) return CPM_FILE_ERR_RANGE;
    memcpy(output, path, length);
    output[length] = '\0';
    return CPM_FILE_OK;
}

int CpmPath_BaseName(const char *path, char *output, size_t outputSize)
{
    const char *base = path;
    const char *cursor;
    if (path == NULL) return CPM_FILE_ERR_ARGUMENT;
    for (cursor = path; *cursor != '\0'; ++cursor) if (cpm_is_sep(*cursor)) base = cursor + 1;
    return cpm_copy(output, outputSize, base);
}

int CpmPath_Extension(const char *path, char *output, size_t outputSize)
{
    const char *base = path;
    const char *dot = NULL;
    const char *cursor;
    if (path == NULL) return CPM_FILE_ERR_ARGUMENT;
    for (cursor = path; *cursor != '\0'; ++cursor) {
        if (cpm_is_sep(*cursor)) { base = cursor + 1; dot = NULL; }
        else if (*cursor == '.') dot = cursor;
    }
    if (dot == NULL || dot == base) return cpm_copy(output, outputSize, "");
    return cpm_copy(output, outputSize, dot);
}

int CpmPath_GetExecutablePath(char *output, size_t outputSize)
{
    if (output == NULL || outputSize == 0) return CPM_FILE_ERR_ARGUMENT;
#if defined(_WIN32)
    {
        DWORD length = GetModuleFileNameA(NULL, output, (DWORD)outputSize);
        if (length == 0) return CPM_FILE_ERR_IO;
        if ((size_t)length >= outputSize) return CPM_FILE_ERR_RANGE;
        return CPM_FILE_OK;
    }
#else
    {
        ssize_t length = readlink("/proc/self/exe", output, outputSize - 1u);
        if (length < 0) return CPM_FILE_ERR_IO;
        if ((size_t)length >= outputSize - 1u) return CPM_FILE_ERR_RANGE;
        output[length] = '\0';
        return CPM_FILE_OK;
    }
#endif
}

int CpmPath_GetExecutableDirectory(char *output, size_t outputSize)
{
    char path[4096];
    int status = CpmPath_GetExecutablePath(path, sizeof(path));
    if (status != CPM_FILE_OK) return status;
    return CpmPath_DirName(path, output, outputSize);
}

const char *CpmFile_StatusString(int status)
{
    switch (status) {
        case CPM_FILE_OK: return "ok";
        case CPM_FILE_NOT_FOUND: return "not found";
        case CPM_FILE_ERR_ARGUMENT: return "invalid argument";
        case CPM_FILE_ERR_IO: return "I/O error";
        case CPM_FILE_ERR_MEMORY: return "out of memory";
        case CPM_FILE_ERR_RANGE: return "buffer/range error";
        default: return "unknown error";
    }
}
