#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <pthread.h>
#include <stdatomic.h>
#include <sched.h>

void probe_init(void);
void probe_start(void);
void probe_resolve(const char *, uint64_t);
void probe_reject(void);
void probe_read(const char **, uint64_t *);
void probe_sync(const char **, uint64_t *);
void probe_collect(void);
void probe_reset(void);
int32_t probe_async_step(uint32_t);
int32_t probe_async_pending(void);
int32_t probe_shutdown(void);
static atomic_int ready;
static void check(int ok, const char *label) {
  if (!ok) { fprintf(stderr, "FAIL %s\n", label); exit(1); }
}
static void expect(const char *expected) {
  const char *p; uint64_t n;
  probe_read(&p, &n);
  check(n == strlen(expected) && !memcmp(p, expected, n), expected);
  probe_reset();
}
static void drain(void) {
  int rounds = 0;
  while (probe_async_pending() && rounds++ < 100) probe_async_step(1);
  check(!probe_async_pending(), "bounded drain");
}
static void *worker(void *arg) {
  long id = (long)arg;
  char tag[32], expected[80];
  snprintf(tag, sizeof(tag), "thread-%ld-鸿蒙", id);
  snprintf(expected, sizeof(expected), "sync:prefix:%s:done", tag);
  for (int i = 0; i < 20; i++) {
    probe_init();
    const char *p; uint64_t n;
    probe_sync(&p, &n);
    const char *want = "{\"message\":\"鸿蒙😀\",\"value\":21,\"sum\":8,\"caught\":\"caught\"}";
    check(n == strlen(want) && !memcmp(p, want, n), "JSON Unicode array map exception");
    probe_reset();
    probe_start(); expect("sync:prefix");
    if (i == 0) {
      atomic_fetch_add(&ready, 1);
      while (atomic_load(&ready) != 2) sched_yield();
    }
    check(!probe_shutdown(), "shutdown refuses suspended fiber");
    probe_resolve(tag, strlen(tag));
    expect("sync:prefix");
    drain(); expect(expected);
    probe_start(); expect("sync:prefix");
    probe_reject(); drain(); expect("sync:prefix:caught:host-rejection:done");
    probe_collect();
    check(probe_shutdown(), "shutdown after drain");
  }
  return NULL;
}
int main(void) {
  pthread_t a, b;
  check(!pthread_create(&a, NULL, worker, (void *)1), "thread create 1");
  check(!pthread_create(&b, NULL, worker, (void *)2), "thread create 2");
  check(!pthread_join(a, NULL) && !pthread_join(b, NULL), "thread join");
  puts("RUNTIME_PROBE PASS threads=2 sessions=40 async=80 unicode=json+utf8 nested_await=ok rejection=ok shutdown=ok");
  return 0;
}
