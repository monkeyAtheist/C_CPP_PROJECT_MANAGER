/**
 * @file cpm_ini.c
 * @brief Implementation of the CPM dependency-free INI bundle.
 */
#include "cpm_ini.h"

#include <ctype.h>
#include <errno.h>
#include <limits.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#ifndef CPM_INI_LINE_SIZE
#define CPM_INI_LINE_SIZE 4096
#endif

static char *CpmIni_StrDup(const char *text)
{
    size_t length;
    char *copy;

    if (text == NULL)
        text = "";
    length = strlen(text);
    copy = (char *)malloc(length + 1);
    if (copy == NULL)
        return NULL;
    memcpy(copy, text, length + 1);
    return copy;
}

static int CpmIni_CharEqual(char a, char b, int caseSensitive)
{
    if (caseSensitive)
        return a == b;
    return tolower((unsigned char)a) == tolower((unsigned char)b);
}

static int CpmIni_TextEqual(const char *a, const char *b, int caseSensitive)
{
    if (a == NULL || b == NULL)
        return a == b;
    while (*a != '\0' && *b != '\0')
    {
        if (!CpmIni_CharEqual(*a, *b, caseSensitive))
            return 0;
        ++a;
        ++b;
    }
    return *a == '\0' && *b == '\0';
}

static char *CpmIni_Trim(char *text)
{
    char *end;
    if (text == NULL)
        return NULL;
    while (*text != '\0' && isspace((unsigned char)*text))
        ++text;
    end = text + strlen(text);
    while (end > text && isspace((unsigned char)end[-1]))
        --end;
    *end = '\0';
    return text;
}

static int CpmIni_Copy(char *dst, size_t dstSize, const char *src)
{
    size_t length;
    if (dst == NULL || dstSize == 0)
        return CPM_INI_ERR_ARGUMENT;
    if (src == NULL)
        src = "";
    length = strlen(src);
    if (length >= dstSize)
    {
        memcpy(dst, src, dstSize - 1);
        dst[dstSize - 1] = '\0';
        return CPM_INI_ERR_RANGE;
    }
    memcpy(dst, src, length + 1);
    return CPM_INI_OK;
}

static void CpmIni_FreeSection(CpmIniSection *section)
{
    size_t i;
    if (section == NULL)
        return;
    for (i = 0; i < section->entryCount; ++i)
    {
        free(section->entries[i].key);
        free(section->entries[i].value);
    }
    free(section->entries);
    free(section->name);
    memset(section, 0, sizeof(*section));
}

void CpmIni_Init(CpmIniDocument *document)
{
    if (document == NULL)
        return;
    memset(document, 0, sizeof(*document));
}

void CpmIni_Free(CpmIniDocument *document)
{
    size_t i;
    int caseSensitive;
    if (document == NULL)
        return;
    caseSensitive = document->caseSensitive;
    for (i = 0; i < document->sectionCount; ++i)
        CpmIni_FreeSection(&document->sections[i]);
    free(document->sections);
    memset(document, 0, sizeof(*document));
    document->caseSensitive = caseSensitive;
}

void CpmIni_SetCaseSensitive(CpmIniDocument *document, int enabled)
{
    if (document != NULL)
        document->caseSensitive = enabled ? 1 : 0;
}

static CpmIniSection *CpmIni_FindSectionMutable(CpmIniDocument *document, const char *name)
{
    size_t i;
    const char *resolved = name != NULL ? name : "";
    if (document == NULL)
        return NULL;
    for (i = 0; i < document->sectionCount; ++i)
    {
        if (CpmIni_TextEqual(document->sections[i].name, resolved, document->caseSensitive))
            return &document->sections[i];
    }
    return NULL;
}

static const CpmIniSection *CpmIni_FindSection(const CpmIniDocument *document, const char *name)
{
    size_t i;
    const char *resolved = name != NULL ? name : "";
    if (document == NULL)
        return NULL;
    for (i = 0; i < document->sectionCount; ++i)
    {
        if (CpmIni_TextEqual(document->sections[i].name, resolved, document->caseSensitive))
            return &document->sections[i];
    }
    return NULL;
}

static CpmIniEntry *CpmIni_FindEntryMutable(CpmIniDocument *document, CpmIniSection *section, const char *key)
{
    size_t i;
    if (document == NULL || section == NULL || key == NULL)
        return NULL;
    for (i = 0; i < section->entryCount; ++i)
    {
        if (CpmIni_TextEqual(section->entries[i].key, key, document->caseSensitive))
            return &section->entries[i];
    }
    return NULL;
}

