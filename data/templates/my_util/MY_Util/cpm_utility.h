/**
 * @file cpm_utility.h
 * @brief C++ generic CPM_Utility helper API.
 *
 * @details
 * This bundle is intended to be readable immediately after insertion into a
 * CPM project. It groups helpers that are frequently needed in small C++
 * programs: INI loading, strings, filesystem operations, executable location,
 * environment variables, timestamps, timing helpers and simple text-file I/O.
 *
 * @par Main features
 * - reads simple INI files with typed accessors;
 * - retrieves the executable path and executable directory as std::filesystem::path;
 * - creates folders and checks file/directory existence;
 * - reads, writes and appends text files;
 * - provides common string helpers: trim, case conversion, split, join,
 *   startsWith, endsWith, contains and replaceAll;
 * - provides CPM_String, a std::string-compatible helper with repeat and sequence-removal operators;
 * - reads environment variables and formats timestamps;
 * - provides delay helpers, Unix timestamps and a small stopwatch for elapsed-time measurements;
 * - keeps simple matrix/vector helpers for small mathematical utilities.
 *
 * @par Typical applications
 * - loading a configuration file stored next to the executable;
 * - locating scripts, resources, DLLs or logs relative to the executable;
 * - creating output/log directories before writing reports;
 * - sharing compact utility code between generated C++ bundles.
 *
 * @par Usage notes
 * - This header requires C++17 because it uses std::filesystem.
 * - On Windows, getExecutablePath() uses GetModuleFileNameW and supports paths
 *   longer than MAX_PATH by growing the internal buffer.
 * - For transport-specific work, prefer the dedicated Communication modules.
 *
 * @par Example of use
 * @code{.cpp}
 * #include "cpm_utility.h"
 *
 * namespace fs = std::filesystem;
 *
 * fs::path appDir = cpm_utility::getExecutableDirectory();
 * fs::path logDir = appDir / "logs";
 * cpm_utility::ensure_directory(logDir);
 *
 * cpm_utility::iniReader ini;
 * if (ini.load((appDir / "utility.ini").string()))
 * {
 *     int timeoutMs = ini.getOr<int>("app", "timeout_ms", 1000);
 *     cpm_utility::Stopwatch timer;
 *     cpm_utility::sleep_ms(10);
 *     using namespace cpm_utility::literals;
 *     cpm_utility::CPM_String separator = "="_cpm * 72;
 *     cpm_utility::append_text_file(logDir / "app.log",
 *         separator + "\n" +
 *         cpm_utility::now_timestamp() + " timeout=" + std::to_string(timeoutMs) +
 *         " elapsed_ms=" + std::to_string(timer.elapsed_ms()) + "\n");
 * }
 * @endcode
 */
#pragma once

#include <algorithm>
#include <cctype>
#include <chrono>
#include <cstdint>
#include <cstdlib>
#include <ctime>
#include <filesystem>
#include <fstream>
#include <iomanip>
#include <cmath>
#include <iostream>
#include <sstream>
#include <stdexcept>
#include <string>
#include <system_error>
#include <thread>
#include <type_traits>
#include <unordered_map>
#include <utility>
#include <vector>
#if defined(_WIN32)
#include <windows.h>
#elif defined(__APPLE__)
#include <mach-o/dyld.h>
#include <limits.h>
#include <unistd.h>
#else
#include <limits.h>
#include <unistd.h>
#endif

using UINT32 = std::uint32_t;
#ifndef MACRO_min
#define MACRO_min(a,b) (((a) < (b)) ? (a) : (b))
#endif
#ifndef MACRO_max
#define MACRO_max(a,b) (((a) > (b)) ? (a) : (b))
#endif
#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

namespace cpm_utility
{
    namespace fs = std::filesystem;

//******************************* Date and time ********************************
namespace time{
    struct DateTime {
        int year, month, day, hour, minute, second;
    };

    /** @brief Returns a timestamp formatted with strftime syntax. 
     * @param format The format string for strftime. If nullptr, defaults to "%d-%m-%Y %H-%M-%S".
     * @return A string representing the current local date and time formatted according to the specified format.
    */
    std::string now_timestamp(const char* format = "%d-%m-%Y %H-%M-%S");

    /** @brief Returns current local date/time fields. 
     * @return A DateTime struct containing the current local date and time fields.
    */
    DateTime now_fields();

    /** @brief Sleeps for a specified number of milliseconds.
     * @param milliseconds The number of milliseconds to sleep.
    */
    void sleep_ms(unsigned int milliseconds);

    /** @brief Sleeps for a specified number of microseconds.
     * @param microseconds The number of microseconds to sleep.
    */
    void sleep_us(unsigned int microseconds);

    /** @brief Sleeps for a specified number of seconds.
     * @param seconds The number of seconds to sleep.
    */
    void sleep_s(double seconds);

    /** @brief Returns the current Unix timestamp in seconds. */
    std::int64_t unix_timestamp_seconds();

    /** @brief Returns the current Unix timestamp in milliseconds. */
    std::int64_t unix_timestamp_milliseconds();

    /** @brief Returns a compact date string using the format YYYY-MM-DD. */
    std::string date_string();

    /** @brief Returns a compact time string using the format HH:MM:SS. */
    std::string time_string();

    using SteadyClock = std::chrono::steady_clock;
    using TimePoint = SteadyClock::time_point;

    /** @brief Captures a monotonic time point suitable for elapsed-time measurement. */
    TimePoint tick();

