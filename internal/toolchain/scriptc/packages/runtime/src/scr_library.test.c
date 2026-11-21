#include "scr_runtime.h"
#include <assert.h>
#include <pthread.h>
#include <stdio.h>
#include <string.h>
#undef malloc
#undef calloc
#undef realloc
#undef free

/* Count the runtime's real heap blocks, including pools disabled by RC audit.
 * The header preserves malloc alignment; libc/pthread allocations are excluded. */
typedef union { max_align_t alignment; size_t size; } TestHeader;
static _Thread_local size_t blocks, bytes;
void *test_malloc(size_t n) {
  TestHeader *h = malloc(sizeof(*h) + n);
  if (!h) return NULL;
  h->size = n; blocks++; bytes += n; return h + 1;
}
void test_free(void *p) {
  if (!p) return;
  TestHeader *h = (TestHeader *)p - 1;
  assert(blocks && bytes >= h->size);
  blocks--; bytes -= h->size; free(h);
}
void *test_calloc(size_t n, size_t size) {
  assert(!size || n <= SIZE_MAX / size);
  void *p = test_malloc(n * size);
  if (p) memset(p, 0, n * size);
  return p;
}
void *test_realloc(void *p, size_t n) {
  if (!p) return test_malloc(n);
  if (!n) { test_free(p); return NULL; }
  TestHeader *h = (TestHeader *)p - 1;
  size_t old = h->size;
  h = realloc(h, sizeof(*h) + n);
  if (!h) return NULL;
  h->size = n; bytes = bytes - old + n; return h + 1;
}
const char *const scr_library_trap_overlays[] = {NULL};
const size_t scr_library_trap_overlays_len = 0;

static const char matcher_key, builder_key;
static ScrDyn *materialize(void *p) { return scr_dyn_retain(p); }
static bool match_body(const ScrDyn *d) { (void)d; return true; }
static void *build_body(const ScrDyn *d, const ScrDynPath *path) {
  (void)path;
  ScrDyn *view = scr_dyn_visit_view(d);
  scr_dyn_build_add(d, &builder_key, view);
  return view;
}
static void conversion_session(void) {
  ScrDyn *source = scr_dyn_new_obj();
  ScrDyn *capsule = scr_dyn_new_typed_ref(source, scr_dyn_retain_v,
      scr_dyn_release_v, "test", 4, materialize, NULL);
  scr_dyn_retain(capsule);
  scr_dyn_from_enter(source);
  scr_dyn_from_leave();
  assert(scr_dyn_match_visit(capsule, &matcher_key, match_body));
  ScrDyn *built = scr_dyn_build_visit(capsule, NULL, &builder_key,
      build_body, scr_dyn_retain_v);
  scr_dyn_release(built);
  scr_dyn_release(capsule);
  scr_dyn_release(capsule);
  scr_dyn_release(source);
}

static void *sessions(void *unused) {
  (void)unused;
  for (int round = 0; round < 12; round++) {
    scr_library_reset();
    conversion_session();
    const char *json = "{\"rows\":[{\"name\":\"first\",\"value\":12},{\"name\":\"second\",\"value\":34}]}";
    ScrStr *input = scr_str_new(json, strlen(json));
    ScrDyn *value = scr_json_parse(input);
    assert(value && !scr_exc_pending());
    scr_str_release(input);
    ScrJsonBuf buffer; scr_jb_init(&buffer); scr_jb_put_dyn(&buffer, value);
    ScrStr *encoded = scr_jb_finish(&buffer);
    const uint8_t *out; size_t length;
    scr_library_str_out(encoded, &out, &length);
    assert(length > 20 && out[0] == '{');
    scr_dyn_release(value);
    /* A cycle that owns a large string: collection itself repopulates pools. */
    ScrDyn *cycle = scr_dyn_new_obj();
    scr_dyn_obj_set(cycle, "self", 4, scr_dyn_retain(cycle));
    char large[4096]; memset(large, 'x', sizeof large);
    ScrStr *text = scr_str_new(large, sizeof large);
    scr_dyn_obj_set(cycle, "text", 4, scr_dyn_new_str(text));
    scr_str_release(text);
    scr_dyn_release(cycle);
    scr_library_reset();
    if (blocks || bytes) {
      fprintf(stderr, "session %d retained %zu blocks / %zu bytes\n", round, blocks, bytes);
      return (void *)1;
    }
    /* Empty reset must also be repeatable. */
    scr_library_reset();
    assert(!blocks && !bytes);
  }
  return NULL;
}
int main(void) {
  for (int generation = 0; generation < 3; generation++) {
    pthread_t threads[4];
    for (int i = 0; i < 4; i++) assert(!pthread_create(&threads[i], NULL, sessions, NULL));
    for (int i = 0; i < 4; i++) {
      void *result;
      assert(!pthread_join(threads[i], &result));
      if (result) return 1;
    }
  }
  puts("library sessions release all tracked allocations");
}
