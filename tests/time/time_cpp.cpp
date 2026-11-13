#include "cpm_time.hpp"
#include <cassert>
#include <atomic>
#include <chrono>
#include <iostream>
#include <stdexcept>
#include <thread>
using namespace std::chrono_literals;
int main() {
  bool threw=false; try { cpm::PeriodicTimer t(0ms); (void)t; } catch (const std::invalid_argument&) { threw=true; } assert(threw);
  int ticks=0; bool early=cpm::delayWithCallback(85ms,20ms,[&](auto elapsed,auto n){(void)elapsed; assert(n==static_cast<unsigned>(ticks+1));ticks++;return false;});assert(!early && ticks>=2 && ticks<=4);
  ticks=0;early=cpm::delayWithCallback(100ms,10ms,[&](auto,auto){return ++ticks==2;});assert(early && ticks==2);
  ticks=0;early=cpm::delayWithCallback(15ms,40ms,[&](auto,auto){ticks++;return false;});assert(!early && ticks==0);
  cpm::Scheduler s;int finish=0; cpm::TimedEndReason reason=cpm::TimedEndReason::Stopped;
  auto id=s.everyUntil(10ms,70ms,[&](const auto&){ ticks++;return false;},[&](auto,cpm::TimedEndReason r,auto){finish++;reason=r;});
  while(s.scheduled(id)) s.waitAndPoll(40ms);
  assert(finish==1 && reason==cpm::TimedEndReason::Timeout);
  ticks=0;finish=0;id=s.everyUntil(10ms,100ms,[&](const auto&){return ++ticks>=2;},[&](auto,cpm::TimedEndReason r,auto){finish++;reason=r;});
  while(s.scheduled(id)) s.waitAndPoll(40ms);
  assert(ticks==2 && finish==1 && reason==cpm::TimedEndReason::Stopped);
  ticks=0;finish=0;id=s.everyUntil(50ms,15ms,[&](const auto&){ticks++;return false;},[&](auto,cpm::TimedEndReason r,auto){finish++;reason=r;});
  while(s.scheduled(id)) s.waitAndPoll(40ms);
  assert(ticks==0 && finish==1 && reason==cpm::TimedEndReason::Timeout);
  ticks=0;finish=0;id=s.everyUntil(10ms,90ms,[&](const auto&){++ticks;std::this_thread::sleep_for(30ms);return false;},[&](auto,cpm::TimedEndReason,auto){finish++;});
  while(s.scheduled(id)) s.waitAndPoll(40ms);
  assert(ticks<=4 && finish==1);
  std::atomic<int> bg{0}; cpm::Scheduler s2;
  id=s2.everyUntil(8ms,55ms,[&](const auto&){++bg;return false;});
  s2.startBackground();std::this_thread::sleep_for(90ms);s2.stopBackground();assert(bg>=1 && !s2.scheduled(id));
  cpm::Scheduler s3;std::atomic<int> selfStop{0};s3.after(10ms,[&](const auto&){selfStop++;s3.stopBackground();});s3.startBackground();std::this_thread::sleep_for(50ms);s3.stopBackground();assert(selfStop==1);
  std::cout<<"C++ time regression PASS"<<std::endl;
}
