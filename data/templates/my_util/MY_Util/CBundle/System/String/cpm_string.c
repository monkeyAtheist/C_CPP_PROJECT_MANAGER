#include "cpm_string.h"
#include <ctype.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static int cpm_ch_eq(char a, char b, int ignoreCase) {
    if (!ignoreCase) return a == b;
    return tolower((unsigned char)a) == tolower((unsigned char)b);
}
int CpmString_Copy(char *dst, size_t dstSize, const char *src) {
    size_t n;
    if (!dst || !dstSize || !src) return -1;
    n = strlen(src);
    if (n + 1 > dstSize) return -2;
    memcpy(dst, src, n + 1);
    return 0;
}
int CpmString_Append(char *dst, size_t dstSize, const char *src) {
    size_t a, b;
    if (!dst || !src || !dstSize) return -1;
    a = strlen(dst); b = strlen(src);
    if (a + b + 1 > dstSize) return -2;
    memcpy(dst + a, src, b + 1);
    return 0;
}
char *CpmString_Trim(char *text) {
    char *start, *end;
    size_t n;
    if (!text) return NULL;
    start = text;
    while (*start && isspace((unsigned char)*start)) ++start;
    end = start + strlen(start);
    while (end > start && isspace((unsigned char)end[-1])) --end;
    n = (size_t)(end - start);
    if (start != text) memmove(text, start, n);
    text[n] = '\0';
    return text;
}
void CpmString_ToLower(char *text) { if (text) while (*text) { *text = (char)tolower((unsigned char)*text); ++text; } }
void CpmString_ToUpper(char *text) { if (text) while (*text) { *text = (char)toupper((unsigned char)*text); ++text; } }
int CpmString_EqualsIgnoreCase(const char *a, const char *b) {
    if (!a || !b) return 0;
    while (*a && *b) if (!cpm_ch_eq(*a++, *b++, 1)) return 0;
    return *a == *b;
}
int CpmString_StartsWith(const char *text, const char *prefix, int ignoreCase) {
    if (!text || !prefix) return 0;
    while (*prefix) { if (!*text || !cpm_ch_eq(*text++, *prefix++, ignoreCase)) return 0; }
    return 1;
}
int CpmString_EndsWith(const char *text, const char *suffix, int ignoreCase) {
    size_t a, b, i;
    if (!text || !suffix) return 0;
    a = strlen(text); b = strlen(suffix);
    if (b > a) return 0;
    for (i = 0; i < b; ++i) if (!cpm_ch_eq(text[a - b + i], suffix[i], ignoreCase)) return 0;
    return 1;
}
int CpmString_Contains(const char *text, const char *needle, int ignoreCase) {
    size_t i, j, n;
    if (!text || !needle) return 0;
    n = strlen(needle);
    if (!n) return 1;
    for (i = 0; text[i]; ++i) {
        for (j = 0; j < n && text[i + j] && cpm_ch_eq(text[i + j], needle[j], ignoreCase); ++j) {}
        if (j == n) return 1;
    }
    return 0;
}
size_t CpmString_ReplaceAll(char *dst, size_t dstSize, const char *src, const char *needle, const char *replacement) {
    size_t si = 0, di = 0, nl, rl;
    if (!dst || !dstSize || !src || !needle || !replacement) return (size_t)-1;
    nl = strlen(needle); rl = strlen(replacement);
    if (!nl) { if (CpmString_Copy(dst, dstSize, src) != 0) return (size_t)-1; return strlen(dst); }
    while (src[si]) {
        if (strncmp(src + si, needle, nl) == 0) {
            if (di + rl + 1 > dstSize) return (size_t)-1;
            memcpy(dst + di, replacement, rl); di += rl; si += nl;
        } else {
            if (di + 2 > dstSize) return (size_t)-1;
            dst[di++] = src[si++];
        }
    }
    dst[di] = '\0';
    return di;
}
size_t CpmString_Split(char *text, char delimiter, char **parts, size_t maxParts, int keepEmpty) {
    char *p, *start;
    size_t count = 0;
    if (!text || !parts || !maxParts) return 0;
    start = text;
    for (p = text;; ++p) {
        if (*p == delimiter || *p == '\0') {
            char end = *p; *p = '\0';
            if ((keepEmpty || *start) && count < maxParts) parts[count++] = start;
            if (!end || count == maxParts) break;
            start = p + 1;
        }
    }
    return count;
}
void CpmStringBuilder_Init(CpmStringBuilder *b) { if (b) { b->data = NULL; b->length = 0; b->capacity = 0; } }
void CpmStringBuilder_Free(CpmStringBuilder *b) { if (b) { free(b->data); CpmStringBuilder_Init(b); } }
int CpmStringBuilder_Reserve(CpmStringBuilder *b, size_t capacity) {
    char *p; size_t next;
    if (!b) return -1;
    if (capacity <= b->capacity) return 0;
    next = b->capacity ? b->capacity : 64;
    while (next < capacity) { if (next > (size_t)-1 / 2) { next = capacity; break; } next *= 2; }
    p = (char *)realloc(b->data, next);
    if (!p) return -2;
    b->data = p; b->capacity = next;
    if (!b->length) b->data[0] = '\0';
    return 0;
}
int CpmStringBuilder_AppendN(CpmStringBuilder *b, const char *text, size_t length) {
    if (!b || (!text && length)) return -1;
    if (CpmStringBuilder_Reserve(b, b->length + length + 1) != 0) return -2;
    if (length) memcpy(b->data + b->length, text, length);
    b->length += length; b->data[b->length] = '\0'; return 0;
}
int CpmStringBuilder_Append(CpmStringBuilder *b, const char *text) { return text ? CpmStringBuilder_AppendN(b, text, strlen(text)) : -1; }
int CpmStringBuilder_AppendChar(CpmStringBuilder *b, char ch) { return CpmStringBuilder_AppendN(b, &ch, 1); }
int CpmStringBuilder_AppendFormatV(CpmStringBuilder *b, const char *format, va_list args) {
    va_list copy; int needed;
    if (!b || !format) return -1;
    va_copy(copy, args); needed = vsnprintf(NULL, 0, format, copy); va_end(copy);
    if (needed < 0) return -3;
    if (CpmStringBuilder_Reserve(b, b->length + (size_t)needed + 1) != 0) return -2;
    if (vsnprintf(b->data + b->length, b->capacity - b->length, format, args) != needed) return -3;
    b->length += (size_t)needed; return 0;
}
int CpmStringBuilder_AppendFormat(CpmStringBuilder *b, const char *format, ...) {
    int r; va_list args; va_start(args, format); r = CpmStringBuilder_AppendFormatV(b, format, args); va_end(args); return r;
}
char *CpmStringBuilder_Detach(CpmStringBuilder *b) {
    char *p;
    if (!b) return NULL;
    if (!b->data) { p = (char *)malloc(1); if (p) p[0] = '\0'; return p; }
    p = b->data; CpmStringBuilder_Init(b); return p;
}
