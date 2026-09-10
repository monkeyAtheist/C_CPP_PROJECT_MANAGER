/**
 * @file cpm_utility.cpp
 * @brief Implementation of the CPM_Utility C++ bundle.
 *
 * Generated bundle implementation. Public API semantics are documented in the matching header file.
 */
#include "cpm_utility.h"
#include <algorithm> // Pour std::min

namespace cpm_utility {

//******************************* Date and time ********************************

namespace time{

    std::string now_timestamp(const char* format)
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


    DateTime now_fields()
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

    void sleep_ms(unsigned int milliseconds)
    {
        std::this_thread::sleep_for(std::chrono::milliseconds(milliseconds));
    }

    void sleep_us(unsigned int microseconds)
    {
        std::this_thread::sleep_for(std::chrono::microseconds(microseconds));
    }

    void sleep_s(double seconds)
    {
        if (seconds <= 0.0)
        {
            return;
        }
        std::this_thread::sleep_for(std::chrono::duration<double>(seconds));
    }

    std::int64_t unix_timestamp_seconds()
    {
        return static_cast<std::int64_t>(std::time(nullptr));
    }

    std::int64_t unix_timestamp_milliseconds()
    {
        const auto now = std::chrono::system_clock::now();
        return std::chrono::duration_cast<std::chrono::milliseconds>(now.time_since_epoch()).count();
    }

    std::string date_string()
    {
        return now_timestamp("%Y-%m-%d");
    }

    std::string time_string()
    {
        return now_timestamp("%H:%M:%S");
    }

    TimePoint tick()
    {
        return SteadyClock::now();
    }

    std::int64_t elapsed_ms(TimePoint start)
    {
        return std::chrono::duration_cast<std::chrono::milliseconds>(SteadyClock::now() - start).count();
    }

    std::int64_t elapsed_us(TimePoint start)
    {
        return std::chrono::duration_cast<std::chrono::microseconds>(SteadyClock::now() - start).count();
    }

    double elapsed_seconds(TimePoint start)
    {
        return std::chrono::duration<double>(SteadyClock::now() - start).count();
    }

    Stopwatch::Stopwatch() : start_(tick())
    {
    }

    void Stopwatch::reset()
    {
        start_ = tick();
    }

    std::int64_t Stopwatch::elapsed_ms() const
    {
        return time::elapsed_ms(start_);
    }

    std::int64_t Stopwatch::elapsed_us() const
    {
        return time::elapsed_us(start_);
    }

    double Stopwatch::elapsed_seconds() const
    {
        return time::elapsed_seconds(start_);
    }

}

//==============================================================================


//************************************ PATH ************************************
    
namespace path {

    fs::path getExecutablePath()
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


    fs::path getExecutableDirectory()
    {
        return getExecutablePath().parent_path();
    }

    std::string getExecutableDirectoryString()
    {
        return getExecutableDirectory().string();
    }

    fs::path executable_path()
    {
        return getExecutablePath();
    }

    fs::path executable_dir()
    {
        return getExecutableDirectory();
    }

    fs::path current_working_directory()
    {
        return fs::current_path();
    }

    fs::path absolute_path(const fs::path& pathValue)
    {
        std::error_code ec;
        fs::path result = fs::absolute(pathValue, ec);
        return ec ? pathValue : result;
    }

    fs::path normalize_path(const fs::path& pathValue)
    {
        std::error_code ec;
        fs::path result = fs::weakly_canonical(pathValue, ec);
        if (!ec) return result;
        return absolute_path(pathValue).lexically_normal();
    }

    bool path_exists(const fs::path& pathValue)
    {
        std::error_code ec;
        return fs::exists(pathValue, ec);
    }

    bool file_exists(const fs::path& pathValue)
    {
        std::error_code ec;
        return fs::is_regular_file(pathValue, ec);
    }

    bool directory_exists(const fs::path& pathValue)
    {
        std::error_code ec;
        return fs::is_directory(pathValue, ec);
    }

   bool ensure_directory(const fs::path& directoryPath)
    {
        if (directoryPath.empty()) return false;
        std::error_code ec;
        if (fs::is_directory(directoryPath, ec)) return true;
        return fs::create_directories(directoryPath, ec) || fs::is_directory(directoryPath, ec);
    }

}

//==============================================================================


/********************** Files ***********************/
namespace files{

    bool read_text_file(const fs::path& filePath, std::string& contents)
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

    bool write_text_file(const fs::path& filePath, const std::string& contents, bool append)
    {
        fs::path parent = filePath.parent_path();
        if (!parent.empty() && !path::ensure_directory(parent)) return false;
        std::ofstream file(filePath, std::ios::binary | (append ? std::ios::app : std::ios::trunc));
        if (!file) return false;
        file << contents;
        return static_cast<bool>(file);
    }

    bool append_text_file(const fs::path& filePath, const std::string& contents)
    {
        return write_text_file(filePath, contents, true);
    }


    std::string safe_filename(std::string text, char replacement)
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
        text = format::trim_copy(text);
        while (!text.empty() && (text.back() == '.' || text.back() == ' ')) text.pop_back();
        return text.empty() ? std::string("unnamed") : text;
    }

    /** @brief Creates a formatted error log entry. */
    std::string make_error_log_block(int code, const std::string& msg, const char* file, int line, const char* functionName)
    {
        const std::string stamp = time::now_timestamp("%d/%m/%Y - %H:%M:%S");
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

    void append_error_log(const std::string& path, int code, const std::string& msg, const char* file, int line, const char* functionName)
    {
        append_text_file(path, make_error_log_block(code, msg, file, line, functionName));
    }

    void append_error_log(const std::string& path, int code, const std::string& msg)
    {
        append_text_file(path, make_error_log_block(code, msg));
    }

}

/****************************************************/


//*********************** Format, parsing and arguments *************************

namespace format{

    std::string trim(std::string text)
    {
        auto notSpace = [](unsigned char c) { return !std::isspace(c); };

        text.erase(text.begin(), std::find_if(text.begin(), text.end(), notSpace));
        text.erase(std::find_if(text.rbegin(), text.rend(), notSpace).base(), text.end());
        return text;
    }

    std::string toLower(std::string text)
    {
        std::transform(text.begin(), text.end(), text.begin(),
            [](unsigned char c) { return static_cast<char>(std::tolower(c)); });
        return text;
    }

    std::string toUpper(std::string text)
    {
        std::transform(text.begin(), text.end(), text.begin(),
            [](unsigned char c) { return static_cast<char>(std::toupper(c)); });
        return text;
    }

    int extract_int(const std::string& s, size_t& pos, int defaultValue)
    {
        try {
            size_t newPos;
            int value = std::stoi(s.substr(pos), &newPos);
            pos += newPos;
            return value;
        }
        catch (...) {
            return defaultValue;
        }
    }