static const CpmIniEntry *CpmIni_FindEntry(const CpmIniDocument *document, const CpmIniSection *section, const char *key)
{
    size_t i;
    if (document == NULL || section == NULL || key == NULL)
        return NULL;
    for (i = 0; i < section->entryCount; ++i)
    {
        if (CpmIni_TextEqual(section->entries[i].key, key, document->caseSensitive))
            return &section->entries[i];
    }
    return NULL;
}

static int CpmIni_GrowSections(CpmIniDocument *document)
{
    size_t newCapacity;
    CpmIniSection *next;
    if (document->sectionCount < document->sectionCapacity)
        return CPM_INI_OK;
    newCapacity = document->sectionCapacity == 0 ? 4 : document->sectionCapacity * 2;
    next = (CpmIniSection *)realloc(document->sections, newCapacity * sizeof(*next));
    if (next == NULL)
        return CPM_INI_ERR_MEMORY;
    memset(next + document->sectionCapacity, 0, (newCapacity - document->sectionCapacity) * sizeof(*next));
    document->sections = next;
    document->sectionCapacity = newCapacity;
    return CPM_INI_OK;
}

static int CpmIni_GrowEntries(CpmIniSection *section)
{
    size_t newCapacity;
    CpmIniEntry *next;
    if (section->entryCount < section->entryCapacity)
        return CPM_INI_OK;
    newCapacity = section->entryCapacity == 0 ? 8 : section->entryCapacity * 2;
    next = (CpmIniEntry *)realloc(section->entries, newCapacity * sizeof(*next));
    if (next == NULL)
        return CPM_INI_ERR_MEMORY;
    memset(next + section->entryCapacity, 0, (newCapacity - section->entryCapacity) * sizeof(*next));
    section->entries = next;
    section->entryCapacity = newCapacity;
    return CPM_INI_OK;
}

static CpmIniSection *CpmIni_EnsureSection(CpmIniDocument *document, const char *name, int *status)
{
    CpmIniSection *section;
    const char *resolved = name != NULL ? name : "";
    int result;

    section = CpmIni_FindSectionMutable(document, resolved);
    if (section != NULL)
    {
        if (status != NULL)
            *status = CPM_INI_OK;
        return section;
    }

    result = CpmIni_GrowSections(document);
    if (result != CPM_INI_OK)
    {
        if (status != NULL)
            *status = result;
        return NULL;
    }

    section = &document->sections[document->sectionCount];
    section->name = CpmIni_StrDup(resolved);
    if (section->name == NULL)
    {
        if (status != NULL)
            *status = CPM_INI_ERR_MEMORY;
        return NULL;
    }
    ++document->sectionCount;
    if (status != NULL)
        *status = CPM_INI_OK;
    return section;
}

int CpmIni_SetString(CpmIniDocument *document, const char *sectionName, const char *key, const char *value)
{
    CpmIniSection *section;
    CpmIniEntry *entry;
    char *copy;
    int status;

    if (document == NULL || key == NULL || key[0] == '\0' || value == NULL)
        return CPM_INI_ERR_ARGUMENT;

    section = CpmIni_EnsureSection(document, sectionName, &status);
    if (section == NULL)
        return status;

    entry = CpmIni_FindEntryMutable(document, section, key);
    copy = CpmIni_StrDup(value);
    if (copy == NULL)
        return CPM_INI_ERR_MEMORY;

    if (entry != NULL)
    {
        free(entry->value);
        entry->value = copy;
        return CPM_INI_OK;
    }

    status = CpmIni_GrowEntries(section);
    if (status != CPM_INI_OK)
    {
        free(copy);
        return status;
    }

    entry = &section->entries[section->entryCount];
    entry->key = CpmIni_StrDup(key);
    if (entry->key == NULL)
    {
        free(copy);
        return CPM_INI_ERR_MEMORY;
    }
    entry->value = copy;
    ++section->entryCount;
    return CPM_INI_OK;
}

