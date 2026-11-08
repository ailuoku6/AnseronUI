#ifndef ANSERONUI_CORE_H
#define ANSERONUI_CORE_H
#include <stdint.h>
#include <stddef.h>
#ifdef __cplusplus
extern "C" {
#endif
/* All calls belong to one fixed owner thread. Copy output before reset/collect. */
void anseronui_core_sink(void (*sink)(void *, const uint8_t *, size_t, uint64_t), void *context);
int32_t anseronui_core_shutdown(void);
void anseronui_core_init(void);
void anseronui_core_create(void);
void anseronui_core_post(const uint8_t *data, uint64_t length);
void anseronui_core_step(const uint8_t **data, uint64_t *length);
uint8_t anseronui_core_pending(void);
int32_t anseronui_core_async_step(uint32_t budget);
int32_t anseronui_core_async_pending(void);
void anseronui_core_dispose(void);
void anseronui_core_reset(void);
void anseronui_core_collect(void);
#ifdef __cplusplus
}
#endif
#endif
