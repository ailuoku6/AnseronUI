import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync, cpSync, copyFileSync, readdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateNativePlugins } from './native-plugins.mjs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
export function readHarmonyJSON5(path) {
  const ts = require('typescript');
  const source = readFileSync(path, 'utf8');
  const parsed = ts.parseJsonText(path, source);
  // DevEco JSON5 allows comments, trailing commas, single quotes and bare keys.
  // Parse data only; never execute build profiles as JavaScript.
  const errors = parsed.parseDiagnostics.filter(error => error.code !== 1327);
  const result = ts.parseConfigFileTextToJson(path, source);
  if (errors.length || (result.error && result.error.code !== 1327)) throw new Error(`Invalid Harmony JSON5: ${path}`);
  return result.config;
}
export function harmonyTools() {
  const studio = process.env.DEVECO_STUDIO_HOME ?? '/Applications/DevEco-Studio.app/Contents';
  const sdk = process.env.DEVECO_SDK_HOME ?? join(studio, 'sdk');
  const native = process.env.HARMONY_NATIVE_SDK ?? join(sdk, 'default/openharmony/native');
  if (!existsSync(join(native,'oh-uni-package.json')) || Number(JSON.parse(readFileSync(join(native,'oh-uni-package.json'),'utf8')).apiVersion) !== 21) throw new Error('Install DevEco Studio and HarmonyOS 6.0.1 (API 21) SDK, or set HARMONY_NATIVE_SDK/DEVECO_SDK_HOME.');
  return { studio, sdk, native, hdc: process.env.HARMONY_HDC ?? join(dirname(native),'toolchains/hdc'), java: process.env.JAVA_HOME ? join(process.env.JAVA_HOME,'bin/java') : join(studio,'jbr/Contents/Home/bin/java'), env: {...process.env, DEVECO_SDK_HOME:sdk, NODE_HOME:join(studio,'tools/node')} };
}
export function harmonyPermissionResources(permissions, generated, previous = []) {
  const resources = new Map([...previous, ...generated].map(item => [item.name, item]));
  const referenced = new Set(permissions.flatMap(item => item.reason?.startsWith('$string:') ? [item.reason.slice(8)] : []));
  return [...resources.values()].filter(item => referenced.has(item.name));
}
function run(bin,args,options={}) { const r=spawnSync(bin,args,{stdio:'inherit',...options}); if(r.error)throw r.error;if(r.status!==0)throw new Error(`${bin} failed (${r.status})`);return r.stdout?.trim(); }
function write(path,text) { mkdirSync(dirname(path),{recursive:true});writeFileSync(path,text); }
export function harmonyIndexSource(config, manifest) {
  const page = config.harmony?.initialPage ?? manifest.pages[0]?.name;
  if (!manifest.pages.some(item => item.name === page)) throw new Error('Unknown harmony.initialPage');
  const limit = config.harmony?.maxRetainedPages ?? Infinity;
  if (limit !== Infinity && (!Number.isInteger(limit) || limit < 1)) throw new Error('harmony.maxRetainedPages must be a positive integer');
  if (config.harmony?.showPageTabs !== undefined && typeof config.harmony.showPageTabs !== 'boolean') throw new Error('harmony.showPageTabs must be boolean');
  return `import { AnseronView, HarmonyController } from '../anseronui/AnseronView';\n@Entry\n@Component\nstruct Index {\n  private controller: HarmonyController = new HarmonyController();\n  onBackPress(): boolean { this.controller.back(); return true; }\n  build() { Stack() { AnseronView({controller:this.controller,buildId:${JSON.stringify(manifest.buildId)},initialPage:${JSON.stringify(page)},pages:${JSON.stringify(manifest.pages.map(p=>p.name))},showPageTabs:${JSON.stringify(config.harmony?.showPageTabs ?? true)},maxRetainedPages:${limit}}) }.width('100%').height('100%') }\n}\n`;
}
export function buildHarmony({framework,app,config,core,standalone=false,release=false,requireSignature=false,plugins=[]}) {
  const tools=harmonyTools();
  const project=join(app,standalone?'platforms/harmony':'examples/native/harmony');
  if (!existsSync(join(project,'hvigorfile.ts'))) {
    cpSync(join(framework,'scripts/templates/app/platforms/harmony'),project,{recursive:true});
  }
  const id=config.app?.applicationId ?? 'org.anseronui.demo';
  const name=config.app?.name ?? 'AnseronUI';
  const appFile=join(project,'AppScope/app.json5');
  const metadata=readHarmonyJSON5(appFile);metadata.app.bundleName=id;
  write(appFile,JSON.stringify(metadata,null,2)+'\n');
  const label=join(project,'AppScope/resources/base/element/string.json');write(label,JSON.stringify({string:[{name:'app_name',value:name}]},null,2)+'\n');
  if(config.app?.icon?.default) copyFileSync(resolve(app,config.app.icon.default),join(project,'AppScope/resources/base/media/app_icon_custom.png'));
  if(existsSync(join(project,'AppScope/resources/base/media/app_icon_custom.png'))) {metadata.app.icon='$media:app_icon_custom';write(appFile,JSON.stringify(metadata,null,2)+'\n');}
  const ets=join(project,'entry/src/main/ets');
  cpSync(join(framework,'packages/render-harmony/src/main/ets'),join(ets,'anseronui'),{recursive:true});
  for (const file of ['ServiceSetup.ets','workability/WorkAbility.ets']) {
    const destination=join(ets,file);
    if (!existsSync(destination)) { mkdirSync(dirname(destination),{recursive:true}); copyFileSync(join(framework,'scripts/templates/app/platforms/harmony/entry/src/main/ets',file),destination); }
  }
  const manifest=JSON.parse(readFileSync(join(core,'manifest.json'),'utf8'));
  if (release && manifest.devtools?.enabled) throw new Error('Release cannot link a Debug-instrumented Core; rebuild with --release.');
  const page=config.harmony?.initialPage ?? manifest.pages[0].name;
  if(!manifest.pages.some(p=>p.name===page))throw new Error('Unknown harmony.initialPage');
  write(join(ets,'pages/Index.ets'), harmonyIndexSource(config, manifest));
  const mediaDir=join(framework,'examples/components/assets');
  if (existsSync(mediaDir)) cpSync(mediaDir,join(project,'entry/src/main/resources/rawfile/assets'),{recursive:true});
  const cpp=join(project,'entry/src/main/cpp');
  cpSync(join(framework,'scripts/templates/app/platforms/harmony/entry/src/main/cpp/CMakeLists.txt'),join(cpp,'CMakeLists.txt'));
  cpSync(join(framework,'scripts/templates/app/platforms/harmony/entry/src/main/cpp/types'),join(cpp,'types'),{recursive:true});
  const cmakeQuote=s=>s.replaceAll('\\','/').replaceAll('"','\\"').replaceAll(';','\\;');
  const harmonyPlugins=plugins.flatMap(plugin=>plugin.harmony?.sources??[]);
  if (!standalone && app === framework) harmonyPlugins.push(join(framework,'examples/native/harmony/DemoExtensions.cpp'));
  if(plugins.length) {
    generateNativePlugins(app,plugins,'harmony');
  }
  const permissions=[...(config.harmony?.permissions ?? []),...plugins.flatMap(plugin=>plugin.harmony?.permissions ?? []),'ohos.permission.INTERNET','ohos.permission.GET_NETWORK_INFO'];
  const manifestPath=join(project,'entry/src/main/module.json5'),moduleManifest=readHarmonyJSON5(manifestPath);
  const extensionAbilities=moduleManifest.module.extensionAbilities??[];
  if (!extensionAbilities.some(ability=>ability.name==='AnseronUIWorkAbility')) extensionAbilities.push({name:'AnseronUIWorkAbility',srcEntry:'./ets/workability/WorkAbility.ets',type:'workScheduler',exported:false});
  moduleManifest.module.extensionAbilities=extensionAbilities;
  // Retain developer reason/usedScene metadata for runtime permissions.
  const declared=new Map((moduleManifest.module.requestPermissions??[]).map(item=>[item.name,item]));
  const managedPermissions=['ohos.permission.GET_NETWORK_INFO','ohos.permission.READ_PASTEBOARD','ohos.permission.VIBRATE'];
  for (const name of managedPermissions) if (!permissions.includes(name)) declared.delete(name);
  const reasonFile=join(project,'entry/src/main/resources/base/element/anseronui_permissions.json');
  const reasons=[];
  const descriptions={
    'ohos.permission.INTERNET':['Connect to remote services used by the application.','inuse'],
    'ohos.permission.GET_NETWORK_INFO':['Read network connectivity to report the current connection type.','inuse'],
    'ohos.permission.READ_PASTEBOARD':['Read text when the user invokes the clipboard read action.','inuse'],
    'ohos.permission.VIBRATE':['Provide haptic feedback in response to user actions.','inuse'],
    'ohos.permission.CAMERA':['Use the camera when requested by the application.','inuse'],
    'ohos.permission.MICROPHONE':['Use the microphone when requested by the application.','inuse'],
    'ohos.permission.APPROXIMATELY_LOCATION':['Read approximate location when requested by the application.','inuse'],
    'ohos.permission.READ_IMAGEVIDEO':['Let the user select photos or videos for the application.','inuse'],
    'ohos.permission.ACCESS_BLUETOOTH':['Use Bluetooth when requested by the application.','inuse'],
    'ohos.permission.NFC_TAG':['Read or write a nearby NFC tag when requested by the application.','inuse'],
    'ohos.permission.PUBLISH_AGENT_REMINDER':['Schedule reminders requested by the application.','inuse'],
  };
  for (const name of new Set([...permissions, ...declared.keys()])) {
    const [reason,scene]=descriptions[name]??['Use '+name+' for the feature requested by the application.','inuse'];
    const item=declared.get(name)??{name};
    item.reason??=reason;
    if (!item.reason.startsWith('$string:')) {
      const resource='anseronui_permission_'+name.replaceAll('.','_').toLowerCase();
      reasons.push({name:resource,value:item.reason});item.reason='$string:'+resource;
    } else if (item.reason.startsWith('$string:anseronui_permission_')) reasons.push({name:item.reason.substring(8),value:reason});
    item.usedScene??={abilities:['EntryAbility'],when:scene};
    declared.set(name,item);
  }
  moduleManifest.module.requestPermissions=[...declared.values()];
  const previousReasons=existsSync(reasonFile)?JSON.parse(readFileSync(reasonFile,'utf8')).string??[]:[];
  write(reasonFile,JSON.stringify({string:harmonyPermissionResources([...declared.values()],reasons,previousReasons)},null,2)+'\n');
  write(manifestPath,JSON.stringify(moduleManifest,null,2)+'\n');
  const sourceList=harmonyPlugins.map(source=>`\n  "${cmakeQuote(source)}"`).join('');
  write(join(cpp,'anseronui.cmake'),`set(ANSERONUI_ROOT "${cmakeQuote(framework)}")\nset(ANSERONUI_CORE "${cmakeQuote(join(core,'entry.lib.a'))}")\nset(ANSERONUI_PLUGIN_SOURCES${sourceList})\n`);
  write(join(project,'entry/src/main/resources/rawfile/core.manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  // Release signing uses a developer-supplied DevEco signingConfig, never SDK test keys.
  if(requireSignature) {
    const profile=readHarmonyJSON5(join(project,'build-profile.json5'));
    if(!profile.app.signingConfigs?.length)throw new Error('Configure production signingConfigs in platforms/harmony/build-profile.json5 with DevEco Studio before --signed.');
  }
  run(join(tools.studio,'tools/hvigor/bin/hvigorw'),['assembleHap','--mode','module','-p','product=default','-p','module=entry@default','-p',`buildMode=${release?'release':'debug'}`,'--no-daemon'],{cwd:project,env:tools.env});
  const output=join(project,'entry/build/default/outputs/default');
  const files=readdirSync(output);const signed=files.find(f=>f.endsWith('-signed.hap'));const hap=join(output,signed??files.find(f=>f.endsWith('-unsigned.hap'))??'missing.hap');
  if(!existsSync(hap))throw new Error('Hvigor produced no HAP');
  const dest=join(app,'.verification/harmony');mkdirSync(dest,{recursive:true});
  copyFileSync(hap,join(dest,`App-${signed?'signed':'unsigned'}.hap`));
  write(join(dest,'build.json'),JSON.stringify({minimumApi:21,target:'aarch64-linux-ohos',bundleName:id,ability:'EntryAbility',hap:join(dest,`App-${signed?'signed':'unsigned'}.hap`),release,signed:!!signed},null,2)+'\n');
  console.log('HarmonyOS HAP: '+hap);return hap;
}
export function selectHarmony(devices,requested) {
  const connected=devices.split(/\r?\n/).map(s=>s.trim()).filter(s=>s&&s!=='[Empty]');
  if(requested){if(!connected.includes(requested))throw new Error('Harmony device is not connected: '+requested);return requested;}
  if(connected.length!==1)throw new Error('Connect one HarmonyOS device, or use --device with an hdc target ID.');return connected[0];
}
export function runHarmony({app,device}) {
  const tools=harmonyTools();
  const output=(args)=>run(tools.hdc,args,{encoding:'utf8',stdio:['ignore','pipe','pipe']});
  const target=selectHarmony(output(['list','targets']),device);
  const api=Number(output(['-t',target,'shell','param','get','const.ohos.apiversion']).trim());
  if(!Number.isInteger(api)||api<21)throw new Error('HarmonyOS 6.0.1 / API 21 or newer is required.');
  const directory=join(app,'.verification/harmony'),build=JSON.parse(readFileSync(join(directory,'build.json'),'utf8'));
  let hap=build.hap;
  if(!build.signed){
    // SDK public test certificate is only for local emulator debugging.
    const info=output(['-t',target,'shell','param','get','const.product.model']);
    if(!/emulator/i.test(info))throw new Error('For a real HarmonyOS device, configure DevEco developer signing and build --signed. SDK test keys are restricted to emulators.');
    const lib=join(dirname(tools.native),'toolchains/lib');
    const profile=JSON.parse(readFileSync(join(lib,'UnsgnedDebugProfileTemplate.json'),'utf8'));
    profile['bundle-info']['bundle-name']=build.bundleName;
    profile.validity={'not-before':Math.floor(Date.now()/1000)-86400,'not-after':Math.floor(Date.now()/1000)+30*86400};
    const udid=output(['-t',target,'shell','bm','get','--udid']).match(/[A-Fa-f0-9]{32,}/)?.[0];
    if(!udid)throw new Error('Unable to read emulator UDID');
    profile['debug-info']['device-ids']=[udid];
    const json=join(directory,'debug-profile.json'),cert=join(directory,'sdk-app-cert.pem');
    write(json,JSON.stringify(profile,null,2)+'\n');
    const keytool=join(dirname(tools.java),'keytool');
    const certificates=[profile['bundle-info']['development-certificate'],...['openharmony application ca','openharmony application root ca'].flatMap(alias => run(keytool,['-list','-rfc','-alias',alias,'-keystore',join(lib,'OpenHarmony.p12'),'-storepass','123456'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g)?.slice(0,1) ?? [])];
    if(!certificates?.length)throw new Error('SDK test application certificate missing');write(cert,certificates.join('\n')+'\n');
    const sign=(args)=>run(tools.java,['-jar',join(lib,'hap-sign-tool.jar'),...args]);
    const provision=join(directory,'debug-profile.p7b');
    sign(['sign-profile','-mode','localSign','-keyAlias','openharmony application profile debug','-keyPwd','123456','-profileCertFile',join(lib,'OpenHarmonyProfileDebug.pem'),'-inFile',json,'-signAlg','SHA256withECDSA','-keystoreFile',join(lib,'OpenHarmony.p12'),'-keystorePwd','123456','-outFile',provision]);
    hap=join(directory,'App-emulator.hap');
    sign(['sign-app','-mode','localSign','-keyAlias','openharmony application release','-keyPwd','123456','-appCertFile',cert,'-profileFile',provision,'-inFile',build.hap,'-signAlg','SHA256withECDSA','-keystoreFile',join(lib,'OpenHarmony.p12'),'-keystorePwd','123456','-outFile',hap,'-compatibleVersion','21']);
  }
  if (!build.release) output(['-t',target,'rport','tcp:8091','tcp:8091']);
  const install=output(['-t',target,'install','-r',hap]);console.log(install);if(!/success/i.test(install))throw new Error('hdc install failed');
  output(['-t',target,'shell','aa','force-stop',build.bundleName]);
  const start=output(['-t',target,'shell','aa','start','-a','EntryAbility','-b',build.bundleName]);console.log(start);if(!/success/i.test(start))throw new Error('Ability start failed');
  return {target,hap};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  if(process.argv[2]==='run')runHarmony({app:resolve(process.argv[3]??'.'),device:process.argv[4]});
  else throw new Error('Use anseronui build harmony or anseronui run harmony');
}
