import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { buildMacOS, requireMacOS } from './macos-app.mjs';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
process.chdir(fileURLToPath(new URL('../', import.meta.url)));
function run(command,args,env=process.env) { const r=spawnSync(command,args,{stdio:'inherit',env}); if(r.error)throw r.error; if(r.status!==0)process.exit(r.status??1); }
const target = process.argv[2];
const config = process.env.ANSERONUI_CONFIG;
const coreArgs = config ? [config] : [];
const appConfig = config ? JSON.parse(readFileSync(config, 'utf8')) : null;
if (target === 'macos') {
  requireMacOS();
  run(process.execPath,['scripts/build-core.mjs','macos-arm64',...coreArgs]);
  buildMacOS({framework:process.cwd(),app:process.cwd(),config:appConfig ?? JSON.parse(readFileSync('anseronui.config.json','utf8')),core:join(process.cwd(),'.verification/core-macos-arm64')});
} else if (target === 'ios' || target === 'ios-device') {
  run(process.execPath,['scripts/build-core.mjs',target==='ios'?'ios-simulator':'ios-device', ...coreArgs]);
  run('python3',['scripts/generate-ios-project.py']);
  run('xcodebuild',['-project','examples/native/ios/AnseronUIDemo.xcodeproj','-scheme','AnseronUIDemo','-configuration','Debug','-sdk',target==='ios'?'iphonesimulator':'iphoneos','-derivedDataPath',`.verification/${target==='ios'?'ios-app':'ios-device-app'}`,...(target === 'ios' ? ['CODE_SIGNING_ALLOWED=YES', 'CODE_SIGN_IDENTITY=-'] : ['CODE_SIGNING_ALLOWED=NO']),'ARCHS=arm64','build']);
} else if (target === 'android') {
  run(process.execPath,['scripts/build-core.mjs','android', ...coreArgs]);
  const env={...process.env};
  env.ANDROID_HOME ??= env.ANDROID_SDK_ROOT ?? join(homedir(),process.platform==='darwin'?'Library/Android/sdk':'Android/Sdk');
  if (!env.JAVA_HOME && process.platform==='darwin') {
    const java=spawnSync('/usr/libexec/java_home',['-v','17'],{encoding:'utf8'});
    if(java.status===0)env.JAVA_HOME=java.stdout.trim();
  }
  run('examples/native/android/gradlew',['-p','examples/native/android',':app:assembleDebug','--console=plain'],env);
} else if (target === 'web') {
  run(process.execPath,['scripts/build-core.mjs','wasm', ...coreArgs]);
  if (config && !appConfig?.web?.viteConfig) throw new Error('Configured app must provide web.viteConfig before building a Web host');
  run(process.execPath,['node_modules/vite/bin/vite.js','build','--config', appConfig?.web?.viteConfig ?? 'examples/native/web/vite.config.ts']);
} else throw new Error('Expected ios, ios-device, android, macos, or web');
