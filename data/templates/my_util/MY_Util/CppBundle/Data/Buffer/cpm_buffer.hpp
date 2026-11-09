#pragma once
#include <cstdint>
#include <stdexcept>
#include <string>
#include <vector>
namespace cpm {
class ByteBuffer { public: const std::vector<std::uint8_t>& data()const noexcept{return d_;} size_t size()const noexcept{return d_.size();} void clear(){d_.clear();} ByteBuffer& u8(std::uint8_t v){d_.push_back(v);return*this;} ByteBuffer& u16be(std::uint16_t v){d_.push_back(v>>8);d_.push_back(v);return*this;} ByteBuffer& u16le(std::uint16_t v){d_.push_back(v);d_.push_back(v>>8);return*this;} ByteBuffer& u32be(std::uint32_t v){for(int s=24;s>=0;s-=8)d_.push_back(static_cast<std::uint8_t>(v>>s));return*this;} ByteBuffer& bytes(const void*p,size_t n){auto*b=static_cast<const std::uint8_t*>(p);d_.insert(d_.end(),b,b+n);return*this;} private:std::vector<std::uint8_t>d_;};
class ByteReader { public: explicit ByteReader(const std::vector<std::uint8_t>&d):d_(d){} size_t remaining()const{return d_.size()-pos_;} std::uint8_t u8(){require(1);return d_[pos_++];} std::uint16_t u16be(){require(2);auto v=static_cast<std::uint16_t>((d_[pos_]<<8)|d_[pos_+1]);pos_+=2;return v;} std::uint16_t u16le(){require(2);auto v=static_cast<std::uint16_t>(d_[pos_]|(d_[pos_+1]<<8));pos_+=2;return v;} std::vector<std::uint8_t> bytes(size_t n){require(n);auto a=d_.begin()+static_cast<std::ptrdiff_t>(pos_);pos_+=n;return {a,a+static_cast<std::ptrdiff_t>(n)};} private:void require(size_t n)const{if(pos_+n>d_.size())throw std::out_of_range("ByteReader underrun");}const std::vector<std::uint8_t>&d_;size_t pos_{0};};
inline std::string hexEncode(const std::vector<std::uint8_t>&d,bool upper=true,char sep=' '){static const char*U="0123456789ABCDEF";static const char*L="0123456789abcdef";const char*h=upper?U:L;std::string o;for(size_t i=0;i<d.size();++i){if(i&&sep)o.push_back(sep);o.push_back(h[d[i]>>4]);o.push_back(h[d[i]&15]);}return o;}
}