static void CpmIni_UnquoteInPlace(char *value)
{
    size_t length;
    size_t readIndex;
    size_t writeIndex;
    char quote;

    if (value == NULL)
        return;
    length = strlen(value);
    if (length < 2 || !((value[0] == '"' && value[length - 1] == '"') || (value[0] == '\'' && value[length - 1] == '\'')))
        return;

    quote = value[0];
    writeIndex = 0;
    for (readIndex = 1; readIndex + 1 < length; ++readIndex)
    {
        char ch = value[readIndex];
        if (quote == '"' && ch == '\\' && readIndex + 2 < length)
        {
            char next = value[++readIndex];
            switch (next)
            {
                case 'n': ch = '\n'; break;
                case 'r': ch = '\r'; break;
                case 't': ch = '\t'; break;
                case '\\': ch = '\\'; break;
                case '"': ch = '"'; break;
                default:
                    value[writeIndex++] = '\\';
                    ch = next;
                    break;
            }
        }
        value[writeIndex++] = ch;
    }
    value[writeIndex] = '\0';
}

int CpmIni_Load(CpmIniDocument *document, const char *path)
{
    FILE *file;
    char line[CPM_INI_LINE_SIZE];
    char currentSection[512] = "";
    int firstLine = 1;
    int result = CPM_INI_OK;
    int caseSensitive;

    if (document == NULL || path == NULL || path[0] == '\0')
        return CPM_INI_ERR_ARGUMENT;

    file = fopen(path, "rb");
    if (file == NULL)
        return CPM_INI_ERR_IO;

    caseSensitive = document->caseSensitive;
    CpmIni_Free(document);
    CpmIni_Init(document);
    document->caseSensitive = caseSensitive;

    while (fgets(line, sizeof(line), file) != NULL)
    {
        char *cursor;
        char *separator;
        size_t length = strlen(line);

        if (length == sizeof(line) - 1 && line[length - 1] != '\n' && !feof(file))
        {
            result = CPM_INI_ERR_RANGE;
            break;
        }

        if (firstLine)
        {
            unsigned char *bytes = (unsigned char *)line;
            if (length >= 3 && bytes[0] == 0xEF && bytes[1] == 0xBB && bytes[2] == 0xBF)
                memmove(line, line + 3, length - 2);
            firstLine = 0;
        }

        cursor = CpmIni_Trim(line);
        if (cursor[0] == '\0' || cursor[0] == ';' || cursor[0] == '#')
            continue;

        if (cursor[0] == '[')
        {
            char *closing = strchr(cursor + 1, ']');
            char *name;
            if (closing == NULL)
            {
                result = CPM_INI_ERR_PARSE;
                break;
            }
            *closing = '\0';
            name = CpmIni_Trim(cursor + 1);
            if (name[0] == '\0' || strlen(name) >= sizeof(currentSection))
            {
                result = CPM_INI_ERR_PARSE;
                break;
            }
            strcpy(currentSection, name);
            continue;
        }

        separator = strchr(cursor, '=');
        if (separator == NULL)
        {
            result = CPM_INI_ERR_PARSE;
            break;
        }
        *separator = '\0';
        {
            char *key = CpmIni_Trim(cursor);
            char *value = CpmIni_Trim(separator + 1);
            if (key[0] == '\0')
            {
                result = CPM_INI_ERR_PARSE;
                break;
            }
            CpmIni_UnquoteInPlace(value);
            result = CpmIni_SetString(document, currentSection, key, value);
            if (result != CPM_INI_OK)
                break;
        }
    }

    fclose(file);
    if (result != CPM_INI_OK)
    {
        CpmIni_Free(document);
        CpmIni_Init(document);
        document->caseSensitive = caseSensitive;
    }
    return result;
}

static int CpmIni_ValueNeedsQuotes(const char *value)
{
    size_t length;
    if (value == NULL)
        return 0;
    length = strlen(value);
    if (length == 0)
        return 0;
    if (isspace((unsigned char)value[0]) || isspace((unsigned char)value[length - 1]) || value[0] == ';' || value[0] == '#')
        return 1;
    return strchr(value, '\n') != NULL || strchr(value, '\r') != NULL || strchr(value, '"') != NULL || strchr(value, '\\') != NULL;
}

