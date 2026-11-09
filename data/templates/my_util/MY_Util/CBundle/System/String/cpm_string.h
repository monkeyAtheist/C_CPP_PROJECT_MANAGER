/** @file cpm_string.h @brief Safe string helpers and a dynamic string builder. */
#ifndef CPM_STRING_H
#define CPM_STRING_H
#include <stddef.h>
#include <stdarg.h>
#ifdef __cplusplus
extern "C" {
#endif

typedef struct CpmStringBuilder {
    char *data;
    size_t length;
    size_t capacity;
} CpmStringBuilder;

int CpmString_Copy(char *dst, size_t dstSize, const char *src);
int CpmString_Append(char *dst, size_t dstSize, const char *src);
char *CpmString_Trim(char *text);
void CpmString_ToLower(char *text);
void CpmString_ToUpper(char *text);
int CpmString_EqualsIgnoreCase(const char *a, const char *b);
int CpmString_StartsWith(const char *text, const char *prefix, int ignoreCase);
int CpmString_EndsWith(const char *text, const char *suffix, int ignoreCase);
int CpmString_Contains(const char *text, const char *needle, int ignoreCase);
size_t CpmString_ReplaceAll(char *dst, size_t dstSize, const char *src, const char *needle, const char *replacement);
size_t CpmString_Split(char *text, char delimiter, char **parts, size_t maxParts, int keepEmpty);

void CpmStringBuilder_Init(CpmStringBuilder *builder);
void CpmStringBuilder_Free(CpmStringBuilder *builder);
int CpmStringBuilder_Reserve(CpmStringBuilder *builder, size_t capacity);
int CpmStringBuilder_Append(CpmStringBuilder *builder, const char *text);
int CpmStringBuilder_AppendN(CpmStringBuilder *builder, const char *text, size_t length);
int CpmStringBuilder_AppendChar(CpmStringBuilder *builder, char ch);
int CpmStringBuilder_AppendFormat(CpmStringBuilder *builder, const char *format, ...);
int CpmStringBuilder_AppendFormatV(CpmStringBuilder *builder, const char *format, va_list args);
char *CpmStringBuilder_Detach(CpmStringBuilder *builder);

#ifdef __cplusplus
}
#endif
#endif
