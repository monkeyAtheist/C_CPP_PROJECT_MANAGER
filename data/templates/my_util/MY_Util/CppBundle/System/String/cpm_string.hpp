#pragma once
#include <algorithm>
#include <cctype>
#include <sstream>
#include <string>
#include <string_view>
#include <vector>
namespace cpm::str {
inline std::string trim(std::string_view s){ size_t a=0,b=s.size(); while(a<b&&std::isspace(static_cast<unsigned char>(s[a])))++a; while(b>a&&std::isspace(static_cast<unsigned char>(s[b-1])))--b; return std::string(s.substr(a,b-a)); }
inline std::string lower(std::string s){ std::transform(s.begin(),s.end(),s.begin(),[](unsigned char c){return static_cast<char>(std::tolower(c));}); return s; }
inline std::string upper(std::string s){ std::transform(s.begin(),s.end(),s.begin(),[](unsigned char c){return static_cast<char>(std::toupper(c));}); return s; }
inline bool iequals(std::string_view a,std::string_view b){ if(a.size()!=b.size())return false; for(size_t i=0;i<a.size();++i) if(std::tolower((unsigned char)a[i])!=std::tolower((unsigned char)b[i])) return false; return true; }
inline bool startsWith(std::string_view s,std::string_view p){ return s.size()>=p.size()&&s.substr(0,p.size())==p; }
inline bool endsWith(std::string_view s,std::string_view p){ return s.size()>=p.size()&&s.substr(s.size()-p.size())==p; }
inline bool contains(std::string_view s,std::string_view n){ return s.find(n)!=std::string_view::npos; }
inline std::string replaceAll(std::string s,std::string_view from,std::string_view to){ if(from.empty())return s; size_t pos=0; while((pos=s.find(from.data(),pos,from.size()))!=std::string::npos){s.replace(pos,from.size(),to.data(),to.size());pos+=to.size();} return s; }
inline std::vector<std::string> split(std::string_view s,char delim,bool keepEmpty=false){ std::vector<std::string> out; size_t start=0; for(size_t i=0;i<=s.size();++i){if(i==s.size()||s[i]==delim){if(keepEmpty||i>start)out.emplace_back(s.substr(start,i-start));start=i+1;}} return out; }
inline std::string join(const std::vector<std::string>& parts,std::string_view sep){ std::ostringstream os; for(size_t i=0;i<parts.size();++i){if(i)os<<sep;os<<parts[i];} return os.str(); }
}
