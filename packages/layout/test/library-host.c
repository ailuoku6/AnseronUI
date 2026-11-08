#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>

extern void anseronui_layout_init(void);
extern void anseronui_layout_set_panic_sink(void (*fn)(void *, const uint8_t *, size_t, uint64_t), void *ctx);
extern void anseronui_layout_probe(double width, double height, double direction, const uint8_t **out, size_t *out_len);
extern void anseronui_layout_reset(void);
extern void anseronui_layout_collect(void);

static void panic_sink(void *ctx, const uint8_t *message, size_t length, uint64_t address) {
  (void)ctx;
  (void)address;
  fwrite(message, 1, length, stderr);
  exit(1);
}

int main(void) {
  anseronui_layout_set_panic_sink(panic_sink, NULL);
  anseronui_layout_init();
  for (int i = 0; i < 16; i++) {
    const uint8_t *output = NULL;
    size_t length = 0;
    anseronui_layout_probe(45 + i * 7.25, 40 + i, i % 2 == 0 ? 1 : 2, &output, &length);
    fwrite(output, 1, length, stdout);
    fputc('\n', stdout);
    anseronui_layout_reset();
    anseronui_layout_collect();
  }
  return 0;
}