    float extract_float(const std::string& s, size_t& pos, float defaultValue)
    {
        try {
            size_t newPos;
            float value = std::stof(s.substr(pos), &newPos);
            pos += newPos;
            return value;
        }
        catch (...) {
            return defaultValue;
        }
    }

    double extract_double(const std::string& s, size_t& pos, double defaultValue)
    {
        try {
            size_t newPos;
            double value = std::stod(s.substr(pos), &newPos);
            pos += newPos;
            return value;
        }
        catch (...) {
            return defaultValue;
        }
    }

    std::string extract_string(const std::string& s, size_t& pos, const std::string& defaultValue)
    {
        if (pos >= s.size()) return defaultValue;
        size_t start = pos;
        while (pos < s.size() && !std::isspace(static_cast<unsigned char>(s[pos]))) {
            ++pos;
        }
        if (start == pos) return defaultValue;
        return s.substr(start, pos - start);
    }

    int extract_hexa(const std::string& s, size_t& pos, int defaultValue)
    {
        try {
            size_t newPos;
            int value = std::stoi(s.substr(pos), &newPos, 16);
            pos += newPos;
            return value;
        }
        catch (...) {
            return defaultValue;
        }
    }

    std::string extract_token(const std::string& s, size_t& pos, const std::string& separators, const std::string& defaultValue)
    {
        if (pos >= s.size()) return defaultValue;
        size_t start = pos;
        while (pos < s.size() && separators.find(s[pos]) == std::string::npos) {
            ++pos;
        }
        if (start == pos) return defaultValue;
        return s.substr(start, pos - start);
    }
    std::string extractBinary(const std::string& s, size_t& pos, std::vector<uint8_t>& out, const std::string& separators, const std::string& defaultValue)
    {
        if (pos >= s.size()) return defaultValue;
        size_t start = pos;
        while (pos < s.size() && separators.find(s[pos]) == std::string::npos) {
            ++pos;
        }
        if (start == pos) return defaultValue;

        std::string token = s.substr(start, pos - start);
        out.clear();
        for (char c : token) {
            out.push_back(static_cast<uint8_t>(c));
        }
        return token;
    }

    std::string convertToHexadecimal(double decimalValue)
    {
        std::ostringstream oss;
        oss << std::hex << std::uppercase << static_cast<int>(decimalValue);
        return oss.str();
    }

    bool parseHexU32(const std::string& s, uint32_t& out)
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

    int xstoi(const std::string& s, UINT32& out)
    {
        uint32_t value = 0;
        if (!parseHexU32(s, value)) return -10;
        out = value;
        return 0;
    }

    std::string trim_copy(std::string s)
    {
        auto notSpace = [](unsigned char c) { return !std::isspace(c); };
        s.erase(s.begin(), std::find_if(s.begin(), s.end(), notSpace));
        s.erase(std::find_if(s.rbegin(), s.rend(), notSpace).base(), s.end());
        return s;
    }

    std::string toLower_copy(std::string s)
    {
        std::transform(s.begin(), s.end(), s.begin(),
            [](unsigned char c) { return static_cast<char>(std::tolower(c)); });
        return s;
    }

    std::string toUpper_copy(std::string s)
    {
        std::transform(s.begin(), s.end(), s.begin(),
            [](unsigned char c) { return static_cast<char>(std::toupper(c)); });
        return s;
    }

    bool starts_with(const std::string& text, const std::string& prefix)
    {
        return text.size() >= prefix.size() && text.compare(0, prefix.size(), prefix) == 0;
    }

    bool ends_with(const std::string& text, const std::string& suffix)
    {
        return text.size() >= suffix.size() && text.compare(text.size() - suffix.size(), suffix.size(), suffix) == 0;
    }

    bool contains(const std::string& text, const std::string& needle)
    {
        return needle.empty() || text.find(needle) != std::string::npos;
    }

    std::string replace_all(std::string text, const std::string& from, const std::string& to)
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

    std::vector<std::string> split(const std::string& text, char separator, bool keepEmpty)
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

    std::string join(const std::vector<std::string>& items, const std::string& separator)
    {
        std::ostringstream stream;
        for (std::size_t i = 0; i < items.size(); ++i)
        {
            if (i != 0) stream << separator;
            stream << items[i];
        }
        return stream.str();
    }


}

//==============================================================================

//******************************* Environnement ********************************

namespace env{

    std::string get_env(const std::string& name, const std::string& fallback)
    {
        const char* value = std::getenv(name.c_str());
        return value != nullptr ? std::string(value) : fallback;
    }

//==============================================================================

}

/*
  ////  //        //      ////    ////
//      //      //  //  //      //
//      //      //////    //      //
//      //      //  //      //      //
  ////  //////  //  //  ////    ////
*/

//****************************** INI READER CLASS ******************************

    std::string iniReader::trim_(std::string s)
    {
        auto notSpace = [](unsigned char ch) { return !std::isspace(ch); };

        s.erase(s.begin(), std::find_if(s.begin(), s.end(), notSpace));
        s.erase(std::find_if(s.rbegin(), s.rend(), notSpace).base(), s.end());
        return s;
    }

    std::string iniReader::toLower_(std::string s)
    {
        std::transform(s.begin(), s.end(), s.begin(),
            [](unsigned char c) { return (char)std::tolower(c); });
        return s;
    }

    bool iniReader::parseBool_(const std::string& s, bool& out)
    {
        std::string v = toLower_(trim_(s));
        if (v == "1" || v == "true" || v == "yes" || v == "on") { out = true;  return true; }
        if (v == "0" || v == "false" || v == "no" || v == "off") { out = false; return true; }
        return false;
    }

    const std::string* iniReader::findValue_(const std::string& section, const std::string& key) const
    {
        auto itS = data_.find(section);
        if (itS == data_.end()) return nullptr;
        auto itK = itS->second.find(key);
        if (itK == itS->second.end()) return nullptr;
        return &itK->second;
    }

    bool iniReader::has(const std::string& section, const std::string& key) const
    {
        return findValue_(section, key) != nullptr;
    }

