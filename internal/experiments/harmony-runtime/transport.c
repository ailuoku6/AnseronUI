#include "anseronui_transport.h"
#include <pthread.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdatomic.h>
#include <sched.h>
static atomic_int ready;
static void check(int ok, const char *label) { if (!ok) { fprintf(stderr, "FAIL %s\n", label); exit(1); } }
static void *foreign(void *ctx) {
  const uint8_t input[] = "{}";
  uint8_t *bytes; size_t length;
  check(!anseronui_post(ctx, input, 2), "foreign post");
  check(!anseronui_step(ctx, &bytes, &length), "foreign step");
  check(!anseronui_close(ctx), "foreign close");
  return NULL;
}
static void *worker(void *arg) {
  long id = (long)arg;
  for (int i = 0; i < 10; i++) {
    AnseronUIContext *ctx = anseronui_open();
    check(ctx && !*anseronui_error(ctx), "open");
    check(!anseronui_open(), "one context per thread");
    if (!i) {
      atomic_fetch_add(&ready, 1);
      while (atomic_load(&ready) != 2) sched_yield();
      pthread_t other; check(!pthread_create(&other, NULL, foreign, ctx), "foreign create");
      check(!pthread_join(other, NULL), "foreign join");
    }
    const char *input = "{\"protocolMajor\":1,\"protocolMinor\":0,\"bundleBuildId\":\"anseronui-demo\",\"runtimeEpoch\":1,\"surfaceId\":1,\"surfaceGeneration\":1,\"sequence\":1,\"ackSequence\":0,\"payload\":{\"type\":\"Handshake\",\"requiredNodes\":[\"View\",\"Text\"]}}";
    check(anseronui_post(ctx, (void *)input, strlen(input)), "handshake post");
    uint8_t *bytes = NULL; size_t length = 0;
    check(anseronui_step(ctx, &bytes, &length), "handshake step");
    char *text = malloc(length + 1); check(text != NULL, "copy allocation");
    memcpy(text, bytes, length); text[length] = 0;
    check(strstr(text, "\"Ready\"") != NULL, "Ready response");
    free(text); anseronui_free(bytes);
    check(anseronui_close(ctx), "close");
  }
  return (void *)id;
}
int main(void) {
  pthread_t a, b; void *ra, *rb;
  check(!pthread_create(&a, NULL, worker, (void *)1), "worker 1");
  check(!pthread_create(&b, NULL, worker, (void *)2), "worker 2");
  check(!pthread_join(a, &ra) && !pthread_join(b, &rb), "join");
  check((long)ra == 1 && (long)rb == 2, "worker results");
  puts("CORE_TRANSPORT PASS threads=2 sessions=20 handshake=ok ownership=ok duplicate_open=refused close=ok");
  return 0;
}