static int CpmIni_WriteValue(FILE *file, const char *value)
{
    const unsigned char *cursor;
    if (!CpmIni_ValueNeedsQuotes(value))
        return fputs(value != NULL ? value : "", file) < 0 ? CPM_INI_ERR_IO : CPM_INI_OK;

    if (fputc('"', file) == EOF)
        return CPM_INI_ERR_IO;
    for (cursor = (const unsigned char *)(value != NULL ? value : ""); *cursor != '\0'; ++cursor)
    {
        const char *escape = NULL;
        switch (*cursor)
        {
            case '\n': escape = "\\n"; break;
            case '\r': escape = "\\r"; break;
            case '\t': escape = "\\t"; break;
            case '\\': escape = "\\\\"; break;
            case '"': escape = "\\\""; break;
            default: break;
        }
        if (escape != NULL)
        {
            if (fputs(escape, file) < 0)
                return CPM_INI_ERR_IO;
        }
        else if (fputc((int)*cursor, file) == EOF)
        {
            return CPM_INI_ERR_IO;
        }
    }
    return fputc('"', file) == EOF ? CPM_INI_ERR_IO : CPM_INI_OK;
}

int CpmIni_Save(const CpmIniDocument *document, const char *path)
{
    FILE *file;
    size_t sectionIndex;
    int wroteAny = 0;

    if (document == NULL || path == NULL || path[0] == '\0')
        return CPM_INI_ERR_ARGUMENT;
    file = fopen(path, "wb");
    if (file == NULL)
        return CPM_INI_ERR_IO;

    for (sectionIndex = 0; sectionIndex < document->sectionCount; ++sectionIndex)
    {
        const CpmIniSection *section = &document->sections[sectionIndex];
        size_t entryIndex;
        if (wroteAny && fputc('\n', file) == EOF)
        {
            fclose(file);
            return CPM_INI_ERR_IO;
        }
        if (section->name != NULL && section->name[0] != '\0')
        {
            if (fprintf(file, "[%s]\n", section->name) < 0)
            {
                fclose(file);
                return CPM_INI_ERR_IO;
            }
        }
        for (entryIndex = 0; entryIndex < section->entryCount; ++entryIndex)
        {
            const CpmIniEntry *entry = &section->entries[entryIndex];
            if (fprintf(file, "%s=", entry->key) < 0 || CpmIni_WriteValue(file, entry->value) != CPM_INI_OK || fputc('\n', file) == EOF)
            {
                fclose(file);
                return CPM_INI_ERR_IO;
            }
        }
        wroteAny = 1;
    }

    if (fclose(file) != 0)
        return CPM_INI_ERR_IO;
    return CPM_INI_OK;
}

int CpmIni_HasSection(const CpmIniDocument *document, const char *section)
{
    return CpmIni_FindSection(document, section) != NULL;
}

int CpmIni_HasKey(const CpmIniDocument *document, const char *section, const char *key)
{
    const CpmIniSection *found = CpmIni_FindSection(document, section);
    return found != NULL && CpmIni_FindEntry(document, found, key) != NULL;
}

const char *CpmIni_GetRawValue(const CpmIniDocument *document, const char *section, const char *key)
{
    const CpmIniSection *foundSection = CpmIni_FindSection(document, section);
    const CpmIniEntry *entry = CpmIni_FindEntry(document, foundSection, key);
    return entry != NULL ? entry->value : NULL;
}

int CpmIni_GetString(const CpmIniDocument *document, const char *section, const char *key,
                     const char *defaultValue, char *value, size_t valueSize)
{
    const char *raw;
    int copyStatus;
    if (document == NULL || key == NULL || value == NULL || valueSize == 0)
        return CPM_INI_ERR_ARGUMENT;
    raw = CpmIni_GetRawValue(document, section, key);
    if (raw == NULL)
    {
        copyStatus = CpmIni_Copy(value, valueSize, defaultValue != NULL ? defaultValue : "");
        return copyStatus == CPM_INI_OK ? CPM_INI_NOT_FOUND : copyStatus;
    }
    return CpmIni_Copy(value, valueSize, raw);
}

static int CpmIni_ParseInt64(const char *text, int64_t *value)
{
    char *end = NULL;
    long long parsed;
    if (text == NULL || value == NULL)
        return CPM_INI_ERR_ARGUMENT;
    errno = 0;
    parsed = strtoll(text, &end, 0);
    if (end == text || errno == ERANGE)
        return CPM_INI_ERR_PARSE;
    while (*end != '\0' && isspace((unsigned char)*end))
        ++end;
    if (*end != '\0')
        return CPM_INI_ERR_PARSE;
    *value = (int64_t)parsed;
    return CPM_INI_OK;
}

