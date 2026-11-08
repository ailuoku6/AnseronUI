#include "anseronui_core.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
int main(void) {
  anseronui_core_init(); anseronui_core_create();
  char *line = NULL; size_t capacity = 0; ssize_t length;
  while ((length = getline(&line, &capacity, stdin)) > 0) {
    if (line[0] != '\n') anseronui_core_post((const uint8_t *)line, (uint64_t)length);
    /* Finish the microtask checkpoint before processing an ordinary input. */
    const uint8_t *output; uint64_t count;
    if (anseronui_core_async_step(1024)) { fputs("microtask budget exceeded\n", stderr); return 2; }
    anseronui_core_step(&output, &count);
    fwrite(output, 1, count, stdout); fputc('\n', stdout); fflush(stdout);
    anseronui_core_reset();
  }
  free(line); anseronui_core_dispose();
  while (anseronui_core_async_pending()) anseronui_core_async_step(1024);
  anseronui_core_collect();
  if (!anseronui_core_shutdown()) { fputs("Core still has suspended work\n", stderr); return 3; }
  return 0;
}
