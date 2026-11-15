// Regression evidence for the existing poisoned transport cleanup limitation.
#include "anseronui_transport.h"
#include <stdio.h>
#include <string.h>
int main(void) {
  AnseronUIContext *ctx = anseronui_open();
  if (!ctx || *anseronui_error(ctx)) return 1;
  int posted = anseronui_post(ctx, (const unsigned char *)"{", 1);
  if (posted || !*anseronui_error(ctx)) return 2;
  printf("POISON_SINK captured=%s\n", anseronui_error(ctx));
  if (anseronui_close(ctx) || anseronui_open()) return 3;
  puts("KNOWN_LIMITATION_CONFIRMED poisoned_close=refused owner_thread_stays_occupied=yes");
  // Process teardown reclaims this intentionally poisoned verification instance.
  return 0;
}