int CpmIni_GetInt64(const CpmIniDocument *document, const char *section, const char *key,
                    int64_t defaultValue, int64_t *value)
{
    const char *raw;
    int status;
    if (document == NULL || key == NULL || value == NULL)
        return CPM_INI_ERR_ARGUMENT;
    raw = CpmIni_GetRawValue(document, section, key);
    if (raw == NULL)
    {
        *value = defaultValue;
        return CPM_INI_NOT_FOUND;
    }
    status = CpmIni_ParseInt64(raw, value);
    if (status != CPM_INI_OK)
        *value = defaultValue;
    return status;
}

int CpmIni_GetInt(const CpmIniDocument *document, const char *section, const char *key,
                  int defaultValue, int *value)
{
    int64_t parsed = (int64_t)defaultValue;
    int status;
    if (value == NULL)
        return CPM_INI_ERR_ARGUMENT;
    status = CpmIni_GetInt64(document, section, key, (int64_t)defaultValue, &parsed);
    if (parsed < (int64_t)INT_MIN || parsed > (int64_t)INT_MAX)
    {
        *value = defaultValue;
        return CPM_INI_ERR_RANGE;
    }
    *value = (int)parsed;
    return status;
}

int CpmIni_GetDouble(const CpmIniDocument *document, const char *section, const char *key,
                     double defaultValue, double *value)
{
    const char *raw;
    char *end = NULL;
    double parsed;
    if (document == NULL || key == NULL || value == NULL)
        return CPM_INI_ERR_ARGUMENT;
    raw = CpmIni_GetRawValue(document, section, key);
    if (raw == NULL)
    {
        *value = defaultValue;
        return CPM_INI_NOT_FOUND;
    }
    errno = 0;
    parsed = strtod(raw, &end);
    if (end == raw || errno == ERANGE)
    {
        *value = defaultValue;
        return CPM_INI_ERR_PARSE;
    }
    while (*end != '\0' && isspace((unsigned char)*end))
        ++end;
    if (*end != '\0')
    {
        *value = defaultValue;
        return CPM_INI_ERR_PARSE;
    }
    *value = parsed;
    return CPM_INI_OK;
}

int CpmIni_GetBool(const CpmIniDocument *document, const char *section, const char *key,
                   int defaultValue, int *value)
{
    const char *raw;
    if (document == NULL || key == NULL || value == NULL)
        return CPM_INI_ERR_ARGUMENT;
    raw = CpmIni_GetRawValue(document, section, key);
    if (raw == NULL)
    {
        *value = defaultValue ? 1 : 0;
        return CPM_INI_NOT_FOUND;
    }
    if (CpmIni_TextEqual(raw, "1", 0) || CpmIni_TextEqual(raw, "true", 0) ||
        CpmIni_TextEqual(raw, "yes", 0) || CpmIni_TextEqual(raw, "on", 0) ||
        CpmIni_TextEqual(raw, "enabled", 0))
    {
        *value = 1;
        return CPM_INI_OK;
    }
    if (CpmIni_TextEqual(raw, "0", 0) || CpmIni_TextEqual(raw, "false", 0) ||
        CpmIni_TextEqual(raw, "no", 0) || CpmIni_TextEqual(raw, "off", 0) ||
        CpmIni_TextEqual(raw, "disabled", 0))
    {
        *value = 0;
        return CPM_INI_OK;
    }
    *value = defaultValue ? 1 : 0;
    return CPM_INI_ERR_PARSE;
}

int CpmIni_SetInt(CpmIniDocument *document, const char *section, const char *key, int value)
{
    char buffer[32];
    snprintf(buffer, sizeof(buffer), "%d", value);
    return CpmIni_SetString(document, section, key, buffer);
}

int CpmIni_SetInt64(CpmIniDocument *document, const char *section, const char *key, int64_t value)
{
    char buffer[64];
#if defined(_MSC_VER)
    snprintf(buffer, sizeof(buffer), "%lld", (long long)value);
#else
    snprintf(buffer, sizeof(buffer), "%lld", (long long)value);
#endif
    return CpmIni_SetString(document, section, key, buffer);
}

int CpmIni_SetDouble(CpmIniDocument *document, const char *section, const char *key, double value)
{
    char buffer[64];
    snprintf(buffer, sizeof(buffer), "%.17g", value);
    return CpmIni_SetString(document, section, key, buffer);
}