    /** @brief Returns elapsed milliseconds since a monotonic start point. */
    std::int64_t elapsed_ms(TimePoint start);

    /** @brief Returns elapsed microseconds since a monotonic start point. */
    std::int64_t elapsed_us(TimePoint start);

    /** @brief Returns elapsed seconds since a monotonic start point. */
    double elapsed_seconds(TimePoint start);

    /** @brief Small RAII-style stopwatch for profiling build, acquisition or test sections. */
    class Stopwatch
    {
    public:
        Stopwatch();
        void reset();
        std::int64_t elapsed_ms() const;
        std::int64_t elapsed_us() const;
        double elapsed_seconds() const;
    private:
        TimePoint start_;
    };
}
//==============================================================================


//************************************ Path ************************************
namespace path{
    /** @brief Returns the full path of the running executable. 
     * @return A std::filesystem::path representing the full path to the running executable.
    */
    fs::path getExecutablePath();

    /** @brief Returns the directory that contains the running executable. 
     * @return A std::filesystem::path representing the directory containing the running executable.
    */
    fs::path getExecutableDirectory();

    /** @brief Returns the executable directory as a std::string. 
     * @return A std::string representing the directory containing the running executable.
    */
    std::string getExecutableDirectoryString();

    /** @brief Compatibility alias for getExecutablePath(). 
     * @return A std::filesystem::path representing the full path to the running executable.
    */
    fs::path executable_path();

    /** @brief Compatibility alias for getExecutableDirectory(). 
     * @return A std::filesystem::path representing the directory containing the running executable.
    */
    fs::path executable_dir();

    /** @brief Returns the current working directory. 
     * @return A std::filesystem::path representing the current working directory.
    */
    fs::path current_working_directory();

    /** @brief Converts a relative path to an absolute path.
     * @param pathValue The relative path to convert.
     * @return A std::filesystem::path representing the absolute path.
    */
    fs::path absolute_path(const fs::path& pathValue);

    /** @brief Normalizes a path by resolving any relative components.
     * @param pathValue The path to normalize.
     * @return A std::filesystem::path representing the normalized path.
    */
    fs::path normalize_path(const fs::path& pathValue);

    /** @brief Checks if a path exists.
     * @param pathValue The path to check.
     * @return true if the path exists, false otherwise.
    */
    bool path_exists(const fs::path& pathValue);

    /** @brief Checks if a file exists.
     * @param pathValue The path to check.
     * @return true if the file exists, false otherwise.
    */
    bool file_exists(const fs::path& pathValue);

    /** @brief Checks if a directory exists.
     * @param pathValue The path to check.
     * @return true if the directory exists, false otherwise.
    */
    bool directory_exists(const fs::path& pathValue);

    /** @brief Ensures that a directory exists.
     * @param directoryPath The path to the directory to check.
     * @return true if the directory exists or was created, false otherwise.
    */
    bool ensure_directory(const fs::path& directoryPath);
}
//==============================================================================


/********************** Files ***********************/
namespace files{
    /** @brief Reads the contents of a text file.
     * @param filePath The path to the file to read.
     * @param contents The string to store the file contents in.
     * @return true if the file was read successfully, false otherwise.
    */
    bool read_text_file(const fs::path& filePath, std::string& contents);

    /** @brief Writes the contents of a text file.
     * @param filePath The path to the file to write.
     * @param contents The string containing the contents to write.
     * @param append If true, appends to the file instead of overwriting it.
     * @return true if the file was written successfully, false otherwise.
    */
    bool write_text_file(const fs::path& filePath, const std::string& contents, bool append = false);

    /** @brief Appends the contents of a text file.
     * @param filePath The path to the file to append to.
     * @param contents The string containing the contents to append.
     * @return true if the file was appended successfully, false otherwise.
    */
    bool append_text_file(const fs::path& filePath, const std::string& contents);

    /** @brief Creates a safe filename by replacing invalid characters.
     * @param text The original filename.
     * @param replacement The character to replace invalid characters with.
     * @return A string representing the safe filename.
    */
    std::string safe_filename(std::string text, char replacement = '_');

    /** @brief Creates an error log block.
     * @param code The error code.
     * @param msg The error message.
     * @param file The file where the error occurred.
     * @param line The line where the error occurred.
     * @param functionName The name of the function where the error occurred.
     * @return A string representing the error log block.
    */
    std::string make_error_log_block(int code, const std::string& msg, const char* file = nullptr, int line = 0, const char* functionName = nullptr);

    /** @brief Appends an error log entry to a file.
     * @param path The path to the error log file.
     * @param code The error code.
     * @param msg The error message.
     * @param file The file where the error occurred.
     * @param line The line where the error occurred.
     * @param functionName The name of the function where the error occurred.
    */
    void append_error_log(const std::string& path, int code, const std::string& msg, const char* file, int line, const char* functionName);

    /** @brief Appends an error log entry to a file.
     * @param path The path to the error log file.
     * @param code The error code.
     * @param msg The error message.
    */
    void append_error_log(const std::string& path, int code, const std::string& msg);
}
/****************************************************/


//*********************** Format, parsing and arguments *************************

namespace format{
    /** @brief Trims whitespace from the beginning and end of a string.
     * @param text The string to trim.
     * @return The trimmed string.
     */
    std::string trim(std::string text);
    
    /** @brief Converts a string to lowercase.
     * @param text The string to convert.
     * @return The converted string.
     */
    std::string toLower(std::string text);

