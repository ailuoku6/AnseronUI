const targets = {
  'arm64-v8a': { arch: 'arm64', target: 'aarch64-linux-android', clang: 'aarch64-linux-android26-clang' },
  x86_64: { arch: 'x64', target: 'x86_64-linux-android', clang: 'x86_64-linux-android26-clang' },
};

// Builds default to ARM64. Device runs select the first supported device ABI;
// an explicit choice must match the device rather than silently falling back.
export function androidABI(env = process.env, deviceABIs) {
  const supported = deviceABIs?.split(',').map(abi => abi.trim());
  const abi = env.ANSERONUI_ANDROID_ABI ?? (supported ? supported.find(abi => Object.hasOwn(targets, abi)) : 'arm64-v8a');
  if (!Object.hasOwn(targets, abi)) throw new Error('Android supports arm64-v8a and x86_64. Set ANSERONUI_ANDROID_ABI to one of these ABIs.');
  if (supported && !supported.includes(abi)) throw new Error(`Android ABI ${abi} is incompatible with device ABIs ${deviceABIs}.`);
  return { abi, ...targets[abi], minimumApi: 26 };
}

export function androidTargetIdentity(env = process.env) {
  const { abi, arch, target, minimumApi } = androidABI(env);
  return { platform: 'android', abi, arch, target, minimumApi };
}
