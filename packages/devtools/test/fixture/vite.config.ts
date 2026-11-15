import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { anseronuiDevtools } from '../../src/vite.ts';
export default defineConfig({
 root:fileURLToPath(new URL('.',import.meta.url)), plugins:[anseronuiDevtools({host:'0.0.0.0'}),{name:'fixture-api',configureServer(server){server.middlewares.use('/api/echo',(req,res)=>{let body='';req.on('data',chunk=>body+=chunk);req.on('end',()=>setTimeout(()=>{res.setHeader('Content-Type','application/json');res.setHeader('X-Demo','AnseronUI');res.end(JSON.stringify({ok:true,method:req.method,body,message:'来自真实本地 HTTP 请求'}));},300));});}}],
 server:{host:'127.0.0.1',port:5173}, oxc:{jsx:{runtime:'automatic',importSource:'@anseronui/ui'}},
 build:{outDir:fileURLToPath(new URL('../../../../.verification/devtools-production',import.meta.url)),emptyOutDir:true},
});