    bool iniReader::load(const std::string& path)
    {
        data_.clear();

        std::ifstream f(path);
        if (!f.is_open()) return false;

        std::string line;
        std::string currentSection;

        while (std::getline(f, line))
        {
            line = trim_(line);
            if (line.empty()) continue;

            // ignore commentaires
            if (line[0] == ';' || line[0] == '#') continue;

            // Section [xxx]
            if (line.front() == '[' && line.back() == ']') {
                currentSection = trim_(line.substr(1, line.size() - 2));
                continue;
            }

            // key=value
            auto eq = line.find('=');
            if (eq == std::string::npos) continue; // ligne invalide -> ignor�e

            std::string key = trim_(line.substr(0, eq));
            std::string val = trim_(line.substr(eq + 1));

            // retire commentaire en fin de ligne : "val ; comment"
            auto sc = val.find(';');
            auto hs = val.find('#');
            size_t cut = MACRO_min(
                (sc == std::string::npos ? val.size() : sc),
                (hs == std::string::npos ? val.size() : hs));

            val = trim_(val.substr(0, cut));

            if (!currentSection.empty() && !key.empty()) {
                data_[currentSection][key] = val;
            }
        }

        return true;
    }
//==============================================================================


//***************************** CPM_STRING CLASS *******************************

    CPM_String::CPM_String(const std::string& value)
        : std::string(value)
    {
    }

    CPM_String::CPM_String(std::string&& value) noexcept
        : std::string(std::move(value))
    {
    }

    CPM_String::CPM_String(const char* value)
        : std::string(value != nullptr ? value : "")
    {
    }

    CPM_String::CPM_String(char value)
        : std::string(1, value)
    {
    }

    CPM_String& CPM_String::trim()
    {
        auto notSpace = [](unsigned char c) { return !std::isspace(c); };

        erase(begin(), std::find_if(begin(), end(), notSpace));
        erase(std::find_if(rbegin(), rend(), notSpace).base(), end());

        std::replace_if(begin(), end(),
            [](unsigned char c) { return std::isspace(c); },
            '_');

        return *this;
    }

    CPM_String CPM_String::trimmed() const
    {
        CPM_String copy(*this);
        copy.trim();
        return copy;
    }

    void CPM_String::fromStdString(const std::string& s)
    {
        this->clear();
        this->append(s);
    }

    CPM_String CPM_String::operator+(const std::string& s) const
    {
        return CPM_String(static_cast<const std::string&>(*this) + s);
    }

    CPM_String CPM_String::operator+(const char* s) const
    {
        return CPM_String(static_cast<const std::string&>(*this) + std::string(s != nullptr ? s : ""));
    }

    CPM_String CPM_String::operator-(const std::string& sequence) const
    {
        return removed_all(sequence);
    }

    CPM_String CPM_String::operator-(const char* sequence) const
    {
        return removed_all(sequence != nullptr ? std::string(sequence) : std::string());
    }

    CPM_String CPM_String::operator-(char c) const
    {
        return removed_all(std::string(1, c));
    }

    CPM_String& CPM_String::operator+=(const std::string& s)
    {
        std::string::operator+=(s);
        return *this;
    }

    CPM_String& CPM_String::operator+=(const char* s)
    {
        std::string::operator+=(s != nullptr ? s : "");
        return *this;
    }

    CPM_String& CPM_String::operator+=(char c)
    {
        std::string::operator+=(c);
        return *this;
    }

    CPM_String& CPM_String::operator-=(const std::string& sequence)
    {
        return remove_all_in_place(sequence);
    }

    CPM_String& CPM_String::operator-=(const char* sequence)
    {
        return remove_all_in_place(sequence != nullptr ? std::string(sequence) : std::string());
    }

    CPM_String& CPM_String::operator-=(char c)
    {
        return remove_all_in_place(std::string(1, c));
    }

    CPM_String& CPM_String::remove_all_in_place(const std::string& sequence)
    {
        if (sequence.empty())
        {
            return *this;
        }

        std::size_t position = 0;
        while ((position = this->find(sequence, position)) != std::string::npos)
        {
            this->erase(position, sequence.size());
        }

        return trim_edges();
    }

    CPM_String CPM_String::removed_all(const std::string& sequence) const
    {
        CPM_String copy(*this);
        copy.remove_all_in_place(sequence);
        return copy;
    }

    CPM_String& CPM_String::trim_edges()
    {
        auto notSpace = [](unsigned char c) { return !std::isspace(c); };
        erase(begin(), std::find_if(begin(), end(), notSpace));
        erase(std::find_if(rbegin(), rend(), notSpace).base(), end());
        return *this;
    }

    CPM_String CPM_String::trim_edges_copy() const
    {
        CPM_String copy(*this);
        copy.trim_edges();
        return copy;
    }

    CPM_String CPM_String::operator*(std::size_t count) const
    {
        return CPM_String::repeat(*this, count);
    }

    CPM_String CPM_String::operator^(std::size_t count) const
    {
        return (*this) * count;
    }

    CPM_String& CPM_String::operator*=(std::size_t count)
    {
        return repeat_in_place(count);
    }

    CPM_String& CPM_String::operator^=(std::size_t count)
    {
        return repeat_in_place(count);
    }

    CPM_String& CPM_String::repeat_in_place(std::size_t count)
    {
        *this = CPM_String::repeat(*this, count);
        return *this;
    }

    CPM_String CPM_String::repeat(const std::string& text, std::size_t count)
    {
        CPM_String result;
        if (text.empty() || count == 0)
        {
            return result;
        }

        result.reserve(text.size() * count);
        for (std::size_t i = 0; i < count; ++i)
        {
            result += text;
        }
        return result;
    }

    CPM_String operator*(std::size_t count, const CPM_String& text)
    {
        return text * count;
    }

    CPM_String operator*(const std::string& text, std::size_t count)
    {
        return CPM_String::repeat(text, count);
    }

    CPM_String repeat(const std::string& text, std::size_t count)
    {
        return CPM_String::repeat(text, count);
    }

    namespace literals
    {
        CPM_String operator"" _cpm(const char* text, std::size_t size)
        {
            return CPM_String(std::string(text != nullptr ? text : "", size));
        }

