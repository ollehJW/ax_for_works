import React from 'react';
import {ExternalLink,MessageSquare} from 'lucide-react';
import './chat-sources.css';

const date = value => {
 const parsed = value ? new Date(value) : null;
 return parsed && !Number.isNaN(parsed.getTime()) ? parsed : null;
};
const stamp = value => {
 const parsed=date(value);
 return parsed ? new Intl.DateTimeFormat('ko-KR',{year:'numeric',month:'long',day:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'Asia/Seoul'}).format(parsed) : '시간 정보 없음';
};
const safeURL = value => {
 try {const u=new URL(value);return u.protocol==='https:'&&['teams.microsoft.com','teams.cloud.microsoft'].includes(u.hostname)&&!u.username&&!u.password?u.href:null;} catch {return null;}
};

export default function ChatSources({sources=[],evidence='',chatId='',chatTitle=''}) {
 const groups=new Map();
 for (const source of sources||[]) {
  const key=source.chat_id||chatId||source.chat_title||chatTitle||'unknown';
  if(!groups.has(key))groups.set(key,{title:source.chat_title||chatTitle||'Teams 채팅',messages:[],seen:new Set()});
  const group=groups.get(key);
  if(source.id&&group.seen.has(source.id))continue;
  if(source.id)group.seen.add(source.id);
  group.messages.push(source);
 }
 const hasQuote=evidence&&(sources||[]).some(s=>typeof s.text==='string'&&s.text.includes(evidence));
 return <div className="chat-transcript">
  {evidence&&!hasQuote&&<aside className="chat-evidence-note"><strong>저장된 근거 인용</strong><p>{evidence}</p></aside>}
  {[...groups].map(([key,group])=><section className="chat-transcript-room" key={key} aria-label={group.title+' 대화 출처'}>
   <header><MessageSquare size={16}/><strong>{group.title}</strong><span>{group.messages.length}개 메시지</span></header>
   <ol>{[...group.messages].sort((a,b)=>(date(a.created_at)?.getTime()??Infinity)-(date(b.created_at)?.getTime()??Infinity)).map((source,index)=>{
    const text=typeof source.text==='string'?source.text:'';
    const quote=evidence?text.indexOf(evidence):-1;
    const url=safeURL(source.url);
    return <li className="chat-transcript-message" key={source.id||index}>
     <span className="chat-speaker-avatar" aria-hidden="true">{Array.from(source.sender||'?')[0]}</span>
     <div className="chat-message-content"><div className="chat-message-meta"><strong>{source.sender||'발신자 정보 없음'}</strong><time dateTime={date(source.created_at)?.toISOString()}>{stamp(source.created_at)}</time></div>
      <div className={'chat-message-bubble'+(!text?' unavailable':'')}>{text?(quote<0?text:<>{text.slice(0,quote)}<mark>{evidence}</mark>{text.slice(quote+evidence.length)}</>):'이 기록에는 메시지 본문이 저장되어 있지 않습니다.'}</div>
      {text&&<small className="chat-excerpt-label">수집된 대화 발췌</small>}
      {url&&<a className="chat-message-link" href={url} target="_blank" rel="noopener noreferrer">Teams에서 원문 보기<ExternalLink size={12}/></a>}
     </div>
    </li>;
   })}</ol>
  </section>)}
  {!groups.size&&<p className="chat-source-empty">연결된 메시지 출처가 없습니다.</p>}
 </div>;
}
