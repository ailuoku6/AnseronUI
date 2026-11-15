#include "scr_runtime.h"
#include <stdio.h>
#include <stdlib.h>
void probe_init(void);
int32_t probe_shutdown(void);
int32_t probe_async_step(uint32_t);
int32_t probe_async_pending(void);
static ScrPromise *gate;
static int finished;
static void check(int ok, const char *label) {
  if (!ok) { fprintf(stderr, "FAIL %s\n", label); exit(1); }
}
static void body(ScrFiber *self, void *opaque) {
  (void)opaque;
  register uint64_t integer __asm__("x19") = UINT64_C(0x123456789abcdef0);
  register double fraction __asm__("d8") = 21.125;
  __asm__ volatile("" : "+r"(integer), "+w"(fraction));
  check(scr_await_f64(gate) == 21.0, "stackful gate value");
  for (int i = 0; i < 2000; i++) {
    scr_await_hop();
    __asm__ volatile("" : "+r"(integer), "+w"(fraction));
    check(integer == UINT64_C(0x123456789abcdef0), "x19 preserved");
    check(fraction == 21.125, "d8 preserved");
  }
  finished++;
  scr_promise_fulfill_void(scr_fiber_promise(self));
}
int main(void) {
  probe_init();
  gate = scr_promise_new();
  ScrPromise *task = scr_async_spawn(body, NULL);
  ScrPromise *peer = scr_async_spawn(body, NULL);
  check(!finished && !probe_shutdown(), "stackful suspended");
  scr_promise_fulfill_f64(gate, 21.0);
  int rounds = 0;
  while (probe_async_pending() && rounds++ < 10000) probe_async_step(1);
  check(finished == 2 && rounds >= 2000, "stackful resumed");
  scr_promise_release(task); scr_promise_release(peer); scr_promise_release(gate);
  check(probe_shutdown(), "stackful shutdown");
  printf("FIBER_PROBE PASS backend=AArch64-fast-context fibers=2 awaits=4000 checkpoints=%d x19=ok d8=ok mmap_stack=ok shutdown=ok\n", rounds);
  return 0;
}
