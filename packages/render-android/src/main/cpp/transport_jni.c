#include <jni.h>
#include <stdint.h>
#include "anseronui_transport.h"
#define JNI(name) Java_org_anseronui_render_NativeCore_##name
static AnseronUIContext *context(jlong handle) { return (AnseronUIContext *)(uintptr_t)handle; }
static void failure(JNIEnv *env, AnseronUIContext *ctx) {
  jclass type = (*env)->FindClass(env, "java/lang/IllegalStateException");
  (*env)->ThrowNew(env, type, anseronui_error(ctx));
}
JNIEXPORT jlong JNICALL JNI(nativeOpen)(JNIEnv *env, jobject self) {
  (void)self; AnseronUIContext *ctx = anseronui_open();
  if (!ctx || anseronui_error(ctx)[0]) { failure(env, ctx); return 0; }
  return (jlong)(uintptr_t)ctx;
}
JNIEXPORT void JNICALL JNI(nativePost)(JNIEnv *env, jobject self, jlong handle, jbyteArray bytes) {
  (void)self; AnseronUIContext *ctx = context(handle);
  jsize length = (*env)->GetArrayLength(env, bytes);
  jbyte *input = (*env)->GetByteArrayElements(env, bytes, NULL);
  if (!input) return;
  int ok = anseronui_post(ctx, (uint8_t *)input, (size_t)length);
  (*env)->ReleaseByteArrayElements(env, bytes, input, JNI_ABORT);
  if (!ok) failure(env, ctx);
}
JNIEXPORT jbyteArray JNICALL JNI(nativeStep)(JNIEnv *env, jobject self, jlong handle) {
  (void)self; AnseronUIContext *ctx = context(handle); uint8_t *bytes; size_t length;
  if (!anseronui_step(ctx, &bytes, &length)) { failure(env, ctx); return NULL; }
  jbyteArray result = (*env)->NewByteArray(env, (jsize)length);
  if (result) (*env)->SetByteArrayRegion(env, result, 0, (jsize)length, (const jbyte *)bytes);
  anseronui_free(bytes); return result;
}
JNIEXPORT jboolean JNICALL JNI(nativePending)(JNIEnv *env, jobject self, jlong handle) {
  (void)env; (void)self; return anseronui_pending(context(handle)) ? JNI_TRUE : JNI_FALSE;
}
JNIEXPORT void JNICALL JNI(nativeClose)(JNIEnv *env, jobject self, jlong handle) {
  (void)self; AnseronUIContext *ctx = context(handle);
  if (!anseronui_close(ctx)) failure(env, ctx);
}