    /** @brief Converts a string to uppercase.
     * @param text The string to convert.
     * @return The converted string.
     */
    std::string toUpper(std::string text);

    /** @brief Extracts an integer from a string at the specified position.
     * @param s The string to extract from.
     * @param pos The position in the string to start extracting from.
     * @param defaultValue The default value to return if extraction fails.
     * @return The extracted integer or the default value.
    */
    int extract_int(const std::string& s, size_t& pos, int defaultValue = 0);

    /** @brief Extracts a float from a string at the specified position.
     * @param s The string to extract from.
     * @param pos The position in the string to start extracting from.
     * @param defaultValue The default value to return if extraction fails.
     * @return The extracted float or the default value.
    */
    float extract_float(const std::string& s, size_t& pos, float defaultValue = 0.0f);

    /** @brief Extracts a double from a string at the specified position.
     * @param s The string to extract from.
     * @param pos The position in the string to start extracting from.
     * @param defaultValue The default value to return if extraction fails.
     * @return The extracted double or the default value.
    */
    double extract_double(const std::string& s, size_t& pos, double defaultValue = 0.0);

    /** @brief Extracts a string from a string at the specified position.
     * @param s The string to extract from.
     * @param pos The position in the string to start extracting from.
     * @param defaultValue The default value to return if extraction fails.
     * @return The extracted string or the default value.
    */
    std::string extract_string(const std::string& s, size_t& pos, const std::string& defaultValue = "");

    /** @brief Extracts a hexadecimal integer from a string at the specified position.
     * @param s The string to extract from.
     * @param pos The position in the string to start extracting from.
     * @param defaultValue The default value to return if extraction fails.
     * @return The extracted hexadecimal integer or the default value.
    */
    int extract_hexa(const std::string& s, size_t& pos, int defaultValue = 0);

    /** @brief Extracts a token from a string at the specified position.
     * @param s The string to extract from.
     * @param pos The position in the string to start extracting from.
     * @param separators The characters that separate tokens.
     * @param defaultValue The default value to return if extraction fails.
     * @return The extracted token or the default value.
    */
    std::string extract_token(const std::string& s, size_t& pos, const std::string& separators = " \t", const std::string& defaultValue = "");

    /** @brief Extracts a binary sequence from a string at the specified position.
     * @param s The string to extract from.
     * @param pos The position in the string to start extracting from.
     * @param out The output vector to store the result in.
     * @param separators The characters that separate binary sequences.
     * @param defaultValue The default value to return if extraction fails.
     * @return The extracted binary sequence or the default value.
    */
    std::string extractBinary(const std::string& s, size_t& pos, std::vector<uint8_t>& out, const std::string& separators = " \t", const std::string& defaultValue = "");

    /** @brief Converts a decimal value to a hexadecimal string.
     * @param decimalValue The decimal value to convert.
     * @return The hexadecimal string.
    */
    std::string convertToHexadecimal(double decimalValue);

    /** @brief Parses an unsigned 32-bit integer written in decimal or 0x-prefixed hexadecimal. 
     *  @param s The string to parse.
     *  @param out The output variable to store the result in.
     *  @return true if the string was successfully parsed, false otherwise.
    */
    bool parseHexU32(const std::string& s, uint32_t& out);

    /** @brief Legacy helper kept for compatibility. Returns 0 on success. 
     * @param s The string to parse.
     * @param out The output variable to store the result in.
     * @return 0 on success, -10 on failure.
    */
    int xstoi(const std::string& s, UINT32& out);

    /** @brief Removes leading and trailing whitespace from a string copy. 
     *  @param s The string to trim.
     *  @return A new string with leading and trailing whitespace removed.
    */
    std::string trim_copy(std::string s);

    /** @brief Converts a string copy to lowercase. 
     *  @param s The string to convert.
     *  @return A new string in lowercase.
    */
    std::string toLower_copy(std::string s);

    /** @brief Converts a string copy to uppercase. 
     * @param s The string to convert.
     * @return A new string in uppercase.
    */
    std::string toUpper_copy(std::string s);

    /** @brief Checks if a string starts with a given prefix. 
     * @param text The string to check.
     * @param prefix The prefix to look for.
     * @return true if text starts with prefix, false otherwise.
    */
    bool starts_with(const std::string& text, const std::string& prefix);

    /** @brief Checks if a string ends with a given suffix. 
     * @param text The string to check.
     * @param suffix The suffix to look for.
     * @return true if text ends with suffix, false otherwise.
    */
    bool ends_with(const std::string& text, const std::string& suffix);

    /** @brief Checks if a string contains a given substring. 
     * @param text The string to check.
     * @param needle The substring to look for.
     * @return true if text contains needle, false otherwise.
    */
    bool contains(const std::string& text, const std::string& needle);

    /** @brief Replaces all occurrences of a substring with another substring in a string copy. 
     * @param text The string to modify.
     * @param from The substring to replace.
     * @param to The substring to replace with.
     * @return A new string with all occurrences of from replaced by to.
    */
    std::string replace_all(std::string text, const std::string& from, const std::string& to);

    /** @brief Splits a string into a vector of strings using a separator character. 
     * @param text The string to split.
     * @param separator The character to use as a separator.
     * @param keepEmpty If true, empty strings between separators are kept; if false, they are discarded.
     * @return A vector of strings resulting from the split operation.
    */
    std::vector<std::string> split(const std::string& text, char separator, bool keepEmpty = false);

