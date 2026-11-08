#ifndef ANSERONUI_TRANSPORT_H
#define ANSERONUI_TRANSPORT_H
#include <stddef.h>
#include <stdint.h>
#ifdef __cplusplus
extern "C" {
#endif
typedef struct AnseronUIContext AnseronUIContext;
/* One context per fixed OS thread; different threads are independent. */
AnseronUIContext *anseronui_open(void);
const char *anseronui_error(AnseronUIContext *context);
int anseronui_post(AnseronUIContext *context, const uint8_t *bytes, size_t length);
/* Returned bytes are owned by the caller and released with anseronui_free. */
int anseronui_step(AnseronUIContext *context, uint8_t **bytes, size_t *length);
int anseronui_pending(AnseronUIContext *context);
int anseronui_close(AnseronUIContext *context);
void anseronui_free(void *bytes);
#ifdef __cplusplus
}
#endif
#endif
