#include "anseronui_transport.h"
#include <assert.h>
#include <pthread.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static void *exercise(void *unused) {
  (void)unused;
  const char *message = "{\"protocolMajor\":1,\"protocolMinor\":0,\"bundleBuildId\":\"anseronui-demo\",\"runtimeEpoch\":1,\"surfaceId\":1,\"surfaceGeneration\":1,\"sequence\":1,\"ackSequence\":0,\"payload\":{\"type\":\"Handshake\",\"requiredNodes\":[\"Text\"]}}";
  for (int round = 0; round < 50; round++) {
    AnseronUIContext *context = anseronui_open();
    assert(context && !*anseronui_error(context));
    assert(anseronui_open() == NULL); /* one runtime per owner thread */
    assert(anseronui_post(context, (const uint8_t *)message, strlen(message)));
    uint8_t *bytes = NULL; size_t length = 0;
    assert(anseronui_step(context, &bytes, &length));
    char *json = calloc(length + 1, 1); assert(json);
    memcpy(json, bytes, length);
    assert(strstr(json, "Ready"));
    free(json); anseronui_free(bytes);
    assert(!anseronui_pending(context));
    assert(anseronui_close(context));
  }
  return NULL;
}
int main(void) {
  pthread_t threads[4];
  for (int i=0;i<4;i++) assert(pthread_create(&threads[i], NULL, exercise, NULL) == 0);
  for (int i=0;i<4;i++) assert(pthread_join(threads[i], NULL) == 0);
  puts("Core lifecycle: 4 concurrent owner threads, 200 create/step/dispose cycles passed");
  return 0;
}