    /** @brief Joins a vector of strings into a single string using a separator.
     * @param items The vector of strings to join.
     * @param separator The string to insert between each item.
     * @return A single string resulting from the join operation.
    */
    std::string join(const std::vector<std::string>& items, const std::string& separator);
}

//==============================================================================


//******************************* Environnement ********************************
namespace env{
    /** @brief Gets the value of an environment variable.
     * @param name The name of the environment variable.
     * @param fallback The value to return if the environment variable is not found.
     * @return The value of the environment variable, or the fallback value if it is not found.
    */
    std::string get_env(const std::string& name, const std::string& fallback = "");
}
//==============================================================================


/*
  ////  //        //      ////    ////
//      //      //  //  //      //
//      //      //////    //      //
//      //      //  //      //      //
  ////  //////  //  //  ////    ////
*/


    /** @brief A simple INI file reader. 
     *  This class provides a simple way to read configuration values from an INI file.
     *  It supports sections and key-value pairs.
     *  @tparam T The type of the value to be read.
     *  @note This class is not thread-safe.
    */
    class iniReader
    {
    public:
        /** @brief Parses all sections and key/value pairs from an INI file. */
        bool load(const std::string& path);

        /** @brief Reads a typed value. Returns false when missing or conversion fails. 
         *  @param section The section to look in.
         *  @param key The key to look for.
         *  @param out The output variable to store the result in.
         *  @return true if the value was found and converted successfully, false otherwise.
        */
        bool has(const std::string& section, const std::string& key) const;

        /** @brief Reads a typed value. Returns false when missing or conversion fails. 
         *  @param section The section to look in.
         *  @param key The key to look for.
         *  @param out The output variable to store the result in.
         *  @return true if the value was found and converted successfully, false otherwise.
        */
        template<typename T>
        bool get(const std::string& section, const std::string& key, T& out) const;

        /** @brief Reads a typed value or returns the supplied default value. 
         * @param section The section to look in.
         * @param key The key to look for.
         * @param def The default value to return if the key is not found or conversion fails.
         * @return The value associated with the key, or the default value if not found or conversion fails.
        */
        template<typename T>
        T getOr(const std::string& section, const std::string& key, const T& def) const;

    private:
        std::unordered_map<std::string, std::unordered_map<std::string, std::string>> data_;

        static std::string trim_(std::string s);
        static std::string toLower_(std::string s);
        static bool parseBool_(const std::string& s, bool& out);

        template<typename T>
        bool convert_(const std::string& s, T& out);

        const std::string* findValue_(const std::string& section, const std::string& key) const;
    };

    /**
     * @brief Small std::string-compatible helper used by CPM_Utility.
     *
     * CPM_String derives from std::string for convenience in compact generated
     * projects. It adds fluent formatting helpers and repeat operators:
     *
     * @code{.cpp}
     * using cpm_utility::CPM_String;
     * using namespace cpm_utility::literals;
     *
     * CPM_String a = CPM_String("=") * 10;  // "=========="
     * CPM_String b = 10 * CPM_String("-");  // "----------"
     * CPM_String c = "*"_cpm * 8;           // "********"
     * CPM_String d = cpm_utility::repeat("//", 4); // "////////"
     *
     * CPM_String e = "abc"_cpm;
     * e += "def";   // "abcdef"
     * e *= 2;       // "abcdefabcdef"
     * e ^= 2;       // compatibility alias for *=
     * e -= "abc";  // "defdef"
     *
     * CPM_String sentence = "bonjour ça va ?"_cpm;
     * sentence -= "bonjour";  // "ça va ?" (leading/trailing whitespace is trimmed)
     * @endcode
     *
     * @note C++ cannot overload the exact expression "=" * 10 because the left
     * operand is a string literal, not a user-defined type. Use CPM_String("=")
     * * 10 or the "="_cpm literal instead.
     */
    class CPM_String : public std::string
    {
    public:
        using std::string::string;

        CPM_String() = default;
        CPM_String(const std::string& value);
        CPM_String(std::string&& value) noexcept;
        CPM_String(const char* value);
        CPM_String(char value);

        /** @brief Removes leading/trailing whitespace and replaces internal whitespace with underscores. */
        CPM_String& trim();

        /** @brief Returns a trimmed copy without modifying this instance. */
        CPM_String trimmed() const;

        /** @brief Returns the underlying std::string. */
        std::string toStdString() const { return *this; }

        /** @brief Copies a std::string to this CPM_String. */
        void fromStdString(const std::string& s);

        /** @brief Concatenates a std::string and returns a CPM_String. */
        CPM_String operator+(const std::string& s) const;

        /** @brief Concatenates a C string and returns a CPM_String. */
        CPM_String operator+(const char* s) const;

        /** @brief Removes all occurrences of a std::string sequence and returns a CPM_String. */
        CPM_String operator-(const std::string& sequence) const;

        /** @brief Removes all occurrences of a C string sequence and returns a CPM_String. */
        CPM_String operator-(const char* sequence) const;

        /** @brief Removes all occurrences of one character and returns a CPM_String. */
        CPM_String operator-(char c) const;

        /** @brief Appends a std::string and keeps the CPM_String return type. */
        CPM_String& operator+=(const std::string& s);

        /** @brief Appends a C string and keeps the CPM_String return type. */
        CPM_String& operator+=(const char* s);

        /** @brief Appends one character and keeps the CPM_String return type. */
        CPM_String& operator+=(char c);

        /** @brief Removes all occurrences of a std::string sequence in-place. */
        CPM_String& operator-=(const std::string& sequence);

