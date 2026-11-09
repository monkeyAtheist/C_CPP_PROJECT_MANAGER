#pragma once
#include "cpm_ini.h"
#include <cstdint>
#include <string>
#include <utility>
#include <vector>

namespace cpm {
class IniDocument {
public:
    IniDocument() { CpmIni_Init(&doc_); }
    ~IniDocument() { CpmIni_Free(&doc_); }
    IniDocument(const IniDocument&) = delete;
    IniDocument& operator=(const IniDocument&) = delete;
    IniDocument(IniDocument&& other) noexcept : doc_(other.doc_) { CpmIni_Init(&other.doc_); }
    IniDocument& operator=(IniDocument&& other) noexcept {
        if (this != &other) { CpmIni_Free(&doc_); doc_ = other.doc_; CpmIni_Init(&other.doc_); }
        return *this;
    }
    void setCaseSensitive(bool enabled) { CpmIni_SetCaseSensitive(&doc_, enabled ? 1 : 0); }
    int load(const std::string& path) { return CpmIni_Load(&doc_, path.c_str()); }
    int save(const std::string& path) const { return CpmIni_Save(&doc_, path.c_str()); }
    bool hasSection(const std::string& section) const { return CpmIni_HasSection(&doc_, section.c_str()) != 0; }
    bool hasKey(const std::string& section, const std::string& key) const { return CpmIni_HasKey(&doc_, section.c_str(), key.c_str()) != 0; }
    std::string getString(const std::string& section, const std::string& key, const std::string& fallback = {}) const {
        const char* raw = CpmIni_GetRawValue(&doc_, section.c_str(), key.c_str());
        return raw ? std::string(raw) : fallback;
    }
    int getInt(const std::string& section, const std::string& key, int fallback = 0) const {
        int value=fallback; (void)CpmIni_GetInt(&doc_, section.c_str(), key.c_str(), fallback, &value); return value;
    }
    std::int64_t getInt64(const std::string& section, const std::string& key, std::int64_t fallback = 0) const {
        int64_t value=fallback; (void)CpmIni_GetInt64(&doc_, section.c_str(), key.c_str(), fallback, &value); return value;
    }
    double getDouble(const std::string& section, const std::string& key, double fallback = 0.0) const {
        double value=fallback; (void)CpmIni_GetDouble(&doc_, section.c_str(), key.c_str(), fallback, &value); return value;
    }
    bool getBool(const std::string& section, const std::string& key, bool fallback = false) const {
        int value=fallback?1:0; (void)CpmIni_GetBool(&doc_, section.c_str(), key.c_str(), fallback?1:0, &value); return value != 0;
    }
    int set(const std::string& section, const std::string& key, const std::string& value) { return CpmIni_SetString(&doc_, section.c_str(), key.c_str(), value.c_str()); }
    int set(const std::string& section, const std::string& key, int value) { return CpmIni_SetInt(&doc_, section.c_str(), key.c_str(), value); }
    int set(const std::string& section, const std::string& key, std::int64_t value) { return CpmIni_SetInt64(&doc_, section.c_str(), key.c_str(), value); }
    int set(const std::string& section, const std::string& key, double value) { return CpmIni_SetDouble(&doc_, section.c_str(), key.c_str(), value); }
    int set(const std::string& section, const std::string& key, bool value) { return CpmIni_SetBool(&doc_, section.c_str(), key.c_str(), value?1:0); }
    int removeKey(const std::string& section, const std::string& key) { return CpmIni_RemoveKey(&doc_, section.c_str(), key.c_str()); }
    int removeSection(const std::string& section) { return CpmIni_RemoveSection(&doc_, section.c_str()); }
    std::vector<std::string> sections() const {
        std::vector<std::string> out; const auto n=CpmIni_GetSectionCount(&doc_); out.reserve(n);
        for(size_t i=0;i<n;++i){ const char* s=CpmIni_GetSectionName(&doc_,i); if(s) out.emplace_back(s); } return out;
    }
    std::vector<std::string> keys(const std::string& section) const {
        std::vector<std::string> out; const auto n=CpmIni_GetKeyCount(&doc_, section.c_str()); out.reserve(n);
        for(size_t i=0;i<n;++i){ const char* s=CpmIni_GetKeyName(&doc_,section.c_str(),i); if(s) out.emplace_back(s); } return out;
    }
    CpmIniDocument* nativeHandle() noexcept { return &doc_; }
    const CpmIniDocument* nativeHandle() const noexcept { return &doc_; }
private: CpmIniDocument doc_{};
};
inline const char* iniStatusString(int status) { return CpmIni_StatusString(status); }
}
