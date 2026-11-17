import React,{useEffect,useMemo,useRef,useState} from 'react';
import DOMPurify from 'dompurify';
import {EvaluationSummary} from './Evaluation';
import {ArrowLeft,Download,Paperclip,Image,RefreshCw,Loader2,FileText,AlertCircle} from 'lucide-react';

export const fileSize=value=>value>=1048576?`${(value/1048576).toFixed(1)} MB`:value>=1024?`${Math.ceil(value/1024)} KB`:`${value||0} B`;
const fullDate=value=>value?new Intl.DateTimeFormat('ko-KR',{dateStyle:'long',timeStyle:'short',timeZone:'Asia/Seoul'}).format(new Date(value)):'';
const person=p=>p?.address?`${p.name||p.address}${p.name?' <'+p.address+'>':''}`:p?.name||'정보 없음';
const safeImage=value=>/^data:image\/(png|jpeg|gif|webp);base64,[A-Za-z0-9+/=]+$/i.test(value||'');

export function emailDocument(body,inlineImages={},remote=false){
 const plain=(body?.contentType||'').toLowerCase()==='text';
 const source=plain?'<pre>'+String(body?.content||'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')+'</pre>':body?.content||'';
 const fragment=DOMPurify.sanitize(source,{RETURN_DOM_FRAGMENT:true,FORCE_BODY:true,USE_PROFILES:{html:true},ADD_TAGS:['style'],
  FORBID_TAGS:['script','iframe','frame','frameset','object','embed','base','meta','link','form','input','button','textarea','select','video','audio','source','svg','math'],
  FORBID_ATTR:['srcset','srcdoc','formaction','action','ping']});
 const resolveImage=value=>{
  if(!value)return '';
  const v=value.trim();
  if(/^cid:/i.test(v)){
   let cid=v.slice(4).replace(/^<|>$/g,'');try{cid=decodeURIComponent(cid);}catch{}
   const image=inlineImages[cid];return safeImage(image)?image:'';
  }
  if(safeImage(v))return v;
  if(remote&&/^https:\/\//i.test(v))return v;
  return '';
 };
 for(const element of fragment.querySelectorAll('*')){
  if(element.hasAttribute('src')){
   const value=element.tagName==='IMG'?resolveImage(element.getAttribute('src')):'';
   if(value)element.setAttribute('src',value);else element.removeAttribute('src');
  }
  if(element.tagName==='IMG'){element.setAttribute('referrerpolicy','no-referrer');element.setAttribute('loading','lazy');}
  if(element.hasAttribute('background')){
   const value=resolveImage(element.getAttribute('background'));
   if(value)element.setAttribute('background',value);else element.removeAttribute('background');
  }
  if(element.hasAttribute('href')){
   const href=element.getAttribute('href').trim();
   if(element.tagName!=='A'||!(/^(https?:\/\/|mailto:)/i.test(href)))element.removeAttribute('href');
   else{element.setAttribute('target','_blank');element.setAttribute('rel','noopener noreferrer');}
  }
 }
 // CSS remains confined to this sandbox and its CSP: no scripts, forms, imports or network APIs.
 const holder=document.createElement('div');holder.append(fragment);
 const sanitized=DOMPurify.sanitize(holder.innerHTML,{FORCE_BODY:true,USE_PROFILES:{html:true},ADD_TAGS:['style'],ADD_ATTR:['target'],FORBID_TAGS:['form','input','button','meta','link','base'],FORBID_ATTR:['srcset']});
 const policy=`default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src data:${remote?' https:':''}; font-src 'none'; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'`;
 return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${policy}"><meta name="referrer" content="no-referrer"><style>html{color-scheme:light}body{margin:0;padding:24px;color:#27364b;background:#fff;font:14px/1.7 Arial,sans-serif;overflow-wrap:anywhere}img{max-width:100%;height:auto}pre{white-space:pre-wrap;font:inherit}table{max-width:100%}a{color:#1755a2}</style></head><body>${sanitized}</body></html>`;
}

export default function MailReader({message,api,onBack,onInvalid,onRead,backLabel="목록으로"}){
 const [detail,setDetail]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[remote,setRemote]=useState(false),[revision,setRevision]=useState(0),[downloading,setDownloading]=useState(null),[downloadError,setDownloadError]=useState('');
 const [readError,setReadError]=useState('');
 async function markRead(){
  try{await api('/mail/read?'+new URLSearchParams({message_id:message.id}),{});setReadError('');onRead?.(message.id);}
  catch{setReadError('읽음 상태를 저장하지 못했습니다.');}
 }
 const heading=useRef(null);
 useEffect(()=>{heading.current?.focus();},[]);
 useEffect(()=>{let active=true;setLoading(true);setError('');setDetail(null);api('/mail/message?'+new URLSearchParams({message_id:message.id})).then(d=>{if(active){setDetail(d);if(message.unread)void markRead();}}).catch(e=>{if(!active)return;if(e.code==='invalid_token')onInvalid(e.message);else setError(e.message);}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[message.id,revision]);
 const documentHtml=useMemo(()=>emailDocument(detail?.body,detail?.inline_images,remote),[detail,remote]);
 async function download(item){setDownloadError('');setDownloading(item.id);
  try{
   const response=await fetch('/wiaassist/api/mail/attachment?'+new URLSearchParams({message_id:message.id,attachment_id:item.id}),{credentials:'same-origin'});
   if(!response.ok){const data=await response.json().catch(()=>({}));if(response.status===401){window.location.replace('/login?next=%2Fwiaassist%2Fagent');return;}if(data.code==='invalid_token'){onInvalid(data.detail);return;}throw Error(data.detail||'첨부파일을 내려받지 못했습니다.');}
   const blob=await response.blob();const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;
   const encoded=response.headers.get('Content-Disposition')?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
   let name=item.name;try{if(encoded)name=decodeURIComponent(encoded);}catch{}
   a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
  }catch(e){setDownloadError(e.message||'첨부파일을 내려받지 못했습니다.');}finally{setDownloading(null);}
 }
 const attachments=detail?.attachments||[];
 return <section className="reader card"><div className="reader-toolbar"><button className="secondary" onClick={onBack}><ArrowLeft size={16}/>{backLabel}</button><div><button className="secondary" disabled={loading} onClick={()=>setRevision(n=>n+1)} aria-label="메일 다시 불러오기"><RefreshCw size={16}/></button></div></div><header className="reader-heading"><span className="eyebrow">MESSAGE</span><h2 ref={heading} tabIndex={-1}>{detail?.subject||message.subject||'(제목 없음)'}</h2>{detail&&<dl><div><dt>보낸 사람</dt><dd>{person(detail.from)}</dd></div><div><dt>받는 사람</dt><dd>{detail.to.map(person).join(', ')||'정보 없음'}</dd></div>{detail.cc.length>0&&<div><dt>참조</dt><dd>{detail.cc.map(person).join(', ')}</dd></div>}<div><dt>받은 시간</dt><dd>{fullDate(detail.received_at)}</dd></div></dl>}</header><EvaluationSummary message={message}/>{readError&&<div className="alert" role="alert"><span>{readError}</span><button onClick={markRead}>다시 저장</button></div>}{loading?<div className="empty"><Loader2 className="spin" size={30}/><p>메일 본문과 첨부파일을 불러오고 있습니다.</p></div>:error?<div className="reader-error" role="alert"><AlertCircle size={21}/><p>{error}</p><button className="secondary" onClick={()=>setRevision(n=>n+1)}>다시 시도</button></div>:detail&&<><div className="reader-image-bar"><span><Image size={16}/>{remote?'외부 이미지가 표시됩니다.':'메일에 포함된 이미지는 바로 표시됩니다.'}</span><button className="text-link" onClick={()=>setRemote(v=>!v)}>{remote?'외부 이미지 숨기기':'외부 이미지 표시'}</button></div><iframe className="mail-html" title="메일 본문" sandbox="allow-popups allow-popups-to-escape-sandbox" referrerPolicy="no-referrer" srcDoc={documentHtml}/><section className="attachment-section"><div className="attachment-title"><Paperclip size={18}/><h3>첨부파일</h3><span>{attachments.length}개</span></div>{detail.attachment_notice&&<p className="attachment-notice" role="status">{detail.attachment_notice}</p>}{downloadError&&<p className="attachment-notice" role="alert">{downloadError}</p>}{attachments.length?<div className="attachment-grid">{attachments.map(item=><div className="attachment-card" key={item.id}><span className="attachment-icon">{item.content_type?.startsWith('image/')?<Image size={22}/>:<FileText size={22}/>}</span><div><strong title={item.name}>{item.name}</strong><small>{fileSize(item.size)}{item.inline?' · 본문 이미지':''}{!item.downloadable?' · Outlook에서 확인':''}</small></div><button className="attachment-download" disabled={!item.downloadable||downloading!==null} onClick={()=>download(item)} aria-label={item.name+' 다운로드'} title="다운로드">{downloading===item.id?<Loader2 size={18} className="spin"/>:<Download size={18}/>}</button></div>)}</div>:<p className="no-attachments">첨부파일이 없습니다.</p>}</section></>}</section>;
}