        /** @brief Removes all occurrences of a C string sequence in-place. */
        CPM_String& operator-=(const char* sequence);

        /** @brief Removes all occurrences of one character in-place. */
        CPM_String& operator-=(char c);

        /** @brief Removes all occurrences of a sequence in-place, then trims leading/trailing whitespace. */
        CPM_String& remove_all_in_place(const std::string& sequence);

        /** @brief Returns a copy with all occurrences of a sequence removed. */
        CPM_String removed_all(const std::string& sequence) const;

        /** @brief Trims only leading and trailing whitespace, preserving internal spaces. */
        CPM_String& trim_edges();

        /** @brief Returns a copy trimmed only at the leading/trailing edges. */
        CPM_String trim_edges_copy() const;

        /** @brief Repeats this string count times and returns a CPM_String. */
        CPM_String operator*(std::size_t count) const;

        /** @brief Compatibility repeat operator, equivalent to operator*. */
        CPM_String operator^(std::size_t count) const;

        /** @brief In-place repetition operator. */
        CPM_String& operator*=(std::size_t count);

        /** @brief In-place compatibility repetition operator, equivalent to operator*=. */
        CPM_String& operator^=(std::size_t count);

        /** @brief Replaces this string with its repeated content. */
        CPM_String& repeat_in_place(std::size_t count);

        /** @brief Creates a repeated string from any std::string-compatible value. */
        static CPM_String repeat(const std::string& text, std::size_t count);
    };

    /** @brief Compatibility alias for older MY_Util/MyString-based code. */
    using MyString = CPM_String;

    /** @brief Alternative compact alias. */
    using CPMString = CPM_String;

    /** @brief Repeats a CPM_String with the integer on the left side. */
    CPM_String operator*(std::size_t count, const CPM_String& text);

    /** @brief Repeats a std::string and returns a CPM_String. */
    CPM_String operator*(const std::string& text, std::size_t count);

    /** @brief Repeats text count times and returns a CPM_String. */
    CPM_String repeat(const std::string& text, std::size_t count);

    namespace literals
    {
        /** @brief User-defined literal returning CPM_String. Usage: "="_cpm * 10. */
        CPM_String operator"" _cpm(const char* text, std::size_t size);

        /** @brief Explicit literal alias. Usage: "="_cpmstr * 10. */
        CPM_String operator"" _cpmstr(const char* text, std::size_t size);
    }





//***************************** MATRICE AND VECTOR *****************************
//==============================================================================

#ifndef _x
#define _x 0
#endif
#ifndef _y
#define _y 1
#endif
#ifndef _z
#define _z 2
#endif

/** @brief A class representing a matrix.
 * This class provides functionality for creating, manipulating, and performing operations on matrices.
 * @note This class is designed for educational purposes and may not be optimized for performance.
 * @details
 * The matrice class supports basic matrix operations such as addition, subtraction, multiplication, and inversion.
 * It also provides methods for accessing individual elements, rows, and columns, as well as calculating the determinant, cofactor matrix, transpose, adjugate matrix, and inverse matrix.
 * The matrix is stored in a one-dimensional vector in row-major order.
 * @warning The class does not perform bounds checking for all operations, so users should ensure that indices are valid when accessing elements.
 * @tparam T The type of the elements in the matrix. Currently, it is assumed to be double for most operations.
 */
class matrice
{
public:
    matrice(unsigned char row, unsigned char col) : _row(row), _col(col) 
    {
        this->_isSquare = (row==col); 
        //this->_item.resize(_col * _row, 0);
        try{
            this->_item.reserve(_col * _row);
            for(int i = 0; i < _col * _row; i++)    
            {
                this->_item.push_back((i+1) *  std::rand() / RAND_MAX); // Fill with random values between 0 and 1
            }
        }
        catch(const std::bad_alloc& e)
        {
            std::cerr << "Allocation failed: " << e.what() << std::endl;
        }
    };
    ~matrice();

