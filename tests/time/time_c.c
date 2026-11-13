#define _POSIX_C_SOURCE 200809L
#include "cpm_time.h"
#include <assert.h>
#include <inttypes.h>
#include <math.h>
#include <stdio.h>
#include <stdint.h>

typedef struct {int ticks; int done; CpmIntervalEndReason reason; uint64_t lastElapsed;} State;
static int tick(CpmTimerId id,uint64_t elapsed,uint64_t invocation,void *u) {
 State *s=u; (void)id; assert(invocation==(uint64_t)(s->ticks+1));s->ticks++;s->lastElapsed=elapsed;return 0;
}
static int stop2(CpmTimerId id,uint64_t elapsed,uint64_t invocation,void *u) {
 int r=tick(id,elapsed,invocation,u); (void)r; return invocation==2;
}
static void finish(CpmTimerId id,CpmIntervalEndReason reason,uint64_t elapsed,uint64_t invoked,void *u) {
 State *s=u; (void)id; (void)elapsed;assert(invoked==(uint64_t)s->ticks);s->done++;s->reason=reason;
}
static int slow(CpmTimerId id,uint64_t elapsed,uint64_t n,void *u) {
 (void)id;(void)elapsed;(void)n;State *s=u;s->ticks++;CpmTime_SleepMs(35);return 0;
}
int main(void) {
 State st={0}; CpmScheduler sch; int n; CpmTimerId id;
 assert(CpmTime_DelayWithCallbackMs(85,20,tick,&st)==0);
 assert(st.ticks>=2 && st.ticks<=4);
 st=(State){0};assert(CpmTime_DelayWithCallbackMs(100,10,stop2,&st)==1);assert(st.ticks==2);
 st=(State){0};assert(CpmTime_DelayWithCallbackMs(15,50,tick,&st)==0);assert(st.ticks==0);
 assert(CpmTime_DelayWithCallbackMs(15,0,tick,&st)<0);
 assert(CpmTime_SleepSeconds(NAN)<0);
 CpmDeadline dl;assert(CpmDeadline_AfterSeconds(&dl,2.0)==0); // valid input
 assert(CpmDeadline_AfterSeconds(&dl,NAN)<0);
 CpmScheduler_Init(&sch);
 id=CpmScheduler_ScheduleForMs(&sch,90,20,tick,finish,&st); assert(id);
 while(CpmScheduler_IsScheduled(&sch,id)){n=CpmScheduler_WaitAndPoll(&sch,50,0);assert(n>=0);}
 assert(st.done==1 && st.reason==CPM_INTERVAL_TIMEOUT);
 assert(st.ticks>=2 && st.ticks<=4);
 st=(State){0};id=CpmScheduler_ScheduleForMs(&sch,100,10,stop2,finish,&st);assert(id);
 while(CpmScheduler_IsScheduled(&sch,id)) assert(CpmScheduler_WaitAndPoll(&sch,50,0)>=0);
 assert(st.ticks==2 && st.done==1 && st.reason==CPM_INTERVAL_STOPPED);
 st=(State){0};id=CpmScheduler_ScheduleForMs(&sch,20,50,tick,finish,&st);assert(id);
 while(CpmScheduler_IsScheduled(&sch,id)) assert(CpmScheduler_WaitAndPoll(&sch,50,0)>=0);
 assert(st.ticks==0 && st.done==1 && st.reason==CPM_INTERVAL_TIMEOUT);
 st=(State){0};id=CpmScheduler_ScheduleForMs(&sch,150,10,slow,finish,&st);assert(id);
 while(CpmScheduler_IsScheduled(&sch,id)) assert(CpmScheduler_WaitAndPoll(&sch,50,0)>=0);
 assert(st.ticks<=5 && st.done==1);
 st=(State){0};id=CpmScheduler_ScheduleForMs(&sch,80,10,tick,finish,&st); assert(id);
 assert(CpmScheduler_Cancel(&sch,id)==0);CpmScheduler_Poll(&sch,0);assert(st.done==0);
 CpmPeriodicTimer timer;assert(CpmPeriodicTimer_InitMs(&timer,1)==0);
 CpmTime_SleepMs(20); // timer starts upon first wait
 assert(CpmPeriodicTimer_WaitNext(&timer,NULL)==0);
 CpmScheduler_Free(&sch);
 puts("C time regression PASS");return 0;
}
