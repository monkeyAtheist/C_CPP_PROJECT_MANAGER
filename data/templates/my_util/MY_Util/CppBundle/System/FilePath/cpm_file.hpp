#pragma once
#include "cpm_file.h"
#include <cstdint>
#include <filesystem>
#include <fstream>
#include <stdexcept>
#include <string>
#include <vector>
namespace cpm::file {
inline bool exists(const std::filesystem::path& p) { return std::filesystem::exists(p); }
inline bool isDirectory(const std::filesystem::path& p) { return std::filesystem::is_directory(p); }
inline std::uintmax_t size(const std::filesystem::path& p) { return std::filesystem::file_size(p); }
inline void createDirectories(const std::filesystem::path& p) { if(!p.empty()) std::filesystem::create_directories(p); }
inline bool remove(const std::filesystem::path& p) { return std::filesystem::remove(p); }
inline void rename(const std::filesystem::path& from, const std::filesystem::path& to) { std::filesystem::rename(from,to); }
inline std::string readText(const std::filesystem::path& p) {
    std::ifstream f(p, std::ios::binary); if(!f) throw std::runtime_error("Unable to open file: "+p.string());
    return std::string(std::istreambuf_iterator<char>(f), std::istreambuf_iterator<char>());
}
inline std::vector<std::uint8_t> readBinary(const std::filesystem::path& p) {
    std::ifstream f(p, std::ios::binary); if(!f) throw std::runtime_error("Unable to open file: "+p.string());
    return {std::istreambuf_iterator<char>(f), std::istreambuf_iterator<char>()};
}
inline void writeText(const std::filesystem::path& p, const std::string& text) {
    std::ofstream f(p, std::ios::binary|std::ios::trunc); if(!f) throw std::runtime_error("Unable to write file: "+p.string()); f.write(text.data(), static_cast<std::streamsize>(text.size()));
}
inline void appendText(const std::filesystem::path& p, const std::string& text) {
    std::ofstream f(p, std::ios::binary|std::ios::app); if(!f) throw std::runtime_error("Unable to append file: "+p.string()); f.write(text.data(), static_cast<std::streamsize>(text.size()));
}
inline void writeBinary(const std::filesystem::path& p, const std::vector<std::uint8_t>& data) {
    std::ofstream f(p, std::ios::binary|std::ios::trunc); if(!f) throw std::runtime_error("Unable to write file: "+p.string());
    if(!data.empty()) f.write(reinterpret_cast<const char*>(data.data()), static_cast<std::streamsize>(data.size()));
}
inline std::filesystem::path executablePath() {
    char buf[4096]{}; if(CpmPath_GetExecutablePath(buf,sizeof(buf))!=CPM_FILE_OK) return {}; return std::filesystem::path(buf);
}
inline std::filesystem::path executableDirectory() { const auto p=executablePath(); return p.empty()?p:p.parent_path(); }
}
