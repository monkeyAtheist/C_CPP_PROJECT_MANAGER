# CPM_Utility C++ bundle

This bundle replaces the older MY_Util / cpm_util split.  It is the canonical C++ utility layer for CPM generated projects.

## Files

- `cpm_utility.h`
- `cpm_utility.cpp`
- `utility.ini`

## Main features

- executable path and executable directory helpers;
- filesystem helpers based on `std::filesystem`;
- text file read/write/append helpers;
- timestamp, date, time, delay and stopwatch helpers;
- environment-variable helper;
- string formatting/parsing helpers;
- simple INI reader with typed accessors;
- simple matrix/vector helpers inherited from the previous utility bundle;
- formatted error-log block helpers.

## Minimal example

```cpp
#include "cpm_utility.h"

int main()
{
    const auto appDir = cpm_utility::getExecutableDirectory();
    const auto logDir = appDir / "logs";
    cpm_utility::ensure_directory(logDir);

    cpm_utility::Stopwatch timer;
    cpm_utility::sleep_ms(50);

    cpm_utility::append_text_file(
        logDir / "app.log",
        cpm_utility::now_timestamp("%Y-%m-%d %H:%M:%S") +
        " elapsed_ms=" + std::to_string(timer.elapsed_ms()) + "
");

    return 0;
}
```

The legacy namespace alias `jc_utility` is still available for source compatibility, but new code should use `cpm_utility`.


## CPM_String helper

`CPM_String` is a small `std::string`-compatible helper added by CPM_Utility. It keeps the existing `MyString` alias for compatibility, but new code should prefer `CPM_String`.

```cpp
#include "cpm_utility.h"

using cpm_utility::CPM_String;
using namespace cpm_utility::literals;

CPM_String lineA = CPM_String("=") * 10;
CPM_String lineB = 10 * CPM_String("-");
CPM_String lineC = "*"_cpm * 8;
CPM_String lineD = cpm_utility::repeat("//", 4);

CPM_String lineE = "abc"_cpm;
lineE += "def";  // "abcdef"
lineE *= 2;      // "abcdefabcdef"
lineE ^= 2;      // compatibility alias for *=

```

C++ cannot overload the exact expression `"=" * 10` because a string literal is not a user-defined type. Use `CPM_String("=") * 10`, `10 * CPM_String("=")`, or `"="_cpm * 10`.
