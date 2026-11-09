# CPM C INI bundle

Dependency-free INI parser/writer for C projects.

## Files

- `cpm_ini.c` / `cpm_ini.h`: parser, typed accessors, editing and save API.
- `example.ini`: example with root keys and multiple sections.

## Typical use

```c
#include "cpm_ini.h"
#include <stdio.h>

int main(void)
{
    CpmIniDocument ini;
    char port[64];
    int baudrate = 9600;
    int logging = 0;

    CpmIni_Init(&ini);
    if (CpmIni_Load(&ini, "config.ini") != CPM_INI_OK)
    {
        CpmIni_Free(&ini);
        return 1;
    }

    CpmIni_GetString(&ini, "serial", "port", "COM1", port, sizeof(port));
    CpmIni_GetInt(&ini, "serial", "baudrate", 9600, &baudrate);
    CpmIni_GetBool(&ini, "features", "logging", 0, &logging);

    printf("port=%s baudrate=%d logging=%d\n", port, baudrate, logging);
    CpmIni_Free(&ini);
    return 0;
}
```

For one value, the document object is optional:

```c
char host[128];
CpmIni_ReadString("config.ini", "network", "host", "127.0.0.1", host, sizeof(host));
```

To modify and save:

```c
CpmIniDocument ini;
CpmIni_Init(&ini);
CpmIni_Load(&ini, "config.ini");
CpmIni_SetInt(&ini, "network", "port", 5025);
CpmIni_SetBool(&ini, "features", "logging", 1);
CpmIni_Save(&ini, "config.ini");
CpmIni_Free(&ini);
```

## Parsing rules

- Sections use `[section]` syntax.
- `;` and `#` start full-line comments.
- The first `=` separates the key from the value, so values may contain additional `=` characters.
- UTF-8 BOM is accepted.
- Double-quoted values support `\\n`, `\\r`, `\\t`, `\\\\` and `\\"` escapes.
- Key/section comparisons are case-insensitive by default.
- Root keys before the first section are supported using an empty section name (`""`).

## Save behavior

`CpmIni_Save()` writes a normalized INI file from the in-memory document. It preserves values, sections and keys, but intentionally does not preserve original comments or whitespace formatting.