int CpmIni_SetBool(CpmIniDocument *document, const char *section, const char *key, int value)
{
    return CpmIni_SetString(document, section, key, value ? "true" : "false");
}

int CpmIni_RemoveKey(CpmIniDocument *document, const char *sectionName, const char *key)
{
    CpmIniSection *section;
    size_t i;
    if (document == NULL || key == NULL)
        return CPM_INI_ERR_ARGUMENT;
    section = CpmIni_FindSectionMutable(document, sectionName);
    if (section == NULL)
        return CPM_INI_NOT_FOUND;
    for (i = 0; i < section->entryCount; ++i)
    {
        if (CpmIni_TextEqual(section->entries[i].key, key, document->caseSensitive))
        {
            free(section->entries[i].key);
            free(section->entries[i].value);
            if (i + 1 < section->entryCount)
                memmove(&section->entries[i], &section->entries[i + 1], (section->entryCount - i - 1) * sizeof(section->entries[0]));
            --section->entryCount;
            memset(&section->entries[section->entryCount], 0, sizeof(section->entries[0]));
            return CPM_INI_OK;
        }
    }
    return CPM_INI_NOT_FOUND;
}

int CpmIni_RemoveSection(CpmIniDocument *document, const char *sectionName)
{
    size_t i;
    const char *resolved = sectionName != NULL ? sectionName : "";
    if (document == NULL)
        return CPM_INI_ERR_ARGUMENT;
    for (i = 0; i < document->sectionCount; ++i)
    {
        if (CpmIni_TextEqual(document->sections[i].name, resolved, document->caseSensitive))
        {
            CpmIni_FreeSection(&document->sections[i]);
            if (i + 1 < document->sectionCount)
                memmove(&document->sections[i], &document->sections[i + 1], (document->sectionCount - i - 1) * sizeof(document->sections[0]));
            --document->sectionCount;
            memset(&document->sections[document->sectionCount], 0, sizeof(document->sections[0]));
            return CPM_INI_OK;
        }
    }
    return CPM_INI_NOT_FOUND;
}

size_t CpmIni_GetSectionCount(const CpmIniDocument *document)
{
    return document != NULL ? document->sectionCount : 0;
}

const char *CpmIni_GetSectionName(const CpmIniDocument *document, size_t sectionIndex)
{
    if (document == NULL || sectionIndex >= document->sectionCount)
        return NULL;
    return document->sections[sectionIndex].name;
}

size_t CpmIni_GetKeyCount(const CpmIniDocument *document, const char *section)
{
    const CpmIniSection *found = CpmIni_FindSection(document, section);
    return found != NULL ? found->entryCount : 0;
}

const char *CpmIni_GetKeyName(const CpmIniDocument *document, const char *section, size_t keyIndex)
{
    const CpmIniSection *found = CpmIni_FindSection(document, section);
    if (found == NULL || keyIndex >= found->entryCount)
        return NULL;
    return found->entries[keyIndex].key;
}

static int CpmIni_ReadWithDocument(const char *path, CpmIniDocument *document)
{
    CpmIni_Init(document);
    return CpmIni_Load(document, path);
}

int CpmIni_ReadString(const char *path, const char *section, const char *key,
                      const char *defaultValue, char *value, size_t valueSize)
{
    CpmIniDocument document;
    int status = CpmIni_ReadWithDocument(path, &document);
    if (status == CPM_INI_OK)
        status = CpmIni_GetString(&document, section, key, defaultValue, value, valueSize);
    else if (value != NULL && valueSize > 0)
        CpmIni_Copy(value, valueSize, defaultValue != NULL ? defaultValue : "");
    CpmIni_Free(&document);
    return status;
}

int CpmIni_ReadInt(const char *path, const char *section, const char *key, int defaultValue, int *value)
{
    CpmIniDocument document;
    int status = CpmIni_ReadWithDocument(path, &document);
    if (status == CPM_INI_OK)
        status = CpmIni_GetInt(&document, section, key, defaultValue, value);
    else if (value != NULL)
        *value = defaultValue;
    CpmIni_Free(&document);
    return status;
}

int CpmIni_ReadInt64(const char *path, const char *section, const char *key, int64_t defaultValue, int64_t *value)
{
    CpmIniDocument document;
    int status = CpmIni_ReadWithDocument(path, &document);
    if (status == CPM_INI_OK)
        status = CpmIni_GetInt64(&document, section, key, defaultValue, value);
    else if (value != NULL)
        *value = defaultValue;
    CpmIni_Free(&document);
    return status;
}