    template<typename T>
    void printMatrice(T &txt);
    double determinant(matrice mat);
    std::vector<double> cofactorMatrix(matrice mat);
    std::vector<double> transpose(matrice mat);
    std::vector<double> adjugateMatrix(matrice mat);
    std::vector<double> inverseMatrix(matrice mat);

//********************************** Getters **********************************
    double getItem(unsigned char row, unsigned char col) const {
        if (row >= _row || col >= _col) {
            throw std::out_of_range("Row or column index out of range.");
        }
        return _item[row * _col + col];
    }
    bool isSquare() const {return _isSquare;}
    unsigned char getRow() const {return _row;}
    unsigned char getCol() const {return _col;}
    std::vector<double> getItemVector() const { return _item; }
    std::vector<double>& getItemVectorRef() { return _item; }  // Return a reference to the vector
    std::vector<double> getRowVector(unsigned char row) const {
        if (row >= _row) {
            throw std::out_of_range("Row index out of range.");
        }
        std::vector<double> rowVector(_col);
        for (unsigned char col = 0; col < _col; ++col) {
            rowVector[col] = _item[row * _col + col];
        }
        return rowVector;
    }
    std::vector<double> getColVector(unsigned char col) const {
        if (col >= _col) {
            throw std::out_of_range("Column index out of range.");
        }
        std::vector<double> colVector(_row);
        for (unsigned char row = 0; row < _row; ++row) {
            colVector[row] = _item[row * _col + col];
        }
        return colVector;
    }
    matrice getSubMatrix(unsigned char excludeRow, unsigned char excludeCol) const {
        if (excludeRow >= _row || excludeCol >= _col) {
            throw std::out_of_range("Row or column index out of range.");
        }
        matrice subMatrix(_row - 1, _col - 1);
        unsigned char subRow = 0;
        for (unsigned char row = 0; row < _row; ++row) {
            if (row == excludeRow) continue;
            unsigned char subCol = 0;
            for (unsigned char col = 0; col < _col; ++col) {
                if (col == excludeCol) continue;
                subMatrix.setItem(subRow, subCol, _item[row * _col + col]);
                ++subCol;
            }
            ++subRow;
        }
        return subMatrix;
    }
    matrice getTranspose() {
        matrice transposed(_col, _row);
        for (unsigned char row = 0; row < _row; ++row) {
            for (unsigned char col = 0; col < _col; ++col) {
                transposed.setItem(col, row, _item[row * _col + col]);
            }
        }
        return transposed;
    }
    matrice getAdjugate() {
        matrice adjugate(_row, _col);
        std::vector<double> cofactor = cofactorMatrix(*this);
        for (unsigned char row = 0; row < _row; ++row) {
            for (unsigned char col = 0; col < _col; ++col) {
                adjugate.setItem(col, row, cofactor[row * _col + col]); // Transpose
            }
        }
        return adjugate;
    }
    matrice getInverse() {
        double Determinant = determinant(*this);
        if (Determinant == 0) {
            throw std::logic_error("Matrix is singular and cannot be inverted.");
        }
        matrice adjugate = getAdjugate();
        matrice adjugateTransposed(_row, _col);
        matrice inverse(_row, _col);
        inverse = adjugate.getTranspose();
        inverse*= (1.0 / Determinant);
        return inverse;
    }

    double getDeterminant() {
        return determinant(*this);
    }

    matrice getcofactorMatrix() {
        std::vector<double> cofactor = cofactorMatrix(*this);
        matrice cofactorMat(_row, _col);
        for (unsigned char row = 0; row < _row; ++row) {
            for (unsigned char col = 0; col < _col; ++col) {
                cofactorMat.setItem(row, col, cofactor[row * _col + col]);
            }
        }
        return cofactorMat;
    }
//==============================================================================

//********************************** Setters **********************************
    double setItem(unsigned char row, unsigned char col, double value) {
        if (row >= _row || col >= _col) {
            throw std::out_of_range("Row or column index out of range.");
        }
        _item[row * _col + col] = value;
        return value;
    }

    double setItem(unsigned char index, double value) {
        if (index >= _item.size()) {
            throw std::out_of_range("Index out of range.");
        }
        _item[index] = value;
        return value;
    }

    double setItemVector(const std::vector<double>& values) {
        if (values.size() != _item.size()) {
            throw std::invalid_argument("Input vector size does not match matrix size.");
        }
        _item = values;
        return 0; // Return 0 to indicate success
    }
//==============================================================================

//********************************** Operator **********************************
    matrice operator+(const matrice& other);
    matrice operator-(const matrice& other);

    template<typename T>
    matrice operator*(const T& scalar);
    matrice operator*(const matrice& other);

    template<typename T>
    matrice operator/(const T& scalar);
    matrice operator/(const matrice& other);
    matrice& operator+=(const matrice& other);
    matrice& operator-=(const matrice& other);

    template<typename T>
    matrice& operator*=(const T& scalar);
    matrice& operator*=(const matrice& other);

    template<typename T>
    matrice& operator/=(const T& scalar);
    matrice& operator/=(const matrice& other);
    matrice operator^(const matrice& other);
//==============================================================================


private:
    std::vector<double> _item;
    bool _isSquare = false;
    unsigned char _row = 0 , _col = 0;
};

/** @brief A class representing a 3D coordinate matrix.
 * This class is used to store and manipulate 3D coordinates in a matrix format.
 * @note The matrix is assumed to be a 3x3 matrix.
 */
class coord3dMatrice
{
    public:
    void initMat();
    ~coord3dMatrice() = default;
    coord3dMatrice() : matRotX(3, 3), matRotY(3, 3), matRotZ(3, 3), matTranslateX(3, 3), matTranslateY(3, 3), matTranslateZ(3, 3), coord(3, 3) {
        this->initMat();
    }
    coord3dMatrice(matrice it) : matRotX(3, 3), matRotY(3, 3), matRotZ(3, 3), matTranslateX(3, 3), matTranslateY(3, 3), matTranslateZ(3, 3), coord(3, 3) {
        this->initMat();
        try{
            if(it.getRow() != 3 || it.getCol() != 3) {
                throw std::invalid_argument("Input matrix must be 3x3.");
            }
            coord = it;
        }
        catch(const std::bad_alloc& e)
        {   
            std::cerr << "Allocation failed: " << e.what() << std::endl;
        }
    }
    coord3dMatrice(std::vector<double> it) : matRotX(3, 3), matRotY(3, 3), matRotZ(3, 3), matTranslateX(3, 3), matTranslateY(3, 3), matTranslateZ(3, 3), coord(3, 3) {
        this->initMat();
        try{
            if(it.size() != 9) {
                throw std::invalid_argument("Input vector size must be 9 for a 3x3 matrix.");
            }
            coord.setItemVector(it);
        }
        catch(const std::bad_alloc& e)
        {
            std::cerr << "Allocation failed: " << e.what() << std::endl;
        }
    }

    /** Setters **/
    void setItemMat(matrice it);

