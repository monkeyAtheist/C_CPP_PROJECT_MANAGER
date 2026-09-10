/**
 * @file myUtil.h
 * @brief C++ generic MY_Util helper API.
 *
 * @details
 * This bundle is intended to be readable immediately after insertion into a
 * CPM project. It groups helpers that are frequently needed in small C++
 * programs: INI loading, strings, filesystem operations, executable location,
 * environment variables, timestamps and simple text-file I/O.
 *
 * @par Main features
 * - reads simple INI files with typed accessors;
 * - retrieves the executable path and executable directory as std::filesystem::path;
 * - creates folders and checks file/directory existence;
 * - reads, writes and appends text files;
 * - provides common string helpers: trim, case conversion, split, join,
 *   startsWith, endsWith, contains and replaceAll;
 * - reads environment variables and formats timestamps.
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
 * #include "myUtil.h"
 *
 * namespace fs = std::filesystem;
 *
 * fs::path appDir = jc_utility::getExecutableDirectory();
 * fs::path logDir = appDir / "logs";
 * jc_utility::ensure_directory(logDir);
 *
 * jc_utility::iniReader ini;
 * if (ini.load((appDir / "utility.ini").string()))
 * {
 *     int timeoutMs = ini.getOr<int>("app", "timeout_ms", 1000);
 *     jc_utility::append_text_file(logDir / "app.log",
 *         jc_utility::now_timestamp() + " timeout=" + std::to_string(timeoutMs) + "\n");
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
#include <iostream>
#include <math.h>
#include <sstream>
#include <stdexcept>
#include <string>
#include <system_error>
#include <thread>
#include <type_traits>
#include <unordered_map>
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

using UINT32 = uint32_t;

namespace jc_utility
{
    namespace fs = std::filesystem;

    class iniReader
    {
    public:
        /** @brief Parses all sections and key/value pairs from an INI file. */
        bool load(const std::string& path);

        /** @brief Returns true when a section/key pair exists. */
        bool has(const std::string& section, const std::string& key) const;

        /** @brief Reads a typed value. Returns false when missing or conversion fails. */
        template<typename T>
        bool get(const std::string& section, const std::string& key, T& out) const;

        /** @brief Reads a typed value or returns the supplied default value. */
        template<typename T>
        T getOr(const std::string& section, const std::string& key, const T& def) const;

    private:
        std::unordered_map<std::string, std::unordered_map<std::string, std::string>> data_;

        static std::string trim_(std::string s);
        static std::string toLower_(std::string s);
        static bool parseBool_(const std::string& s, bool& out);

        template<typename T>
        static bool convert_(const std::string& s, T& out);

        const std::string* findValue_(const std::string& section, const std::string& key) const;
    };

    class MyString : public std::string
    {
    public:
        using std::string::string;
        MyString() = default;
        MyString(const std::string& value) : std::string(value) {}
        MyString(const char* value) : std::string(value != nullptr ? value : "") {}

        MyString& trim()
        {
            auto notSpace = [](unsigned char c) { return !std::isspace(c); };

            erase(begin(), std::find_if(begin(), end(), notSpace));
            erase(std::find_if(rbegin(), rend(), notSpace).base(), end());

            std::replace_if(begin(), end(),
                [](unsigned char c) { return std::isspace(c); },
                '_');

            return *this;
        }

        std::string toStdString() const { return *this; }

        void fromStdString(const std::string& s)
        {
            this->clear();
            this->append(s);
        }

        MyString operator+(const std::string& s) const
        {
            return MyString(static_cast<const std::string&>(*this) + s);
        }

        MyString operator^(int nb) const
        {
            if (nb <= 0) return MyString(*this);
            MyString result;
            for (int i = 0; i < nb; ++i)
            {
                result += static_cast<const std::string&>(*this);
            }
            return result;
        }
    };

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

    /** @brief Parses an unsigned 32-bit integer written in decimal or 0x-prefixed hexadecimal. */
    inline bool parseHexU32(const std::string& s, uint32_t& out)
    {
        try {
            size_t pos = 0;
            unsigned long v = std::stoul(s, &pos, 0);
            if (pos != s.size()) return false;
            out = static_cast<uint32_t>(v);
            return true;
        }
        catch (...) { return false; }
    }

    /** @brief Legacy helper kept for compatibility. Returns 0 on success. */
    inline int xstoi(const std::string& s, UINT32& out)
    {
        uint32_t value = 0;
        if (!parseHexU32(s, value)) return -10;
        out = value;
        return 0;
    }

    /** @brief Removes leading and trailing whitespace from a string copy. */
    inline std::string trim_copy(std::string s)
    {
        auto notSpace = [](unsigned char c) { return !std::isspace(c); };
        s.erase(s.begin(), std::find_if(s.begin(), s.end(), notSpace));
        s.erase(std::find_if(s.rbegin(), s.rend(), notSpace).base(), s.end());
        return s;
    }

    /** @brief Converts a string copy to lowercase. */
    inline std::string toLower_copy(std::string s)
    {
        std::transform(s.begin(), s.end(), s.begin(),
            [](unsigned char c) { return static_cast<char>(std::tolower(c)); });
        return s;
    }

    /** @brief Converts a string copy to uppercase. */
    inline std::string toUpper_copy(std::string s)
    {
        std::transform(s.begin(), s.end(), s.begin(),
            [](unsigned char c) { return static_cast<char>(std::toupper(c)); });
        return s;
    }

    inline bool starts_with(const std::string& text, const std::string& prefix)
    {
        return text.size() >= prefix.size() && text.compare(0, prefix.size(), prefix) == 0;
    }

    inline bool ends_with(const std::string& text, const std::string& suffix)
    {
        return text.size() >= suffix.size() && text.compare(text.size() - suffix.size(), suffix.size(), suffix) == 0;
    }

    inline bool contains(const std::string& text, const std::string& needle)
    {
        return needle.empty() || text.find(needle) != std::string::npos;
    }

    inline std::string replace_all(std::string text, const std::string& from, const std::string& to)
    {
        if (from.empty()) return text;
        std::size_t pos = 0;
        while ((pos = text.find(from, pos)) != std::string::npos)
        {
            text.replace(pos, from.size(), to);
            pos += to.size();
        }
        return text;
    }

    inline std::vector<std::string> split(const std::string& text, char separator, bool keepEmpty = false)
    {
        std::vector<std::string> items;
        std::string item;
        std::istringstream stream(text);
        while (std::getline(stream, item, separator))
        {
            if (keepEmpty || !item.empty()) items.push_back(item);
        }
        if (keepEmpty && !text.empty() && text.back() == separator) items.emplace_back();
        return items;
    }

    inline std::string join(const std::vector<std::string>& items, const std::string& separator)
    {
        std::ostringstream stream;
        for (std::size_t i = 0; i < items.size(); ++i)
        {
            if (i != 0) stream << separator;
            stream << items[i];
        }
        return stream.str();
    }

    /** @brief Returns a timestamp formatted with strftime syntax. */
    inline std::string now_timestamp(const char* format = "%d-%m-%Y %H-%M-%S")
    {
        std::time_t t = std::time(nullptr);
        std::tm tm{};
#if defined(_WIN32)
        localtime_s(&tm, &t);
#else
        localtime_r(&t, &tm);
#endif
        char buf[64];
        if (std::strftime(buf, sizeof(buf), format != nullptr ? format : "%d-%m-%Y %H-%M-%S", &tm) == 0)
        {
            return {};
        }
        return std::string(buf);
    }

    struct DateTime {
        int year, month, day, hour, minute, second;
    };

    /** @brief Returns current local date/time fields. */
    inline DateTime now_fields()
    {
        std::time_t t = std::time(nullptr);
        std::tm tm{};
#if defined(_WIN32)
        localtime_s(&tm, &t);
#else
        localtime_r(&t, &tm);
#endif
        return { tm.tm_year + 1900, tm.tm_mon + 1, tm.tm_mday, tm.tm_hour, tm.tm_min, tm.tm_sec };
    }

    /** @brief Returns the full path of the running executable. */
    inline fs::path getExecutablePath()
    {
#if defined(_WIN32)
        std::wstring buffer(MAX_PATH, L'\0');
        for (;;)
        {
            DWORD length = GetModuleFileNameW(nullptr, buffer.data(), static_cast<DWORD>(buffer.size()));
            if (length == 0) throw std::runtime_error("GetModuleFileNameW failed");
            if (length < buffer.size() - 1)
            {
                buffer.resize(length);
                return fs::path(buffer);
            }
            buffer.resize(buffer.size() * 2);
        }
#elif defined(__APPLE__)
        uint32_t size = 0;
        _NSGetExecutablePath(nullptr, &size);
        std::vector<char> buffer(size);
        if (_NSGetExecutablePath(buffer.data(), &size) != 0) throw std::runtime_error("_NSGetExecutablePath failed");
        char realbuf[PATH_MAX];
        if (realpath(buffer.data(), realbuf) != nullptr) return fs::path(realbuf);
        return fs::path(buffer.data());
#else
        std::vector<char> buffer(PATH_MAX);
        ssize_t count = readlink("/proc/self/exe", buffer.data(), buffer.size());
        if (count <= 0) throw std::runtime_error("readlink(/proc/self/exe) failed");
        return fs::path(std::string(buffer.data(), static_cast<size_t>(count)));
#endif
    }

    /** @brief Returns the directory that contains the running executable. */
    inline fs::path getExecutableDirectory()
    {
        return getExecutablePath().parent_path();
    }

    /** @brief Returns the executable directory as a std::string. */
    inline std::string getExecutableDirectoryString()
    {
        return getExecutableDirectory().string();
    }

    /** @brief Compatibility alias for getExecutablePath(). */
    inline fs::path executable_path()
    {
        return getExecutablePath();
    }

    /** @brief Compatibility alias for getExecutableDirectory(). */
    inline fs::path executable_dir()
    {
        return getExecutableDirectory();
    }

    inline fs::path current_working_directory()
    {
        return fs::current_path();
    }

    inline fs::path absolute_path(const fs::path& pathValue)
    {
        std::error_code ec;
        fs::path result = fs::absolute(pathValue, ec);
        return ec ? pathValue : result;
    }

    inline fs::path normalize_path(const fs::path& pathValue)
    {
        std::error_code ec;
        fs::path result = fs::weakly_canonical(pathValue, ec);
        if (!ec) return result;
        return absolute_path(pathValue).lexically_normal();
    }

    inline bool path_exists(const fs::path& pathValue)
    {
        std::error_code ec;
        return fs::exists(pathValue, ec);
    }

    inline bool file_exists(const fs::path& pathValue)
    {
        std::error_code ec;
        return fs::is_regular_file(pathValue, ec);
    }

    inline bool directory_exists(const fs::path& pathValue)
    {
        std::error_code ec;
        return fs::is_directory(pathValue, ec);
    }

    inline bool ensure_directory(const fs::path& directoryPath)
    {
        if (directoryPath.empty()) return false;
        std::error_code ec;
        if (fs::is_directory(directoryPath, ec)) return true;
        return fs::create_directories(directoryPath, ec) || fs::is_directory(directoryPath, ec);
    }

    inline bool read_text_file(const fs::path& filePath, std::string& contents)
    {
        std::ifstream file(filePath, std::ios::binary);
        if (!file)
        {
            contents.clear();
            return false;
        }
        std::ostringstream stream;
        stream << file.rdbuf();
        contents = stream.str();
        return true;
    }

    inline bool write_text_file(const fs::path& filePath, const std::string& contents, bool append = false)
    {
        fs::path parent = filePath.parent_path();
        if (!parent.empty() && !ensure_directory(parent)) return false;
        std::ofstream file(filePath, std::ios::binary | (append ? std::ios::app : std::ios::trunc));
        if (!file) return false;
        file << contents;
        return static_cast<bool>(file);
    }

    inline bool append_text_file(const fs::path& filePath, const std::string& contents)
    {
        return write_text_file(filePath, contents, true);
    }

    inline std::string get_env(const std::string& name, const std::string& fallback = "")
    {
        const char* value = std::getenv(name.c_str());
        return value != nullptr ? std::string(value) : fallback;
    }

    inline void sleep_ms(unsigned int milliseconds)
    {
        std::this_thread::sleep_for(std::chrono::milliseconds(milliseconds));
    }

    inline std::string safe_filename(std::string text, char replacement = '_')
    {
        if (text.empty()) return "unnamed";
        const std::string forbidden = "<>:\"/\\|?*";
        for (char& ch : text)
        {
            if (static_cast<unsigned char>(ch) < 32 || forbidden.find(ch) != std::string::npos)
            {
                ch = replacement;
            }
        }
        text = trim_copy(text);
        while (!text.empty() && (text.back() == '.' || text.back() == ' ')) text.pop_back();
        return text.empty() ? std::string("unnamed") : text;
    }

    inline std::string make_error_log_block(int code, const std::string& msg, const char* file = nullptr, int line = 0, const char* functionName = nullptr)
    {
        const std::string stamp = now_timestamp("%d/%m/%Y - %H:%M:%S");
        const std::string sideSep(26, '=');
        const std::string header = sideSep + stamp + sideSep;
        const std::string footer(header.size(), '=');

        std::ostringstream stream;
        stream << header << '\n'
               << "Code: " << code << '\n'
               << "Message: " << msg << '\n'
               << "Error at:" << '\n';
        if (file != nullptr && file[0] != '\0') stream << "\tFile: " << file << '\n';
        if (line > 0) stream << "\tLine: " << line << '\n';
        if (functionName != nullptr && functionName[0] != '\0') stream << "\tFunction: " << functionName << '\n';
        stream << footer << '\n';
        return stream.str();
    }

    inline void append_error_log(const std::string& path, int code, const std::string& msg, const char* file, int line, const char* functionName)
    {
        append_text_file(path, make_error_log_block(code, msg, file, line, functionName));
    }

    inline void append_error_log(const std::string& path, int code, const std::string& msg)
    {
        append_text_file(path, make_error_log_block(code, msg));
    }

} // namespace jc_utility
