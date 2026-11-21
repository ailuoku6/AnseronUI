#undef NDEBUG
#include "scr_async.c"
#include <assert.h>

static ScrPromise *reject(bool handled) {
  ScrPromise *p = scr_promise_new();
  scr_throw_str(scr_str_new("caught network error", 20));
  scr_promise_reject_pending(p);
  if (handled) scr_promise_mark_handled(p);
  return p;
}

static void handle_after_hop(ScrFiber *self, void *arg) {
  (void)self;
  scr_await_hop();
  scr_promise_mark_handled(arg);
  scr_promise_release(arg);
}

static void handled_rejections(void) {
  for (size_t i = 0; i < 1000; i++) {
    ScrPromise *p = reject(true);
    scr_promise_release(p);
    assert(scr_embed_step(1) == 0);
    assert(scr_nunhandled == 0);
  }
}

static void delayed_handler(void) {
  ScrPromise *p = reject(false);
  assert(scr_embed_step(0) == 0);
  assert(scr_nunhandled == 1 && p->rc == 2);
  ScrPromise *job = scr_async_spawn(handle_after_hop, scr_promise_retain(p));
  assert(scr_embed_step(0) == 1);
  assert(scr_nunhandled == 1);
  ScrPromise *other = reject(false);
  ScrPromise *other_job = scr_async_spawn(handle_after_hop, scr_promise_retain(other));
  assert(scr_embed_step(1) == 1);
  assert(scr_nunhandled == 2);
  assert(scr_embed_step(1) == 0);
  assert(scr_nunhandled == 0 && p->rc == 1 && other->rc == 1);
  scr_promise_release(other_job);
  scr_promise_release(other);
  scr_promise_release(job);
  scr_promise_release(p);
}

static size_t dropped;
static void *retain_payload(void *p) { return p; }
static void release_payload(void *p) {
  (void)p;
  dropped++;
  assert(scr_embed_close() == 0);
  /* Exercise tracking-array realloc while its old entries are drained. */
  for (size_t i = 0; i < 64; i++) scr_promise_release(reject(false));
  assert(scr_embed_step(0) == 0);
}

static void appended_rejections(void) {
  ScrPromise *first = reject(false);
  ScrPromise *p = scr_promise_new();
  scr_throw_ref(&dropped, retain_payload, release_payload, NULL);
  scr_promise_reject_pending(p);
  scr_promise_mark_handled(p);
  scr_promise_release(p);
  ScrPromise *last = reject(false);
  assert(scr_embed_step(0) == 0);
  assert(dropped == 1 && scr_nunhandled == 66);
  assert(scr_maybe_unhandled[0] == first && scr_maybe_unhandled[1] == last);
  for (size_t i = 0; i < scr_nunhandled; i++)
    scr_promise_mark_handled(scr_maybe_unhandled[i]);
  assert(scr_embed_step(0) == 0);
  assert(scr_nunhandled == 0 && first->rc == 1 && last->rc == 1);
  scr_promise_release(first);
  scr_promise_release(last);
}

int main(void) {
  scr_init();
  for (size_t session = 0; session < 3; session++) {
    handled_rejections();
    delayed_handler();
    dropped = 0;
    appended_rejections();
    scr_promise_release(reject(false));
    assert(scr_embed_close() == 1 && scr_nunhandled == 0);
    assert(!scr_exc_pending());
  }
  puts("embedding releases handled rejections and preserves delayed handlers");
  return 0;
}