        CPM_String operator"" _cpmstr(const char* text, std::size_t size)
        {
            return CPM_String(std::string(text != nullptr ? text : "", size));
        }
    }

//==============================================================================



/*********************************** MATRICE AND PHYSICAL VECTOR **********************************************************/

matrice::~matrice()
{
}

//********************************** Operator **********************************

matrice matrice::operator+(const matrice& other) {
    if (other._row != _row || other._col != _col) {
        throw std::invalid_argument("Matrices must be of the same size for addition.");
    }   
    matrice result(_row, _col);
    for (size_t i = 0; i < _item.size(); ++i) {
        result._item[i] = _item[i] + other._item[i];
    }
    return result;
}

matrice matrice::operator-(const matrice& other) {
    if (other._row != _row || other._col != _col) {
        throw std::invalid_argument("Matrices must be of the same size for subtraction.");
    }
    matrice result(_row, _col);
    for (size_t i = 0; i < _item.size(); ++i) {
        result._item[i] = _item[i] - other._item[i];
    }
    return result;
}
matrice matrice::operator*(const matrice& other) {
    if (_col != other._row) {
        throw std::invalid_argument("Incompatible matrix dimensions for multiplication.");
    }
    matrice result(_row, other._col);
    for (size_t i = 0; i < _row; ++i) {
        for (size_t j = 0; j < other._col; ++j) {
            result._item[i * other._col + j] = 0;
            for (size_t k = 0; k < _col; ++k) {
                result._item[i * other._col + j] += _item[i * _col + k] * other._item[k * other._col + j];
            }
        }
    }
    return result;
}
matrice matrice::operator/(const matrice& other) {
    if(!other._isSquare) {
        std::cerr << "Warning: Division is only defined for square matrices on the right-hand side. Proceeding with element-wise division." << std::endl;
    }
    if (other._col != _col) {
        throw std::invalid_argument("Incompatible matrix dimensions for multiplication.");
    }
    matrice result(_row, _col);
    for (size_t i = 0; i < _row; ++i) {
        for (size_t j = 0; j < _col; ++j) {
            if (other._item[i * other._col + j] == 0) {
                throw std::domain_error("Division by zero encountered in matrix division.");
            }
            result._item[i * _col + j] = _item[i * _col + j] / other._item[i * other._col + j];
        }
    }
    return result;
}

matrice& matrice::operator+=(const matrice& other) {
    if (other._row != _row || other._col != _col) {
        throw std::invalid_argument("Matrices must be of the same size for addition.");
    }
    for (size_t i = 0; i < _item.size(); ++i) {
        _item[i] += other._item[i];
    }
    return *this;
}

matrice& matrice::operator-=(const matrice& other) {
    if (other._row != _row || other._col != _col) {
        throw std::invalid_argument("Matrices must be of the same size for subtraction.");
    }
    for (size_t i = 0; i < _item.size(); ++i) {
        _item[i] -= other._item[i];
    }
    return *this;
}
matrice& matrice::operator*=(const matrice& other) {
    if (other._row != _row || other._col != _col) {
        throw std::invalid_argument("Matrices must be of the same size for element-wise multiplication assignment.");
    }
    for (size_t i = 0; i < _row; ++i) {
        for (size_t j = 0; j < _col; ++j) {
            _item[i * _col + j] *= other._item[i * other._col + j];
        }
    }
    return *this;
}
matrice& matrice::operator/=(const matrice& other)
{
    if(!other._isSquare) {
        std::cerr << "Warning: Division is only defined for square matrices on the right-hand side. Proceeding with element-wise division." << std::endl;
    }
    if (other._row != _row || other._col != _col) {
        throw std::invalid_argument("Matrices must be of the same size for element-wise multiplication assignment.");
    }
    for (size_t i = 0; i < _row; ++i) {
        for (size_t j = 0; j < _col; ++j) {
            if (other._item[i * other._col + j] == 0) {
                throw std::domain_error("Division by zero encountered in matrix division.");
            }
            _item[i * _col + j] /= other._item[i * other._col + j];
        }
    }
    return *this;
}

matrice matrice::operator^(const matrice& other) {
    if (other._row != _row || other._col != _col) {
        throw std::invalid_argument("Matrices must be of the same size for element-wise exponentiation.");
    }
    matrice result(_row, _col);
    for (size_t i = 0; i < _item.size(); ++i) {
        result._item[i] = std::pow(_item[i], other._item[i]);
    }
    return result;
}
/*for 4x4 matrices maximum */
double matrice::determinant(matrice mat) {
    if (!mat._isSquare || mat._row == 0 || mat._col == 0  || mat._row == 1 || mat._col == 1) {
        throw std::logic_error("Determinant is only defined for square matrices.");
    }
    if(mat._row > 4 || mat._col > 4) {
        throw std::logic_error("Determinant calculation is only implemented for matrices up to 4x4.");
    }

    if(mat._row == 2 && mat._col == 2) {
        return mat._item[0] * mat._item[3] - mat._item[1] * mat._item[2];
    } else if(mat._row == 3 && mat._col == 3) {
        return (mat._item[0] * (mat._item[4] * mat._item[8] - mat._item[5] * mat._item[7]) -
               mat._item[1] * (mat._item[3] * mat._item[8] - mat._item[5] * mat._item[6]) +
               mat._item[2] * (mat._item[3] * mat._item[7] - mat._item[4] * mat._item[6]));
    }
    else if(mat._row == 4 && mat._col == 4) {
        return mat._item[0] * (mat._item[5] * (mat._item[10] * mat._item[15] - mat._item[11] * mat._item[14]) -
                          mat._item[6] * (mat._item[9] * mat._item[15] - mat._item[11] * mat._item[13]) +
                          mat._item[7] * (mat._item[9] * mat._item[14] - mat._item[10] * mat._item[13])) -
               mat._item[1] * (mat._item[4] * (mat._item[10] * mat._item[15] - mat._item[11] * mat._item[14]) -
                          mat._item[6] * (mat._item[8] * mat._item[15] - mat._item[11] * mat._item[12]) +
                          mat._item[7] * (mat._item[8] * mat._item[14] - mat._item[10] * mat._item[12])) +
               mat._item[2] * (mat._item[4] * (mat._item[9] * mat._item[15] - mat._item[11] * mat._item[13]) -
                          mat._item[5] * (mat._item[8] * mat._item[15] - mat._item[11] * mat._item[12]) +
                          mat._item[7] * (mat._item[8] * mat._item[13] - mat._item[9]  *mat._item [12])) -
               mat._item [3]*(mat._item [4]*(mat._item [9]*(mat._item [14]-mat._item [10]*(mat._item [8]*(mat._item [13]-mat._item [9]*(mat._item [12]))))));
    }
    return 0.0; // Placeholder
}



