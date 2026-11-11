import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, readdirSync } from 'node:fs';
import { buildMacOS, requireMacOS } from './macos-app.mjs';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { generateAppIcons, integrateIOSIcons, integrateAndroidIcons } from './app-icons.mjs';
process.chdir(fileURLToPath(new URL('../', import.meta.url)));
function run(command,args,env=process.env) { const r=spawnSync(command,args,{stdio:'inherit',env}); if(r.error)throw r.error; if(r.status!==0)process.exit(r.status??1); }
const target = process.argv[2];
const release = process.env.ANSERONUI_RELEASE_BUILD === '1';
const signed = process.env.ANSERONUI_SIGNED_BUILD === '1';
const config = process.env.ANSERONUI_CONFIG;
const coreArgs = config ? [config] : [];
const appConfig = config ? JSON.parse(readFileSync(config, 'utf8')) : null;
const iconConfig = appConfig ?? JSON.parse(readFileSync('anseronui.config.json', 'utf8'));
if (signed && (target === 'ios' || target === 'ios-device') && !process.env.ANSERONUI_IOS_TEAM_ID) throw new Error('Set ANSERONUI_IOS_TEAM_ID to create a signed iOS distribution IPA.');
if (signed && target === 'android' && !['ANSERONUI_ANDROID_KEYSTORE','ANSERONUI_ANDROID_STORE_PASSWORD','ANSERONUI_ANDROID_KEY_ALIAS','ANSERONUI_ANDROID_KEY_PASSWORD'].every(name => process.env[name])) throw new Error('Set ANSERONUI_ANDROID_KEYSTORE, ANSERONUI_ANDROID_STORE_PASSWORD, ANSERONUI_ANDROID_KEY_ALIAS, and ANSERONUI_ANDROID_KEY_PASSWORD to create signed Android artifacts.');
if (signed && target === 'macos' && !process.env.ANSERONUI_MACOS_SIGN_IDENTITY) throw new Error('Set ANSERONUI_MACOS_SIGN_IDENTITY to a Developer ID Application certificate for signed distribution.');
if (target === 'macos') {
  requireMacOS();
  run(process.execPath,['scripts/build-core.mjs','macos-arm64',...coreArgs]);
  buildMacOS({framework:process.cwd(),app:process.cwd(),config:appConfig ?? JSON.parse(readFileSync('anseronui.config.json','utf8')),core:join(process.cwd(),'.verification/core-macos-arm64'),release,requireSignature:signed});
} else if (target === 'ios' || target === 'ios-device') {
  run(process.execPath,['scripts/build-core.mjs',target==='ios'?'ios-simulator':'ios-device', ...coreArgs]);
  run('python3',['scripts/generate-ios-project.py']);
  integrateIOSIcons(process.cwd(), generateAppIcons(process.cwd(), iconConfig, target), {
    projectFile: 'examples/native/ios/AnseronUIDemo.xcodeproj/project.pbxproj', targetName: 'AnseronUIDemo',
  });
  if (release) {
    const archive = '.verification/ios-release/AnseronUIDemo.xcarchive';
    const team = process.env.ANSERONUI_IOS_TEAM_ID;
    if (signed && !team) throw new Error('Set ANSERONUI_IOS_TEAM_ID to create a signed iOS distribution IPA.');
    const exportMethod = process.env.ANSERONUI_IOS_EXPORT_METHOD ?? 'app-store-connect';
    if (!['app-store-connect', 'ad-hoc', 'development', 'enterprise'].includes(exportMethod)) throw new Error('ANSERONUI_IOS_EXPORT_METHOD must be app-store-connect, ad-hoc, development, or enterprise.');
    const args = ['-project','examples/native/ios/AnseronUIDemo.xcodeproj','-scheme','AnseronUIDemo','-configuration','Release','-sdk','iphoneos','-derivedDataPath','.verification/ios-release/DerivedData','-archivePath',archive,'ARCHS=arm64'];
    if (team) args.push(`DEVELOPMENT_TEAM=${team}`,'CODE_SIGN_STYLE=Automatic','CODE_SIGNING_ALLOWED=YES','-allowProvisioningUpdates');
    else args.push('CODE_SIGNING_ALLOWED=NO');
    args.push('archive'); run('xcodebuild',args);
    if (team) {
      const exportPath = '.verification/ios-release/export';
      mkdirSync(exportPath, { recursive: true });
      const escapedTeam = team.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
      writeFileSync('.verification/ios-release/ExportOptions.plist', `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict><key>method</key><string>${exportMethod}</string><key>teamID</key><string>${escapedTeam}</string><key>signingStyle</key><string>automatic</string></dict></plist>\n`);
      run('xcodebuild',['-exportArchive','-archivePath',archive,'-exportPath',exportPath,'-exportOptionsPlist','.verification/ios-release/ExportOptions.plist','-allowProvisioningUpdates']);
    }
  } else run('xcodebuild',['-project','examples/native/ios/AnseronUIDemo.xcodeproj','-scheme','AnseronUIDemo','-configuration','Debug','-sdk',target==='ios'?'iphonesimulator':'iphoneos','-derivedDataPath',`.verification/${target==='ios'?'ios-app':'ios-device-app'}`,...(target === 'ios' ? ['CODE_SIGNING_ALLOWED=YES', 'CODE_SIGN_IDENTITY=-'] : ['CODE_SIGNING_ALLOWED=NO']),'ARCHS=arm64','build']);
} else if (target === 'android') {
  run(process.execPath,['scripts/build-core.mjs','android', ...coreArgs]);
  generateAppIcons(process.cwd(), iconConfig, 'android', { androidProjectDir: 'examples/native/android' });
  integrateAndroidIcons(process.cwd(), { projectDir: 'examples/native/android' });
  const env={...process.env};
  env.ANDROID_HOME ??= env.ANDROID_SDK_ROOT ?? join(homedir(),process.platform==='darwin'?'Library/Android/sdk':'Android/Sdk');
  if (!env.JAVA_HOME && process.platform==='darwin') {
    const java=spawnSync('/usr/libexec/java_home',['-v','17'],{encoding:'utf8'});
    if(java.status===0)env.JAVA_HOME=java.stdout.trim();
  }
  if (release) {
    if (signed && !['ANSERONUI_ANDROID_KEYSTORE','ANSERONUI_ANDROID_STORE_PASSWORD','ANSERONUI_ANDROID_KEY_ALIAS','ANSERONUI_ANDROID_KEY_PASSWORD'].every(name => process.env[name])) throw new Error('Set ANSERONUI_ANDROID_KEYSTORE, ANSERONUI_ANDROID_STORE_PASSWORD, ANSERONUI_ANDROID_KEY_ALIAS, and ANSERONUI_ANDROID_KEY_PASSWORD to create signed Android artifacts.');
    env.ANDROID_NDK_ROOT ??= join(env.ANDROID_HOME, 'ndk', readdirSync(join(env.ANDROID_HOME, 'ndk')).sort((a,b)=>b.localeCompare(a,undefined,{numeric:true}))[0]);
    const prebuilt = join(env.ANDROID_NDK_ROOT, 'toolchains/llvm/prebuilt');
    const host = readdirSync(prebuilt).find(name => name.startsWith(process.platform === 'darwin' ? 'darwin' : 'linux'));
    if (!host) throw new Error(`No Android NDK toolchain found in ${prebuilt}`);
    const objcopy = join(prebuilt, host, 'bin/llvm-objcopy');
    const library = '.verification/android-jni/arm64-v8a/libanseronui.so';
    const symbols = '.verification/android-symbols/arm64-v8a';
    mkdirSync(symbols, { recursive: true });
    mkdirSync('.verification/android-jni/arm64-v8a', { recursive: true });
    copyFileSync('packages/render-android/src/main/jniLibs/arm64-v8a/libanseronui.so', library);
    run(objcopy, ['--only-keep-debug', library, join(symbols, 'libanseronui.so.dbg')], env);
    run(objcopy, ['--strip-debug', library], env);
    run(objcopy, ['--add-gnu-debuglink=' + join(symbols, 'libanseronui.so.dbg'), library], env);
  }
  run('examples/native/android/gradlew',['-p','examples/native/android',...(release?[':app:assembleRelease',':app:bundleRelease']:[':app:assembleDebug']),'--console=plain'],env);
} else if (target === 'web') {
  run(process.execPath,['scripts/build-core.mjs','wasm', ...coreArgs]);
  if (config && !appConfig?.web?.viteConfig) throw new Error('Configured app must provide web.viteConfig before building a Web host');
  run(process.execPath,['node_modules/vite/bin/vite.js','build','--config', appConfig?.web?.viteConfig ?? 'examples/native/web/vite.config.ts']);
} else throw new Error('Expected ios, ios-device, android, macos, or web');
