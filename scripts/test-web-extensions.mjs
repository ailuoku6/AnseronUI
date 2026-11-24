import {build} from 'esbuild';
import {writeFile,mkdir,readFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
await mkdir('.verification',{recursive:true});
const suite=['layout','split','routing','styles','accessibility','accessibility-wasm','virtual-list','virtual-list-wasm'].includes(process.argv[2])?process.argv[2]:'extensions';
const entry=suite.startsWith('virtual-list')?'verifyVirtualList':suite==='accessibility-wasm'?'verifyAccessibilityWasm':suite==='accessibility'?'verifyAccessibility':suite==='styles'?'verifyStyles':suite==='layout'?'verifyLayout':suite==='split'?'verifySplitTimers':suite==='routing'?'verifyRouting':'verifyExtensions';
const encoded = ['split','virtual-list-wasm','accessibility-wasm'].includes(suite) ? await Promise.all(['business','framework'].map(async kind => (await readFile(`.verification/${kind}-wasm/entry.wasm`)).toString('base64'))) : [];
const args = encoded.map(text => `Uint8Array.from(atob(${JSON.stringify(text)}), c => c.charCodeAt(0))`).join(',');
const result=await build({stdin:{contents:`import {${entry}} from './packages/render-web/test/${suite === 'virtual-list-wasm' ? 'virtual-list' : suite}.browser.ts';
const timeout = setTimeout(()=>window.webkit.messageHandlers.result.postMessage({ok:false,error:'Test timeout',state:globalThis.__anseronuiTestState?.()}),90000);
${entry}(${args}).finally(()=>clearTimeout(timeout)).then(report=>window.webkit.messageHandlers.result.postMessage({ok:true,suite:'${suite}',...(report?{report}:{})}),error=>window.webkit.messageHandlers.result.postMessage({ok:false,error:String(error),stack:error.stack,state:globalThis.__anseronuiTestState?.()}));`,resolveDir:process.cwd()},bundle:true,write:false,jsx:'automatic',jsxImportSource:'@anseronui/ui',platform:'browser',format:'iife',target:'es2022'});
await writeFile('.verification/web-extensions.html',`<!doctype html><html><body><script>${result.outputFiles[0].text}</script></body></html>`);
await writeFile('.verification/webkit-extensions.swift',`import AppKit
import WebKit
final class Result: NSObject, WKScriptMessageHandler {
 func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
  if let data = try? JSONSerialization.data(withJSONObject: message.body, options: [.sortedKeys]), let json = String(data:data,encoding:.utf8) { print(json); fflush(stdout) }
  let body = message.body as? [String: Any]
  guard body?["ok"] != nil else { return }
  exit(body?["ok"] as? Bool == true ? 0 : 1)
 }
}
let app = NSApplication.shared
app.setActivationPolicy(.accessory)
final class FixtureResources: NSObject, WKURLSchemeHandler {
 func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {
  let path = urlSchemeTask.request.url!.path
  let resource = "examples/components" + path
  let data = (try? Data(contentsOf:URL(fileURLWithPath:resource))) ?? Data()
  let mime = path.hasSuffix(".png") ? "image/png" : path.hasSuffix(".mp4") ? "video/mp4" : "application/octet-stream"
  urlSchemeTask.didReceive(URLResponse(url:urlSchemeTask.request.url!,mimeType:mime,expectedContentLength:data.count,textEncodingName:nil))
  urlSchemeTask.didReceive(data); urlSchemeTask.didFinish()
 }
 func webView(_ webView: WKWebView, stop urlSchemeTask: WKURLSchemeTask) {}
}
let config = WKWebViewConfiguration()
config.setURLSchemeHandler(FixtureResources(), forURLScheme:"anseronui-test")
config.websiteDataStore = .nonPersistent()
let result = Result()
config.userContentController.add(result, name: "result")
final class Navigation: NSObject, WKNavigationDelegate {
 func webViewWebContentProcessDidTerminate(_ webView: WKWebView) { print("WebKit content process terminated"); fflush(stdout); exit(3) }
}
let activity = ProcessInfo.processInfo.beginActivity(options:[.userInitiated,.idleSystemSleepDisabled], reason:"AnseronUI render regression")
let navigation = Navigation()
let web = WKWebView(frame: NSRect(x:0,y:0,width:500,height:900),configuration:config)
web.navigationDelegate = navigation
// Keep this command-line test's page runnable even when the desktop has no active app.
let keepAlive = Timer.scheduledTimer(withTimeInterval:0.05,repeats:true) { _ in web.evaluateJavaScript("void 0", completionHandler:nil) }
let window = NSWindow(contentRect:NSRect(x:0,y:0,width:500,height:900),styleMask:[.titled],backing:.buffered,defer:false)
window.contentView = web
window.title = "AnseronUI rendering regression"
window.makeKeyAndOrderFront(nil)
app.activate(ignoringOtherApps:true)
web.loadHTMLString(try String(contentsOfFile: CommandLine.arguments[1],encoding:.utf8),baseURL:URL(string:"anseronui-test://fixture"))
DispatchQueue.main.asyncAfter(deadline:.now()+120){print("WebKit timeout");exit(2)}
app.run()
`);
const child=spawn('xcrun',['swift','-module-cache-path','/tmp/anseronui-swift-module-cache','.verification/webkit-extensions.swift','.verification/web-extensions.html'],{stdio:['ignore','pipe','inherit']});
let stdout = ''; child.stdout.on('data', chunk => { stdout += chunk; process.stdout.write(chunk); });
process.exitCode=await new Promise(resolve=>child.on('exit',code=>resolve(code??1)));
if (process.exitCode === 0 && suite.startsWith('virtual-list')) {
  const result = stdout.trim().split('\n').map(line => { try { return JSON.parse(line); } catch { return null; } }).find(value => value?.report);
  if (!result) throw new Error('Missing browser performance report');
  await mkdir('.verification/performance', { recursive: true });
  await writeFile('.verification/performance/' + result.report.mode + '.json', JSON.stringify(result.report, null, 2) + '\n');
}
