import {build} from 'esbuild';
import {writeFile,mkdir,readFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
await mkdir('.verification',{recursive:true});
const suite=['layout','split','routing'].includes(process.argv[2])?process.argv[2]:'extensions';
const entry=suite==='layout'?'verifyLayout':suite==='split'?'verifySplitTimers':suite==='routing'?'verifyRouting':'verifyExtensions';
const encoded = suite === 'split' ? await Promise.all(['business','framework'].map(async kind => (await readFile(`.verification/${kind}-wasm/entry.wasm`)).toString('base64'))) : [];
const args = encoded.map(text => `Uint8Array.from(atob(${JSON.stringify(text)}), c => c.charCodeAt(0))`).join(',');
const result=await build({stdin:{contents:`import {${entry}} from './packages/render-web/test/${suite}.browser.ts';
${entry}(${args}).then(()=>window.webkit.messageHandlers.result.postMessage({ok:true,suite:'${suite}'}),error=>window.webkit.messageHandlers.result.postMessage({ok:false,error:String(error),stack:error.stack}));`,resolveDir:process.cwd()},bundle:true,write:false,jsx:'automatic',jsxImportSource:'@anseronui/ui',platform:'browser',format:'iife',target:'es2022'});
await writeFile('.verification/web-extensions.html',`<!doctype html><html><body><script>${result.outputFiles[0].text}</script></body></html>`);
await writeFile('.verification/webkit-extensions.swift',`import AppKit
import WebKit
final class Result: NSObject, WKScriptMessageHandler {
 func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
  print(message.body)
  let body = message.body as? [String: Any]
  exit(body?["ok"] as? Bool == true ? 0 : 1)
 }
}
let app = NSApplication.shared
app.setActivationPolicy(.prohibited)
let config = WKWebViewConfiguration()
config.websiteDataStore = .nonPersistent()
let result = Result()
config.userContentController.add(result, name: "result")
let web = WKWebView(frame: NSRect(x:0,y:0,width:500,height:900),configuration:config)
${suite==='split'?`let window = NSWindow(contentRect:NSRect(x:0,y:0,width:500,height:900),styleMask:[.borderless],backing:.buffered,defer:false)
window.contentView = web
window.orderFront(nil)
`:''}web.loadHTMLString(try String(contentsOfFile: CommandLine.arguments[1],encoding:.utf8),baseURL:URL(string:"https://anseronui.test"))
DispatchQueue.main.asyncAfter(deadline:.now()+30){print("WebKit timeout");exit(2)}
app.run()
`);
const child=spawn('xcrun',['swift','-module-cache-path','/tmp/anseronui-swift-module-cache','.verification/webkit-extensions.swift','.verification/web-extensions.html'],{stdio:'inherit'});
process.exitCode=await new Promise(resolve=>child.on('exit',code=>resolve(code??1)));
