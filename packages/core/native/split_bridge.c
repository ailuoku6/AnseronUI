/* Compatibility facade. Each call returns before entering the other archive.
 * Only borrowed UTF-8 bytes cross the boundary, copied by the receiving entry. */
#include "anseronui_core.h"
#include <stdlib.h>
#include <string.h>

typedef void (*PanicSink)(void *, const uint8_t *, size_t, uint64_t);
#define DECLARE_RUNTIME(prefix) \
  void prefix##init(void); \
  void prefix##sink(PanicSink, void *); \
  void prefix##reset(void); \
  void prefix##collect(void); \
  int32_t prefix##shutdown(void); \
  double prefix##version(void);
DECLARE_RUNTIME(anseronui_framework_)
DECLARE_RUNTIME(anseronui_business_)
void anseronui_framework_dispose(void);
void anseronui_framework_execute(const uint8_t *, uint64_t, const uint8_t **, uint64_t *);
void anseronui_business_create(void);
void anseronui_business_post(const uint8_t *, uint64_t);
void anseronui_business_advance(void);
void anseronui_business_step(const uint8_t **, uint64_t *);
void anseronui_business_coreRequest(const uint8_t **, uint64_t *);
void anseronui_business_coreResult(const uint8_t *, uint64_t);
uint8_t anseronui_business_pending(void);
int32_t anseronui_business_async_step(uint32_t);
int32_t anseronui_business_async_pending(void);
void anseronui_business_dispose(void);
static _Thread_local PanicSink sink;
static _Thread_local void *sink_context;
static void fail(const char *message) {
  if (sink) sink(sink_context, (const uint8_t *)message, strlen(message), 0);
  abort();
}
void anseronui_core_sink(PanicSink fn, void *context) {
  sink = fn; sink_context = context;
  anseronui_framework_sink(fn, context); anseronui_business_sink(fn, context);
}
void anseronui_core_init(void) {
  anseronui_framework_init(); anseronui_business_init();
  if (anseronui_framework_version() != 2 || anseronui_business_version() != 2) fail("CORE_ABI_MISMATCH");
}
void anseronui_core_create(void) { anseronui_business_create(); }
void anseronui_core_post(const uint8_t *input, uint64_t length) { anseronui_business_post(input, length); }
void anseronui_core_step(const uint8_t **output, uint64_t *length) {
  anseronui_business_advance();
  for (int turns = 0; ; turns++) {
    const uint8_t *request; uint64_t request_length;
    anseronui_business_coreRequest(&request, &request_length);
    if (!request_length) break;
    if (turns >= 4096) fail("CORE_BRIDGE_BUDGET");
    const uint8_t *response; uint64_t response_length;
    anseronui_framework_execute(request, request_length, &response, &response_length);
    anseronui_business_reset();
    anseronui_business_coreResult(response, response_length);
    anseronui_framework_reset();
  }
  anseronui_business_step(output, length);
}
uint8_t anseronui_core_pending(void) { return anseronui_business_pending(); }
int32_t anseronui_core_async_step(uint32_t budget) { return anseronui_business_async_step(budget); }
int32_t anseronui_core_async_pending(void) { return anseronui_business_async_pending(); }
void anseronui_core_dispose(void) { anseronui_business_dispose(); anseronui_framework_dispose(); }
void anseronui_core_reset(void) { anseronui_business_reset(); anseronui_framework_reset(); }
void anseronui_core_collect(void) { anseronui_business_collect(); anseronui_framework_collect(); }
int32_t anseronui_core_shutdown(void) {
  if (!anseronui_business_shutdown()) return 0;
  return anseronui_framework_shutdown();
}