    std::vector<double> matrice::cofactorMatrix(matrice mat)
    {
        if(!mat._isSquare || mat._row == 0 || mat._col == 0) {
            throw std::logic_error("Cofactor matrix is only defined for non-empty square matrices.");
        }
        if(mat._row > 4 || mat._col > 4) {
            throw std::logic_error("Cofactor matrix calculation is only implemented for matrices up to 4x4.");
        }

        if(mat._row == 2 && mat._col == 2) {
            return {mat._item[3], -mat._item[1], -mat._item[2], mat._item[0]};
        } else if(mat._row == 3 && mat._col == 3) {
            return {
                mat._item[4] * mat._item[8] - mat._item[5] * mat._item[7],
                -(mat._item[1] * mat._item[8] - mat._item[2] * mat._item[7]),
                mat._item[1] * mat._item[5] - mat._item[2] * mat._item[4],
                -(mat._item[3] * mat._item[8] - mat._item[5] * mat._item[6]),
                mat._item[0] * mat._item[8] - mat._item[2] * mat._item[6],
                -(mat._item[0] * mat._item[5] - mat._item[2] * mat._item[3]),
                mat._item[3] * mat._item[7] - mat._item[4] * mat._item[6],
                -(mat._item[0] * mat._item[7] - mat._item[1] * mat._item[6]),
                mat._item[0] * mat._item[4] - mat._item[1] * mat._item[3]
            };
        }
        else if(mat._row == 4 && mat._col == 4) {
            return{
                mat._item[5] * (mat._item[10] * mat._item[15] - mat._item[11] * mat._item[14]) -
                mat._item[6] * (mat._item[9] * mat._item[15] - mat._item[11] * mat._item[13]) +
                mat._item[7] * (mat._item[9] * mat._item[14] - mat._item[10] * mat._item[13]),

                -(mat._item[4] * (mat._item[10] * mat._item[15] - mat._item[11] * mat._item[14]) -
                  mat._item[6] * (mat._item[8] * mat._item[15] - mat._item[11] * mat._item[12]) +
                  mat._item[7] * (mat._item[8] * mat._item[14] - mat._item[10] * mat._item[12])),

                mat._item[4] * (mat._item[9] * (mat._item [14]-mat._item [10]*(mat._item [8]*(mat._item [13]-mat._item [9]*(mat._item [12])))) -
                -(mat._item [5]*(mat._item [8]*(mat._item [13]-mat._item [9]*(mat._item [12])))) +
                +(mat._item [6]*(mat._item [8]*(mat._item [13]-mat._item [9]*(mat._item [12])))) -
                +(mat._item [7]*(mat._item [8]*(mat._item [13]-mat._item [9]*(mat._item [12])))))
            };
        }
        return std::vector<double>(); // Placeholder
    }

    std::vector<double> matrice::transpose(matrice mat) {
        matrice transposed(mat._col, mat._row);
        for (unsigned char row = 0; row < mat._row; ++row) {
            for (unsigned char col = 0; col < mat._col; ++col) {
                transposed.setItem(col, row, mat.getItem(row, col));
            }
        }
        return transposed._item;
    }

    std::vector<double> matrice::adjugateMatrix(matrice mat)
    {
        if(!mat._isSquare || mat._row == 0 || mat._col == 0) {
            throw std::logic_error("Adjugate matrix is only defined for non-empty square matrices.");
        }
        if(mat._row > 4 || mat._col > 4) {
            throw std::logic_error("Adjugate matrix calculation is only implemented for matrices up to 4x4.");
        }

        std::vector<double> cofactor = cofactorMatrix(mat);
        std::vector<double> adjugate(mat._row * mat._col);

        for(size_t i = 0; i < mat._row; ++i) {
            for(size_t j = 0; j < mat._col; ++j) {
                adjugate[j * mat._row + i] = cofactor[i * mat._col + j]; // Transpose
            }
        }

        return adjugate;
    }

