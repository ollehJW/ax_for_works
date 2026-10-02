// A separate frontend listener for Pod deployments. Backend serves the React
// build and gateway routes; preserve Host/Origin and stream SSE and media.
import http from 'node:http';
import https from 'node:https';
import {readFileSync} from 'node:fs';
const target=new URL(process.env.BACKEND_ORIGIN||'http://127.0.0.1:1010');
if(target.protocol!=='http:'||!['localhost','127.0.0.1'].includes(target.hostname))throw new Error('Backend must be local HTTP');
const protocol=process.env.FRONTEND_PROTOCOL||'https';
if(!['http','https'].includes(protocol))throw new Error('Invalid frontend protocol');
const options=protocol==='https'?{cert:readFileSync(process.env.TLS_CERT),key:readFileSync(process.env.TLS_KEY),minVersion:'TLSv1.2'}:{};
const hop=new Set(['connection','keep-alive','proxy-authenticate','proxy-authorization','te','trailer','transfer-encoding','upgrade']);
function clean(headers){const blocked=new Set([...hop,...String(headers.connection||'').toLowerCase().split(',').map(v=>v.trim())]);return Object.fromEntries(Object.entries(headers).filter(([k])=>!blocked.has(k)));}
const server=(protocol==='https'?https:http).createServer(options,(req,res)=>{
 const headers=clean(req.headers);
 // Forwarded identity headers from arbitrary clients are not trusted.
 for(const name of Object.keys(headers))if(name.startsWith('x-forwarded-')||name==='forwarded')delete headers[name];
 const upstream=http.request({hostname:target.hostname,port:target.port,path:req.url,method:req.method,headers},reply=>{
  res.writeHead(reply.statusCode,clean(reply.headers));res.flushHeaders();reply.pipe(res);reply.on('error',()=>res.destroy());
 });
 upstream.setTimeout(660000,()=>upstream.destroy());
 upstream.on('error',()=>{if(res.headersSent)return res.destroy();res.writeHead(502,{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'});res.end('Backend unavailable');});
 req.on('aborted',()=>upstream.destroy());res.on('close',()=>{if(!res.writableEnded)upstream.destroy();});req.pipe(upstream);
});
server.requestTimeout=660000;
server.listen(Number(process.env.FRONTEND_PORT||1000),process.env.FRONTEND_HOST||'0.0.0.0');
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>{server.close(()=>process.exit(0));setTimeout(()=>process.exit(0),30000).unref();});
