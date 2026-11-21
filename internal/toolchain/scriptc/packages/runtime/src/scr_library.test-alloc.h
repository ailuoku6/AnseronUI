#include <stddef.h>
#include <stdlib.h>
void *test_malloc(size_t);
void *test_calloc(size_t, size_t);
void *test_realloc(void *, size_t);
void test_free(void *);
#define malloc test_malloc
#define calloc test_calloc
#define realloc test_realloc
#define free test_free
