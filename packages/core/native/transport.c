#include "anseronui_core.h"
#include "anseronui_transport.h"
#include <pthread.h>
#include <setjmp.h>
#include <stdlib.h>
#include <string.h>

struct AnseronUIContext {
  pthread_t owner;
  jmp_buf escape;
  int entered;
  int poisoned;
  char error[2048];
};
static _Thread_local AnseronUIContext *current;
static void panic_sink(void *opaque, const uint8_t *message, size_t length, uint64_t address) {
  (void)address;
  AnseronUIContext *ctx = opaque;
  size_t n = length < sizeof(ctx->error)-1 ? length : sizeof(ctx->error)-1;
  memcpy(ctx->error, message, n); ctx->error[n] = 0;
  ctx->poisoned = 1;
  if (ctx->entered) longjmp(ctx->escape, 1);
  abort();
}
static int enter(AnseronUIContext *ctx) {
  if (!ctx || current != ctx || !pthread_equal(ctx->owner, pthread_self())) return 0;
  if (ctx->entered || ctx->poisoned) return 0;
  ctx->entered = 1;
  return 1;
}
#define ENTER(ctx) if (!enter(ctx)) return 0; if (setjmp((ctx)->escape)) { (ctx)->entered = 0; return 0; }
#define LEAVE(ctx) do { (ctx)->entered = 0; return 1; } while (0)
AnseronUIContext *anseronui_open(void) {
  if (current) return NULL;
  AnseronUIContext *ctx = calloc(1, sizeof(*ctx));
  if (!ctx) return NULL;
  current = ctx; ctx->owner = pthread_self(); ctx->entered = 1;
  if (setjmp(ctx->escape)) { ctx->entered = 0; return ctx; }
  anseronui_core_sink(panic_sink, ctx);
  anseronui_core_init(); anseronui_core_create(); ctx->entered = 0;
  return ctx;
}
const char *anseronui_error(AnseronUIContext *ctx) { return ctx ? ctx->error : "Core owner thread already in use or allocation failed"; }
int anseronui_post(AnseronUIContext *ctx, const uint8_t *bytes, size_t length) {
  ENTER(ctx);
  if (!bytes || length > 1048576) { strcpy(ctx->error, "Invalid input message"); ctx->entered = 0; return 0; }
  anseronui_core_post(bytes, length); LEAVE(ctx);
}
int anseronui_step(AnseronUIContext *ctx, uint8_t **bytes, size_t *length) {
  if (!bytes || !length) return 0;
  *bytes = NULL; *length = 0;
  ENTER(ctx);
  /* Yield after a bounded checkpoint, without admitting the next event. */
  if (anseronui_core_async_step(1024)) {
    *bytes = malloc(2); if (!*bytes) { ctx->entered = 0; return 0; }
    memcpy(*bytes, "[]", 2); *length = 2; LEAVE(ctx);
  }
  const uint8_t *output; uint64_t count;
  anseronui_core_step(&output, &count);
  *bytes = malloc((size_t)count);
  if (!*bytes && count) { ctx->entered = 0; return 0; }
  memcpy(*bytes, output, (size_t)count); *length = (size_t)count;
  anseronui_core_reset(); LEAVE(ctx);
}
int anseronui_pending(AnseronUIContext *ctx) {
  ENTER(ctx);
  int pending = anseronui_core_async_pending() || anseronui_core_pending();
  ctx->entered = 0; return pending;
}
int anseronui_close(AnseronUIContext *ctx) {
  ENTER(ctx);
  anseronui_core_dispose();
  for (int i=0; i<100 && anseronui_core_async_pending(); i++) anseronui_core_async_step(1024);
  if (!anseronui_core_shutdown()) { strcpy(ctx->error, "Core has unresolved async work at shutdown"); ctx->entered=0; return 0; }
  anseronui_core_sink(NULL, NULL);
  current = NULL; free(ctx); return 1;
}
void anseronui_free(void *bytes) { free(bytes); }
