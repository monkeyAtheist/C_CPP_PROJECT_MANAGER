#pragma once
#include <condition_variable>
#include <chrono>
#include <cstddef>
#include <mutex>
#include <queue>
#include <thread>
#include <utility>
namespace cpm {
class JoiningThread { public: JoiningThread()=default; template<class F,class...A> explicit JoiningThread(F&&f,A&&...a):t_(std::forward<F>(f),std::forward<A>(a)...){ } ~JoiningThread(){if(t_.joinable())t_.join();} JoiningThread(const JoiningThread&)=delete; JoiningThread& operator=(const JoiningThread&)=delete; JoiningThread(JoiningThread&&)=default; JoiningThread& operator=(JoiningThread&& other) noexcept { if(this!=&other){if(t_.joinable())t_.join();t_=std::move(other.t_);}return *this;} bool joinable()const noexcept{return t_.joinable();} void join(){t_.join();} std::thread::id id()const noexcept{return t_.get_id();} private:std::thread t_;};
class ManualResetEvent { public: explicit ManualResetEvent(bool set=false):set_(set){} void set(){std::lock_guard<std::mutex>l(m_);set_=true;cv_.notify_all();} void reset(){std::lock_guard<std::mutex>l(m_);set_=false;} void wait(){std::unique_lock<std::mutex>l(m_);cv_.wait(l,[this]{return set_;});} template<class Rep,class Period> bool waitFor(std::chrono::duration<Rep,Period>d){std::unique_lock<std::mutex>l(m_);return cv_.wait_for(l,d,[this]{return set_;});} private:std::mutex m_;std::condition_variable cv_;bool set_;};
template<class T> class BlockingQueue { public: void push(T v){{std::lock_guard<std::mutex>l(m_);q_.push(std::move(v));}cv_.notify_one();} T pop(){std::unique_lock<std::mutex>l(m_);cv_.wait(l,[this]{return !q_.empty();});T v=std::move(q_.front());q_.pop();return v;} template<class Rep,class Period> bool popFor(T&out,std::chrono::duration<Rep,Period>d){std::unique_lock<std::mutex>l(m_);if(!cv_.wait_for(l,d,[this]{return !q_.empty();}))return false;out=std::move(q_.front());q_.pop();return true;} size_t size()const{std::lock_guard<std::mutex>l(m_);return q_.size();} private:mutable std::mutex m_;std::condition_variable cv_;std::queue<T>q_;};
}