    /** Getteurs **/
    matrice getMatRotX() { return matRotX; }
    matrice getMatRotY() { return matRotY; }
    matrice getMatRotZ() { return matRotZ; }
    matrice getCoord() { return coord; }
    matrice getMatRotXRotatedRad(double angleX) {_rotateXrad(angleX); return matRotX;}
    matrice getMatRotYRotatedRad(double angleY) {_rotateYrad(angleY); return matRotY;}
    matrice getMatRotZRotatedRad(double angleZ) {_rotateZrad(angleZ); return matRotZ;}
    matrice getMatRotXRotatedDeg(double angleX) {_rotateXdeg(angleX); return matRotX;}
    matrice getMatRotYRotatedDeg(double angleY) {_rotateYdeg(angleY); return matRotY;}
    matrice getMatRotZRotatedDeg(double angleZ) {_rotateZdeg(angleZ); return matRotZ;}
    matrice getMatCoordRotatedXrad(double angleX) {return this->getMatRotXRotatedRad(angleX) * coord;}
    matrice getMatCoordRotatedYrad(double angleY) {return this->getMatRotYRotatedRad(angleY) * coord;}
    matrice getMatCoordRotatedZrad(double angleZ) {return this->getMatRotZRotatedRad(angleZ) * coord;}
    matrice getMatCoordRotatedXdeg(double angleX) {return this->getMatRotXRotatedDeg(angleX) * coord;}
    matrice getMatCoordRotatedYdeg(double angleY) {return this->getMatRotYRotatedDeg(angleY) * coord;}
    matrice getMatCoordRotatedZdeg(double angleZ) {return this->getMatRotZRotatedDeg(angleZ) * coord;}
    matrice rotatedMatXrad(matrice mat , double angleX);
    matrice rotateMatYrad(matrice mat , double angleY);
    matrice rotateMatZrad(matrice mat , double angleZ);
    matrice rotatedMatXdeg(matrice mat , double angleX);
    matrice rotateMatYdeg(matrice mat , double angleY);
    matrice rotateMatZdeg(matrice mat , double angleZ);

    matrice getMatCoordTranslatedX(double X) {matTranslateX.setItemVector(std::vector<double>{X, X, X, 0, 0, 0, 0, 0, 0}); return matTranslateX + this->coord;}
    matrice getMatCoordTranslatedY(double Y) {matTranslateY.setItemVector(std::vector<double>{0, 0, 0, Y, Y, Y, 0, 0, 0}); return matTranslateY + this->coord;}
    matrice getMatCoordTranslatedZ(double Z) {matTranslateZ.setItemVector(std::vector<double>{0, 0, 0, 0, 0, 0, Z, Z, Z}); return matTranslateZ + this->coord;}
    matrice translateMatX(matrice mat , double X);
    matrice translateMatY(matrice mat , double Y);
    matrice translateMatZ(matrice mat , double Z);

    private:
    void _rotateXrad(double X);
    void _rotateYrad(double Y);
    void _rotateZrad(double Z);
    void _rotateXdeg(double X);
    void _rotateYdeg(double Y);
    void _rotateZdeg(double Z);
    void _translateX(double X);
    void _translateY(double Y);
    void _translateZ(double Z);
    matrice matRotX, matRotY, matRotZ, matTranslateX, matTranslateY, matTranslateZ;
    matrice coord;
    protected:

};

/** @brief A class representing a 3D vector.
 * This class is used to store and manipulate 3D vectors.
 * @note The vector is assumed to be a 3D vector with x, y, and z components.
 */
class vectorCoord
{
    public:
    vectorCoord(unsigned char szVec);
    vectorCoord(std::vector<double> coord);
    vectorCoord(const vectorCoord &vec) : _coord(vec._coord) {} //Copy construct
    ~vectorCoord() = default;

    /*===================== Operator ========================== */
    vectorCoord operator+(const vectorCoord vec);
    vectorCoord& operator+=(const vectorCoord& vec);
    vectorCoord operator-(const vectorCoord vec);
    vectorCoord& operator-=(const vectorCoord& vec);
    vectorCoord operator*(const double scalar);
    vectorCoord operator*(const vectorCoord vec);
    vectorCoord& operator*=(const double scalar);
    vectorCoord& operator*=(const vectorCoord& vec);
    vectorCoord operator/(const double scalar);
    vectorCoord& operator/=(const double scalar);
    vectorCoord operator^(const double scalar);
    vectorCoord& operator^=(const double scalar);
    vectorCoord operator^(const vectorCoord vec);
    vectorCoord& operator^=(const vectorCoord& vec);
    vectorCoord operator<(const vectorCoord vec);
    vectorCoord& operator<=(const vectorCoord& vec);
    vectorCoord& operator=(const vectorCoord& vec);

    /*===================== Setteurs ========================== */
    void setCoord(std::vector<double> vec) {if(vec.size() < 2 || vec.size() > 3) throw std::invalid_argument("invalid size"); this->_coord = vec;}
    void setXcoord(double x) {this->_coord[_x] = x;}
    void setYcoord(double y) {this->_coord[_y] = y;}
    void setZcoord(double z) {this->_coord[_z] = z;}

    /*===================== Getteurs ========================== */
    std::vector<double> getCoord() const { return _coord; }
    double getNorm() const;
    std::vector<double> getDirection() const;
    std::vector <double> getDirectionAngleRad() const;
    std::vector <double> getDirectionAngleDeg() const;
    double getAngleBetweenVectorsRad(const std::vector<double>& vec) const;
    double getAngleBetweenVectorsDeg(const std::vector<double>& vec) const;
    double getXcoord() const { return _coord[_x]; }
    double getYcoord() const { return _coord[_y]; }
    double getZcoord() const { return _coord[_z]; }

