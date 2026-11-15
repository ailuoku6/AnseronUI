#include <stdio.h>
#include <pthread.h>
#include <sys/mman.h>
static _Thread_local int tls;
static void *worker(void *unused) { (void)unused; tls = 21; return (void *)(long)tls; }
int main(void) {
  pthread_t thread; void *value;
  tls = 6;
  if (pthread_create(&thread, NULL, worker, NULL) || pthread_join(thread, &value)) return 1;
  void *memory = mmap(NULL, 4096, PROT_READ | PROT_WRITE, MAP_PRIVATE | MAP_ANONYMOUS, -1, 0);
  if (memory == MAP_FAILED || munmap(memory, 4096)) return 2;
  if (tls != 6 || (long)value != 21) return 3;
  printf("SDK_SMOKE PASS thread=%ld main_tls=%d mmap=ok\n", (long)value, tls);
  return 0;
}
