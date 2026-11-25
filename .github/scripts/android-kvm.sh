#!/usr/bin/env bash
set -euo pipefail

if [[ $(uname -s) != Linux ]]; then
  echo '::error::Android KVM setup requires a Linux runner.'
  exit 1
fi

id
uname -a

if [[ ! -c /dev/kvm ]]; then
  echo 'KVM device is absent; trying the kernel modules.'
  if ! sudo modprobe kvm; then
    echo 'Could not load the kvm module.'
  fi
  if grep -qw vmx /proc/cpuinfo; then
    if ! sudo modprobe kvm_intel; then echo 'Could not load kvm_intel.'; fi
  elif grep -qw svm /proc/cpuinfo; then
    if ! sudo modprobe kvm_amd; then echo 'Could not load kvm_amd.'; fi
  fi
fi

if [[ ! -c /dev/kvm ]]; then
  lscpu
  echo '::error::/dev/kvm is unavailable. This runner has no usable KVM device; changing file permissions cannot enable missing nested virtualization.'
  exit 1
fi

# This hosted runner is disposable. Set the existing device's permissions
# directly instead of relying on asynchronous udev events or a new group login.
sudo chmod a+rw /dev/kvm
ls -l /dev/kvm

# Run as the ordinary runner user, just like the emulator. Opening the device
# alone does not prove that the host permits creating a virtual machine.
python3 - <<'PY'
import fcntl
import os
import sys

try:
    device = os.open('/dev/kvm', os.O_RDWR | os.O_CLOEXEC)
    try:
        version = fcntl.ioctl(device, 0xAE00, 0)  # KVM_GET_API_VERSION
        if version != 12:
            raise RuntimeError(f'Unsupported KVM API version: {version}')
        vm = fcntl.ioctl(device, 0xAE01, 0)  # KVM_CREATE_VM
        os.close(vm)
    finally:
        os.close(device)
except (OSError, RuntimeError) as error:
    print(f'::error::KVM is unusable for runner uid={os.getuid()}: {error}', file=sys.stderr)
    sys.exit(1)
print('KVM API 12: created and closed a virtual machine as the runner user.')
PY

"${ANDROID_HOME:?ANDROID_HOME must point to the Android SDK}/emulator/emulator" -accel-check
