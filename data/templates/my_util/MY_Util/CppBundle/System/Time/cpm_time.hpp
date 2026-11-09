#pragma once
#include <chrono>
#include <thread>
namespace cpm {
using SteadyClock=std::chrono::steady_clock;
inline std::uint64_t monotonicNs(){return std::chrono::duration_cast<std::chrono::nanoseconds>(SteadyClock::now().time_since_epoch()).count();}
inline std::uint64_t monotonicUs(){return std::chrono::duration_cast<std::chrono::microseconds>(SteadyClock::now().time_since_epoch()).count();}
inline std::uint64_t monotonicMs(){return std::chrono::duration_cast<std::chrono::milliseconds>(SteadyClock::now().time_since_epoch()).count();}
template<class Rep,class Period> inline void sleepFor(std::chrono::duration<Rep,Period> d){std::this_thread::sleep_for(d);}
class Stopwatch { public: void start(){running_=true;start_=SteadyClock::now();} void reset(){elapsed_=SteadyClock::duration::zero();running_=false;} void stop(){if(running_){elapsed_+=SteadyClock::now()-start_;running_=false;}} template<class D=std::chrono::milliseconds> auto elapsed()const{return std::chrono::duration_cast<D>(elapsed_+(running_?SteadyClock::now()-start_:SteadyClock::duration::zero()));} private: SteadyClock::time_point start_{}; SteadyClock::duration elapsed_{}; bool running_{false};};
class PeriodicTimer { public: explicit PeriodicTimer(std::chrono::nanoseconds p):period_(p),next_(SteadyClock::now()+p){} bool waitNext(){auto now=SteadyClock::now();bool overrun=now>next_; if(!overrun)std::this_thread::sleep_until(next_); do{next_+=period_;}while(next_<=SteadyClock::now()); return overrun;} void reset(){next_=SteadyClock::now()+period_;} private: std::chrono::nanoseconds period_; SteadyClock::time_point next_;};
}
