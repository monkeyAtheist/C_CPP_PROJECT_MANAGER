#pragma once
#include <cstddef>
#include <deque>
#include <mutex>
#include <optional>
#include <stdexcept>
#include <utility>
namespace cpm {
template<class T> class RingBuffer { public: explicit RingBuffer(size_t capacity):cap_(capacity){if(!cap_)throw std::invalid_argument("capacity must be > 0");} bool push(T value,bool overwrite=true){if(q_.size()==cap_){if(!overwrite)return false;q_.pop_front();}q_.push_back(std::move(value));return true;} std::optional<T> pop(){if(q_.empty())return std::nullopt;T v=std::move(q_.front());q_.pop_front();return v;} const T& at(size_t i)const{return q_.at(i);} void clear(){q_.clear();} size_t size()const noexcept{return q_.size();} size_t capacity()const noexcept{return cap_;} bool empty()const noexcept{return q_.empty();} private:size_t cap_;std::deque<T>q_;};
template<class T> class SynchronizedRingBuffer { public: explicit SynchronizedRingBuffer(size_t c):r_(c){} bool push(T v,bool overwrite=true){std::lock_guard<std::mutex>l(m_);return r_.push(std::move(v),overwrite);} std::optional<T> pop(){std::lock_guard<std::mutex>l(m_);return r_.pop();} size_t size()const{std::lock_guard<std::mutex>l(m_);return r_.size();} private:mutable std::mutex m_;RingBuffer<T>r_;};
}
