import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

export function androidJava17({ env = process.env, platform = process.platform, run = spawnSync } = {}) {
  let directory = env.JAVA_HOME;
  if (!directory && platform === 'darwin') {
    // Without -F java_home can return the default JDK when 17 is absent.
    const result = run('/usr/libexec/java_home', ['-F', '-v', '17'], { encoding: 'utf8', timeout: 30_000 });
    if (!result.error && result.status === 0) directory = result.stdout.trim();
  }
  if (!directory) throw new Error('Android tests require JDK 17. Install JDK 17 and set JAVA_HOME.');
  const result = run(join(directory, 'bin', platform === 'win32' ? 'java.exe' : 'java'), ['-XshowSettings:properties', '-version'], { encoding: 'utf8', timeout: 30_000 });
  if (result.error || result.status !== 0 || !/^\s*java\.specification\.version\s*=\s*17\s*$/m.test(result.stdout + result.stderr)) {
    throw new Error('Android tests require JDK 17; JAVA_HOME does not point to a working JDK 17: ' + directory);
  }
  return directory;
}