    std::vector<double> matrice::inverseMatrix(matrice mat)
    {
        if(!mat._isSquare || mat._row == 0 || mat._col == 0) {
            throw std::logic_error("Inverse matrix is only defined for non-empty square matrices.");
        }
        if(mat._row > 4 || mat._col > 4) {
            throw std::logic_error("Inverse matrix calculation is only implemented for matrices up to 4x4.");
        }

        double det = mat.getDeterminant();
        if(det == 0) {
            throw std::logic_error("Matrix is singular and cannot be inverted.");
        }

        std::vector<double> adjugate = mat.adjugateMatrix(mat);
        std::vector<double> inverse(mat._row * mat._col);

        for(size_t i = 0; i < mat._row * mat._col; ++i) {
            inverse[i] = adjugate[i] / det;
        }

        return inverse;
    }

//==============================================================================
// CoordMat
//==============================================================================


void coord3dMatrice::initMat() {
    matRotX.setItemVector(std::vector<double>{  1, 0, 0, 
                                                        0, cos(0), -sin(0), 
                                                        0, sin(0), cos(0)});
    matRotY.setItemVector(std::vector<double>{  cos(0), 0, sin(0),
                                                        0, 1, 0,
                                                        -sin(0), 0, cos(0)});
    matRotZ.setItemVector(std::vector<double>{  cos(0), 0, sin(0),
                                                        0, 1, 0,
                                                        -sin(0), 0, cos(0)});
    matTranslateX.setItemVector(std::vector<double>{    1, 0, 0,
                                                                0, 1, 0, 
                                                                0, 0, 1});
    matTranslateY.setItemVector(std::vector<double>{   1, 0, 0,
                                                                0, 1, 0, 
                                                                0, 0, 1});
    matTranslateZ.setItemVector(std::vector<double>{  1, 0, 0,
                                                                0, 1, 0, 
                                                                0, 0, 1});
    coord.setItemVector(std::vector<double>{0, 0, 0, 0, 0, 0, 0, 0, 0});
}


void coord3dMatrice::setItemMat(matrice it) {
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


    void coord3dMatrice::_rotateXrad(double X){
        this->matRotX.setItemVector(std::vector<double>{  1, 0, 0, 
                                                        0, cos(X), -sin(X), 
                                                        0, sin(X), cos(X)});
    }
    void coord3dMatrice::_rotateYrad(double Y){
        this->matRotY.setItemVector(std::vector<double>{  cos(Y), 0, sin(Y),
                                                        0, 1, 0,
                                                        -sin(Y), 0, cos(Y)});
    }
    void coord3dMatrice::_rotateZrad(double Z){
        this->matRotZ.setItemVector(std::vector<double>{  cos(Z), 0, sin(Z),
                                                        0, 1, 0,
                                                        -sin(Z), 0, cos(Z)});
    }
    void coord3dMatrice::_rotateXdeg(double X){
        double deg = X * M_PI / 180.0; 
        this->matRotX.setItemVector(std::vector<double>{  1, 0, 0, 
                                                        0, cos(deg), -sin(deg), 
                                                        0, sin(deg), cos(deg)});
    }
    void coord3dMatrice::_rotateYdeg(double Y){
        double deg = Y * M_PI / 180.0; 
        this->matRotY.setItemVector(std::vector<double>{  cos(deg), 0, sin(deg),
                                                        0, 1, 0,
                                                        -sin(deg), 0, cos(deg)});
    }
    void coord3dMatrice::_rotateZdeg(double Z){
        double deg = Z * M_PI / 180.0; 
        this->matRotZ.setItemVector(std::vector<double>{  cos(deg), 0, sin(deg),
                                                        0, 1, 0,
                                                        -sin(deg), 0, cos(deg)});
    }
    void coord3dMatrice::_translateX(double X){
        this->matTranslateX.setItemVector(std::vector<double>{    X, X, X,
                                                                0, 0, 0, 
                                                                0, 0, 0});
    }
    void coord3dMatrice::_translateY(double Y){
        this->matTranslateY.setItemVector(std::vector<double>{   0, 0, 0,
                                                                Y, Y, Y, 
                                                                0, 0, 0});
    }
    void coord3dMatrice::_translateZ(double Z){
        this->matTranslateZ.setItemVector(std::vector<double>{  0, 0, 0,
                                                                0, 0, 0, 
                                                                Z, Z, Z});
    }



matrice coord3dMatrice::rotatedMatXrad(matrice mat , double angleX) {
    try{
        if(mat.getRow() != 3 || mat.getCol() != 3) {
            throw std::invalid_argument("Input matrix must be 3x3.");
        }
    }
    catch(const std::invalid_argument& e) {
        std::cerr << "Error: " << e.what() << std::endl;
    }
    return this->getMatRotXRotatedRad(angleX) * mat;
}

matrice coord3dMatrice::rotateMatYrad(matrice mat , double angleY) {
    try{
        if(mat.getRow() != 3 || mat.getCol() != 3) {
            throw std::invalid_argument("Input matrix must be 3x3.");
        }
    }
    catch(const std::invalid_argument& e) {
        std::cerr << "Error: " << e.what() << std::endl;
    }
    return this->getMatRotYRotatedRad(angleY) * mat;
}

matrice coord3dMatrice::rotateMatZrad(matrice mat , double angleZ) {
    try{
        if(mat.getRow() != 3 || mat.getCol() != 3) {
            throw std::invalid_argument("Input matrix must be 3x3.");
        }
    }
    catch(const std::invalid_argument& e) {
        std::cerr << "Error: " << e.what() << std::endl;
    }
    return this->getMatRotZRotatedRad(angleZ) * mat;
}

matrice coord3dMatrice::rotatedMatXdeg(matrice mat , double angleX) {
    try{
        if(mat.getRow() != 3 || mat.getCol() != 3) {
            throw std::invalid_argument("Input matrix must be 3x3.");
        }
    }
    catch(const std::invalid_argument& e) {
        std::cerr << "Error: " << e.what() << std::endl;
    }
    return this->getMatRotXRotatedDeg(angleX) * mat;
}

matrice coord3dMatrice::rotateMatYdeg(matrice mat , double angleY) {
    try{
        if(mat.getRow() != 3 || mat.getCol() != 3) {
            throw std::invalid_argument("Input matrix must be 3x3.");
        }
    }
    catch(const std::invalid_argument& e) {
        std::cerr << "Error: " << e.what() << std::endl;
    }
    return this->getMatRotYRotatedDeg(angleY) * mat;
}

matrice coord3dMatrice::rotateMatZdeg(matrice mat , double angleZ) {
    try{
        if(mat.getRow() != 3 || mat.getCol() != 3) {
            throw std::invalid_argument("Input matrix must be 3x3.");
        }
    }
    catch(const std::invalid_argument& e) {
        std::cerr << "Error: " << e.what() << std::endl;
    }
    return this->getMatRotZRotatedDeg(angleZ) * mat;
}

matrice coord3dMatrice::translateMatX(matrice mat , double X) {
    try{
        if(mat.getRow() != 3 || mat.getCol() != 3) {
            throw std::invalid_argument("Input matrix must be 3x3.");
        }
    }
    catch(const std::invalid_argument& e) {
        std::cerr << "Error: " << e.what() << std::endl;
    }
    matrice matX = matrice(3, 3);
    matX.setItemVector(std::vector<double>{X, X, X, 0, 0, 0, 0, 0, 0});
    return mat + matX;
}

matrice coord3dMatrice::translateMatY(matrice mat , double Y) {
    try{
        if(mat.getRow() != 3 || mat.getCol() != 3) {
            throw std::invalid_argument("Input matrix must be 3x3.");
        }
    }
    catch(const std::invalid_argument& e) {
        std::cerr << "Error: " << e.what() << std::endl;
    }
    matrice matY = matrice(3, 3);
    matY.setItemVector(std::vector<double>{0, 0, 0, Y, Y, Y, 0, 0, 0});
    return mat + matY;
}

matrice coord3dMatrice::translateMatZ(matrice mat , double Z) {
    try{
        if(mat.getRow() != 3 || mat.getCol() != 3) {
            throw std::invalid_argument("Input matrix must be 3x3.");
        }
    }
    catch(const std::invalid_argument& e) {
        std::cerr << "Error: " << e.what() << std::endl;
    }
    matrice matZ = matrice(3, 3);
    matZ.setItemVector(std::vector<double>{0, 0, 0, 0, 0, 0, Z, Z, Z});
    return mat + matZ;
}


//==============================================================================
// VectorDimension

vectorCoord::vectorCoord(unsigned char szVec) {
    try{
        if(szVec == 0 || szVec == 1 || szVec > 3) {throw std::invalid_argument("Vector size must be greater than 1 and less than or equal to 3, value passed : " + std::to_string(szVec));}
        this->_coord.reserve(szVec);
    }
    catch(const std::bad_alloc& e)
    {
        std::cerr << "Allocation failed: " << e.what() << std::endl;
    }
}

vectorCoord::vectorCoord(std::vector<double> coord) {
    this->_coord = coord;
    try{
        if(coord.size() == 0 || coord.size() == 1 || coord.size() > 3) {throw std::invalid_argument("Vector size must be greater than 1 and less than or equal to 3, value passed : " + std::to_string(coord.size()));}
        this->_coord.reserve(coord.size());
    }
    catch(const std::bad_alloc& e)
    {
        std::cerr << "Allocation failed: " << e.what() << std::endl;
    }
}

vectorCoord vectorCoord::operator+(const vectorCoord _vec)
{
    std::vector<double> vec = _vec.getCoord();
    try{
        if(vec.size() != this->_coord.size())
            throw std::domain_error("cannot compute addition for vector of different size");
    }
    catch(const std::domain_error& e)
    {
        std::cerr << e.what() << std::endl;
    }

    std::vector<double> res;
    res.reserve(vec.size());
    for(std::size_t i = 0; i < vec.size(); i++)
    {
        res.push_back(res[i] + vec[i]);
    }
    vectorCoord result(res);
    return result;
}

vectorCoord& vectorCoord::operator+=(const vectorCoord& _vec)
{
    std::vector<double> vec = _vec.getCoord();
    try{
        if(vec.size() != this->_coord.size())
            throw std::domain_error("cannot compute addition for vector of different size");
    }
    catch(const std::domain_error& e)
    {
        std::cerr << e.what() << std::endl;
    }
    for(std::size_t i = 0; i < vec.size(); i++)
    {
        this->_coord[i] += vec[i];
    }
    return *this;
}

vectorCoord vectorCoord::operator-(const vectorCoord _vec)
{
    std::vector<double> vec = _vec.getCoord();
    try{
        if(vec.size() != this->_coord.size())
            throw std::domain_error("cannot compute addition for vector of different size");
    }
    catch(const std::domain_error& e)
    {
        std::cerr << e.what() << std::endl;
    }

    std::vector<double> res;
    res.reserve(vec.size());
    for(std::size_t i = 0; i < vec.size(); i++)
    {
        res.push_back(this->_coord[i] - vec[i]);
    }
    vectorCoord result(res);
    return result;
}

vectorCoord& vectorCoord::operator-=(const vectorCoord& _vec)
{
    std::vector<double> vec = _vec.getCoord();
    try{
        if(vec.size() != this->_coord.size())
            throw std::domain_error("cannot compute addition for vector of different size");
    }
    catch(const std::domain_error& e)
    {
        std::cerr << e.what() << std::endl;
    }
    for(std::size_t i = 0; i < vec.size(); i++)
    {
        this->_coord[i] -= vec[i];
    }
    return *this;
}

vectorCoord vectorCoord::operator*(const double scalar)
{
    std::vector<double> res;
    res.reserve(this->_coord.size());
    for(std::size_t i = 0; i < this->_coord.size(); i++)
    {
        res.push_back(this->_coord[i] * scalar);
    }
    vectorCoord result(res);
    return result;
}

vectorCoord vectorCoord::operator*(const vectorCoord _vec)
{
    std::vector<double> vec = _vec.getCoord();
    try{
        if(vec.size() != this->_coord.size())
            throw std::domain_error("cannot compute addition for vector of different size");
    }
    catch(const std::domain_error& e)
    {
        std::cerr << e.what() << std::endl;
    }
    std::vector<double> res;
    res.reserve(this->_coord.size());
    for(std::size_t i = 0; i < this->_coord.size(); i++)
    {
        res.push_back(this->_coord[i] * vec[i]);
    }
    vectorCoord result(res);
    return result;
}


vectorCoord& vectorCoord::operator/=(const double scalar)
{
    for(std::size_t i = 0; i < this->_coord.size(); i++)
    {
        this->_coord[i] /= scalar;
    }
    return *this;
}  

/** @brief Scalar product.
 *  @param vec The other vector.
 *  @return The result of the scalar product.
 */
vectorCoord& vectorCoord::operator*=(const vectorCoord& _vec)
{
    std::vector<double> vec = _vec.getCoord();
    try{
        if(vec.size() != this->_coord.size())
            throw std::domain_error("cannot compute addition for vector of different size");
    }
    catch(const std::domain_error& e)
    {
        std::cerr << e.what() << std::endl;
    }
    for(std::size_t i = 0; i < vec.size(); i++)
    {
        this->_coord[i] *= vec[i];
    }
    return *this;
}

vectorCoord& vectorCoord::operator*=(const double scalar)
{
    for(std::size_t i = 0; i < this->_coord.size(); i++)
    {
        this->_coord[i] *= scalar;
    }
    return *this;
}

vectorCoord vectorCoord::operator/(const double scalar)
{
    std::vector<double> res;
    res.reserve(this->_coord.size());
    for(std::size_t i = 0; i < this->_coord.size(); i++)
    {
        res.push_back(this->_coord[i] / scalar);
    }
    vectorCoord result(res);
    return result;
}

vectorCoord vectorCoord::operator^(double scalar)
{
    std::vector<double> res;
    res.reserve(this->_coord.size());
    for(std::size_t i = 0; i < this->_coord.size(); i++)
    {
        res.push_back(std::pow(this->_coord[i], scalar));
    }
    vectorCoord result(res);
    return result;
}

vectorCoord& vectorCoord::operator^=(double scalar)
{
    for(std::size_t i = 0; i < this->_coord.size(); i++)
    {
        this->_coord[i] = std::pow(this->_coord[i], scalar);
    }
    return *this;
}

vectorCoord vectorCoord::operator^(const vectorCoord _vec)
{
    std::vector<double> vec = _vec.getCoord();
    try{
        if(vec.size() != this->_coord.size())
            throw std::domain_error("cannot compute addition for vector of different size");
    }
    catch(const std::domain_error& e)
    {
        std::cerr << e.what() << std::endl;
    }
    std::vector<double> res;
    res.reserve(this->_coord.size());
    for(std::size_t i = 0; i < this->_coord.size(); i++)
    {
        res.push_back(std::pow(this->_coord[i], vec[i]));
    }
    vectorCoord result(res);
    return result;
}

vectorCoord& vectorCoord::operator^=(const vectorCoord& _vec)
{
    std::vector<double> vec = _vec.getCoord();
    try{
        if(vec.size() != this->_coord.size())
            throw std::domain_error("cannot compute addition for vector of different size");
    }
    catch(const std::domain_error& e)
    {
        std::cerr << e.what() << std::endl;
    }
    for(std::size_t i = 0; i < this->_coord.size(); i++)
    {
        this->_coord[i] = std::pow(this->_coord[i], vec[i]);
    }
    return *this;
}

/** @brief Computes the dot vectorial product of this vector with another vector.
 *  @param vec The other vector.
 *  @return The dot product.
 */
vectorCoord vectorCoord::operator<(const vectorCoord _vec)
{
    std::vector<double> vec = _vec.getCoord();
    try{
        if(vec.size() != this->_coord.size())
            throw std::domain_error("cannot compute addition for vector of different size");
        else if(vec.size() != 3)
            throw std::domain_error("cannot compute dot product for vector of size different than 3");
    }
    catch(const std::domain_error& e)
    {
        std::cerr << e.what() << std::endl;
    }
    std::vector<double> res;
    res.reserve(this->_coord.size());
    res.push_back((this->_coord[_y]*vec[_z]) - (this->_coord[_z]*vec[_y]));
    res.push_back((this->_coord[_z]*vec[_x]) - (this->_coord[_x]*vec[_z]));
    res.push_back((this->_coord[_x]*vec[_y]) - (this->_coord[_y]*vec[_x]));

    vectorCoord result(res);
    return result;
}

vectorCoord& vectorCoord::operator<=(const vectorCoord& _vec)
{
    std::vector<double> vec = _vec.getCoord();
    try{
        if(vec.size() != this->_coord.size())
            throw std::domain_error("cannot compute addition for vector of different size");
        else if(vec.size() != 3)
            throw std::domain_error("cannot compute dot product for vector of size different than 3");
    }
    catch(const std::domain_error& e)
    {
        std::cerr << e.what() << std::endl;
    }
    std::vector<double> res;
    res.reserve(this->_coord.size());
    res.push_back((this->_coord[_y]*vec[_z]) - (this->_coord[_z]*vec[_y]));
    res.push_back((this->_coord[_z]*vec[_x]) - (this->_coord[_x]*vec[_z]));
    res.push_back((this->_coord[_x]*vec[_y]) - (this->_coord[_y]*vec[_x]));
    for(std::size_t i = 0; i < this->_coord.size(); i++)
    {
        this->_coord[i] = res[i];
    }
    return *this;
}

vectorCoord& vectorCoord::operator=(const vectorCoord& vec)
{
    if (this != &vec) {
        this->_coord = vec._coord;
    }
    return *this;
}

double vectorCoord::getNorm() const {
    double sum = 0.0;
    for (double val : _coord) {
        sum += val * val;
    }
    return std::sqrt(sum);
}

std::vector<double> vectorCoord::getDirection() const {
    double norm = getNorm();
    if (norm == 0) {
        throw std::domain_error("Cannot compute direction of a zero vector.");
    }
    std::vector<double> direction;
    direction.reserve(_coord.size());
    for (double val : _coord) {
        direction.push_back(val / norm);
    }
    return direction;
}

std::vector <double> vectorCoord::getDirectionAngleRad() const {
    double norm = getNorm();
    if (norm == 0) {
        throw std::domain_error("Cannot compute direction of a zero vector.");
    }
    std::vector<double> directionAngle;
    directionAngle.reserve(_coord.size());
    for (double val : _coord) {
        directionAngle.push_back(std::atan2(val, norm));
    }
    return directionAngle;
}

std::vector <double> vectorCoord::getDirectionAngleDeg() const {
    double norm = getNorm();
    if (norm == 0) {
        throw std::domain_error("Cannot compute direction of a zero vector.");
    }
    std::vector<double> directionAngle;
    directionAngle.reserve(_coord.size());
    for (double val : _coord) {
        directionAngle.push_back(std::atan2(val, norm) * 180.0 / M_PI);
    }
    return directionAngle;
}

double vectorCoord::getAngleBetweenVectorsRad(const std::vector<double>& vec) const {
    if (vec.size() != _coord.size()) {
        throw std::invalid_argument("Input vector size must match this vector size.");
    }
    double dotProduct = 0.0;
    for (size_t i = 0; i < _coord.size(); i++) {
        dotProduct += _coord[i] * vec[i];
    }
    double norm1 = getNorm();
    double norm2 = 0.0;
    for (double val : vec) {
        norm2 += val * val;
    }
    norm2 = std::sqrt(norm2);
    if (norm1 == 0 || norm2 == 0) {
        throw std::domain_error("Cannot compute angle between a zero vector and another vector.");
    }
    return std::acos(dotProduct / (norm1 * norm2));
}

double vectorCoord::getAngleBetweenVectorsDeg(const std::vector<double>& vec) const {
    return getAngleBetweenVectorsRad(vec) * 180.0 / M_PI;
}


//******************************* Compatibility API *******************************
std::string now_timestamp(const char* format) { return time::now_timestamp(format); }
DateTime now_fields() { return time::now_fields(); }
void sleep_ms(unsigned int milliseconds) { time::sleep_ms(milliseconds); }
void sleep_us(unsigned int microseconds) { time::sleep_us(microseconds); }
void sleep_s(double seconds) { time::sleep_s(seconds); }
std::int64_t unix_timestamp_seconds() { return time::unix_timestamp_seconds(); }
std::int64_t unix_timestamp_milliseconds() { return time::unix_timestamp_milliseconds(); }
time::TimePoint tick() { return time::tick(); }
std::int64_t elapsed_ms(time::TimePoint start) { return time::elapsed_ms(start); }
double elapsed_seconds(time::TimePoint start) { return time::elapsed_seconds(start); }

fs::path getExecutablePath() { return path::getExecutablePath(); }
fs::path getExecutableDirectory() { return path::getExecutableDirectory(); }
std::string getExecutableDirectoryString() { return path::getExecutableDirectoryString(); }
fs::path executable_path() { return path::executable_path(); }
fs::path executable_dir() { return path::executable_dir(); }
fs::path current_working_directory() { return path::current_working_directory(); }
fs::path absolute_path(const fs::path& pathValue) { return path::absolute_path(pathValue); }
fs::path normalize_path(const fs::path& pathValue) { return path::normalize_path(pathValue); }
bool path_exists(const fs::path& pathValue) { return path::path_exists(pathValue); }
bool file_exists(const fs::path& pathValue) { return path::file_exists(pathValue); }
bool directory_exists(const fs::path& pathValue) { return path::directory_exists(pathValue); }
bool ensure_directory(const fs::path& directoryPath) { return path::ensure_directory(directoryPath); }

bool read_text_file(const fs::path& filePath, std::string& contents) { return files::read_text_file(filePath, contents); }
bool write_text_file(const fs::path& filePath, const std::string& contents, bool append) { return files::write_text_file(filePath, contents, append); }
bool append_text_file(const fs::path& filePath, const std::string& contents) { return files::append_text_file(filePath, contents); }
std::string safe_filename(std::string text, char replacement) { return files::safe_filename(std::move(text), replacement); }
std::string make_error_log_block(int code, const std::string& msg, const char* file, int line, const char* functionName) { return files::make_error_log_block(code, msg, file, line, functionName); }
void append_error_log(const std::string& path, int code, const std::string& msg, const char* file, int line, const char* functionName) { files::append_error_log(path, code, msg, file, line, functionName); }
void append_error_log(const std::string& path, int code, const std::string& msg) { files::append_error_log(path, code, msg); }

std::string trim_copy(std::string s) { return format::trim_copy(std::move(s)); }
std::string toLower_copy(std::string s) { return format::toLower_copy(std::move(s)); }
std::string toUpper_copy(std::string s) { return format::toUpper_copy(std::move(s)); }
bool starts_with(const std::string& text, const std::string& prefix) { return format::starts_with(text, prefix); }
bool ends_with(const std::string& text, const std::string& suffix) { return format::ends_with(text, suffix); }
bool contains(const std::string& text, const std::string& needle) { return format::contains(text, needle); }
std::string replace_all(std::string text, const std::string& from, const std::string& to) { return format::replace_all(std::move(text), from, to); }
std::vector<std::string> split(const std::string& text, char separator, bool keepEmpty) { return format::split(text, separator, keepEmpty); }
std::string join(const std::vector<std::string>& items, const std::string& separator) { return format::join(items, separator); }
std::string get_env(const std::string& name, const std::string& fallback) { return env::get_env(name, fallback); }


} // namespace cpm_utility