/**
 * @file cpm_file.h
 * @brief Cross-platform file and path helpers for CPM C projects.
 */
#ifndef CPM_FILE_H
#define CPM_FILE_H

#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef enum CpmFileStatus {
    CPM_FILE_OK = 0,
    CPM_FILE_NOT_FOUND = 1,
    CPM_FILE_ERR_ARGUMENT = -1,
    CPM_FILE_ERR_IO = -2,
    CPM_FILE_ERR_MEMORY = -3,
    CPM_FILE_ERR_RANGE = -4
} CpmFileStatus;

int CpmFile_Exists(const char *path);
int CpmFile_IsDirectory(const char *path);
int CpmFile_Size(const char *path, uint64_t *size);
int CpmFile_ReadAllBinary(const char *path, unsigned char **data, size_t *size);
int CpmFile_ReadAllText(const char *path, char **text, size_t *size);
int CpmFile_WriteAllBinary(const char *path, const void *data, size_t size);
int CpmFile_WriteAllText(const char *path, const char *text);
int CpmFile_AppendText(const char *path, const char *text);
int CpmFile_CreateDirectories(const char *path);
int CpmFile_Remove(const char *path);
int CpmFile_Rename(const char *fromPath, const char *toPath);

int CpmPath_Join(char *output, size_t outputSize, const char *left, const char *right);
int CpmPath_DirName(const char *path, char *output, size_t outputSize);
int CpmPath_BaseName(const char *path, char *output, size_t outputSize);
int CpmPath_Extension(const char *path, char *output, size_t outputSize);
int CpmPath_NormalizeSeparators(char *path);
int CpmPath_GetExecutablePath(char *output, size_t outputSize);
int CpmPath_GetExecutableDirectory(char *output, size_t outputSize);

const char *CpmFile_StatusString(int status);

#ifdef __cplusplus
}
#endif
#endif /* CPM_FILE_H */