    /*===================== Functions ========================== */
    template<typename T>
    void printVector(T &txt) const;

    private:
    std::vector<double> _coord;
    protected:

};


//******************************* Compatibility API *******************************
// The nested namespaces above are the preferred CPM API. The following wrappers
// keep the old MY_Util-style calls short and keep existing code source-compatible
// after the bundle was renamed to CPM_Utility.
using DateTime = time::DateTime;
using Stopwatch = time::Stopwatch;

std::string now_timestamp(const char* format = "%d-%m-%Y %H-%M-%S");
DateTime now_fields();
void sleep_ms(unsigned int milliseconds);
void sleep_us(unsigned int microseconds);
void sleep_s(double seconds);
std::int64_t unix_timestamp_seconds();
std::int64_t unix_timestamp_milliseconds();
time::TimePoint tick();
std::int64_t elapsed_ms(time::TimePoint start);
double elapsed_seconds(time::TimePoint start);

fs::path getExecutablePath();
fs::path getExecutableDirectory();
std::string getExecutableDirectoryString();
fs::path executable_path();
fs::path executable_dir();
fs::path current_working_directory();
fs::path absolute_path(const fs::path& pathValue);
fs::path normalize_path(const fs::path& pathValue);
bool path_exists(const fs::path& pathValue);
bool file_exists(const fs::path& pathValue);
bool directory_exists(const fs::path& pathValue);
bool ensure_directory(const fs::path& directoryPath);

bool read_text_file(const fs::path& filePath, std::string& contents);
bool write_text_file(const fs::path& filePath, const std::string& contents, bool append = false);
bool append_text_file(const fs::path& filePath, const std::string& contents);
std::string safe_filename(std::string text, char replacement = '_');
std::string make_error_log_block(int code, const std::string& msg, const char* file = nullptr, int line = 0, const char* functionName = nullptr);
void append_error_log(const std::string& path, int code, const std::string& msg, const char* file, int line, const char* functionName);
void append_error_log(const std::string& path, int code, const std::string& msg);

std::string trim_copy(std::string s);
std::string toLower_copy(std::string s);
std::string toUpper_copy(std::string s);
bool starts_with(const std::string& text, const std::string& prefix);
bool ends_with(const std::string& text, const std::string& suffix);
bool contains(const std::string& text, const std::string& needle);
std::string replace_all(std::string text, const std::string& from, const std::string& to);
std::vector<std::string> split(const std::string& text, char separator, bool keepEmpty = false);
std::string join(const std::vector<std::string>& items, const std::string& separator);
std::string get_env(const std::string& name, const std::string& fallback = "");

//******************************* Template definitions *******************************
template<typename T>
bool iniReader::get(const std::string& section, const std::string& key, T& out) const
{
    const std::string* v = findValue_(section, key);
    if (!v) return false;
    return convert_(*v, out);
}

template<typename T>
T iniReader::getOr(const std::string& section, const std::string& key, const T& def) const
{
    T tmp{};
    if (get(section, key, tmp)) return tmp;
    return def;
}

template<typename T>
bool iniReader::convert_(const std::string& s, T& out)
{
    if constexpr (std::is_same_v<T, std::string>) {
        out = s;
        return true;
    }
    else if constexpr (std::is_same_v<T, bool>) {
        return parseBool_(s, out);
    }
    else {
        std::istringstream iss(s);
        iss >> out;
        if (!iss) return false;
        char c;
        if (iss >> c) return false;
        return true;
    }
}

template<typename T>
matrice matrice::operator*(const T& scalar)
{
    matrice result(_row, _col);
    for (std::size_t i = 0; i < _item.size(); ++i) {
        result.getItemVectorRef()[i] = _item[i] * static_cast<double>(scalar);
    }
    return result;
}

template<typename T>
matrice matrice::operator/(const T& scalar)
{
    matrice result(_row, _col);
    for (std::size_t i = 0; i < _item.size(); ++i) {
        result.getItemVectorRef()[i] = _item[i] / static_cast<double>(scalar);
    }
    return result;
}

template<typename T>
matrice& matrice::operator*=(const T& scalar)
{
    for (double& value : _item) {
        value *= static_cast<double>(scalar);
    }
    return *this;
}

template<typename T>
matrice& matrice::operator/=(const T& scalar)
{
    for (double& value : _item) {
        value /= static_cast<double>(scalar);
    }
    return *this;
}

template<typename T>
void matrice::printMatrice(T& txt)
{
    std::string text = " | ";
    try {
        for (int i = 1; i <= this->_row * this->_col; i++) {
            text += std::to_string(this->_item[static_cast<std::size_t>(i - 1)]) + " | ";
            if (!(i % this->_col)) {
                text += '\n';
            }
        }
    }
    catch (const std::out_of_range& e) {
        std::cerr << "Out of range error: " << e.what() << std::endl;
        throw;
    }
    txt << text << '\n';
}

template<typename T>
void vectorCoord::printVector(T& txt) const
{
    txt << std::to_string(_coord[0]) + ", " + std::to_string(_coord[1]) + ", " + std::to_string(_coord[2]) + "\n";
}

} // namespace cpm_utility

namespace jc_utility = cpm_utility;