int CpmIni_ReadDouble(const char *path, const char *section, const char *key, double defaultValue, double *value)
{
    CpmIniDocument document;
    int status = CpmIni_ReadWithDocument(path, &document);
    if (status == CPM_INI_OK)
        status = CpmIni_GetDouble(&document, section, key, defaultValue, value);
    else if (value != NULL)
        *value = defaultValue;
    CpmIni_Free(&document);
    return status;
}

int CpmIni_ReadBool(const char *path, const char *section, const char *key, int defaultValue, int *value)
{
    CpmIniDocument document;
    int status = CpmIni_ReadWithDocument(path, &document);
    if (status == CPM_INI_OK)
        status = CpmIni_GetBool(&document, section, key, defaultValue, value);
    else if (value != NULL)
        *value = defaultValue ? 1 : 0;
    CpmIni_Free(&document);
    return status;
}

static int CpmIni_LoadForWrite(const char *path, CpmIniDocument *document)
{
    FILE *probe;
    int status;
    CpmIni_Init(document);
    probe = fopen(path, "rb");
    if (probe == NULL)
        return CPM_INI_OK;
    fclose(probe);
    status = CpmIni_Load(document, path);
    return status;
}

static int CpmIni_WritePrepared(const char *path, CpmIniDocument *document, int setStatus)
{
    int status = setStatus;
    if (status == CPM_INI_OK)
        status = CpmIni_Save(document, path);
    CpmIni_Free(document);
    return status;
}

int CpmIni_WriteString(const char *path, const char *section, const char *key, const char *value)
{
    CpmIniDocument document;
    int status;
    if (path == NULL || key == NULL || value == NULL)
        return CPM_INI_ERR_ARGUMENT;
    status = CpmIni_LoadForWrite(path, &document);
    if (status == CPM_INI_OK)
        status = CpmIni_SetString(&document, section, key, value);
    return CpmIni_WritePrepared(path, &document, status);
}

int CpmIni_WriteInt(const char *path, const char *section, const char *key, int value)
{
    CpmIniDocument document;
    int status;
    if (path == NULL || key == NULL)
        return CPM_INI_ERR_ARGUMENT;
    status = CpmIni_LoadForWrite(path, &document);
    if (status == CPM_INI_OK)
        status = CpmIni_SetInt(&document, section, key, value);
    return CpmIni_WritePrepared(path, &document, status);
}

int CpmIni_WriteInt64(const char *path, const char *section, const char *key, int64_t value)
{
    CpmIniDocument document;
    int status;
    if (path == NULL || key == NULL)
        return CPM_INI_ERR_ARGUMENT;
    status = CpmIni_LoadForWrite(path, &document);
    if (status == CPM_INI_OK)
        status = CpmIni_SetInt64(&document, section, key, value);
    return CpmIni_WritePrepared(path, &document, status);
}

int CpmIni_WriteDouble(const char *path, const char *section, const char *key, double value)
{
    CpmIniDocument document;
    int status;
    if (path == NULL || key == NULL)
        return CPM_INI_ERR_ARGUMENT;
    status = CpmIni_LoadForWrite(path, &document);
    if (status == CPM_INI_OK)
        status = CpmIni_SetDouble(&document, section, key, value);
    return CpmIni_WritePrepared(path, &document, status);
}

int CpmIni_WriteBool(const char *path, const char *section, const char *key, int value)
{
    CpmIniDocument document;
    int status;
    if (path == NULL || key == NULL)
        return CPM_INI_ERR_ARGUMENT;
    status = CpmIni_LoadForWrite(path, &document);
    if (status == CPM_INI_OK)
        status = CpmIni_SetBool(&document, section, key, value);
    return CpmIni_WritePrepared(path, &document, status);
}

const char *CpmIni_StatusString(int status)
{
    switch (status)
    {
        case CPM_INI_OK: return "OK";
        case CPM_INI_NOT_FOUND: return "Not found";
        case CPM_INI_ERR_ARGUMENT: return "Invalid argument";
        case CPM_INI_ERR_IO: return "I/O error";
        case CPM_INI_ERR_MEMORY: return "Out of memory";
        case CPM_INI_ERR_PARSE: return "Parse error";
        case CPM_INI_ERR_RANGE: return "Range/buffer error";
        default: return "Unknown INI status";
    }
}
