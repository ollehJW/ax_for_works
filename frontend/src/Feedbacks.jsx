import { useEffect, useRef, useState } from 'react';
import { Bug, WandSparkles, Lightbulb, MessageSquare, ImagePlus, X, Send, CheckCircle2, ChevronLeft, ChevronRight, ArrowUpRight } from 'lucide-react';
import { authRequest } from './authApi';
import './feedbacks.css';

const types = [
  {id:'agent_bug',name:'Agent 버그 제보',hint:'오류나 예상과 다른 동작',Icon:Bug},
  {id:'agent_improvement',name:'Agent 기능 개선',hint:'더 편리해지는 기능과 경험',Icon:WandSparkles},
  {id:'new_agent',name:'신규 Agent 제안',hint:'새롭게 도와주었으면 하는 업무',Icon:Lightbulb},
  {id:'other',name:'기타',hint:'그 밖에 전하고 싶은 의견',Icon:MessageSquare},
];
const placeholders={agent_bug:'어떤 작업 중 문제가 발생했나요?\n발생한 상황과 예상했던 결과를 알려 주세요.',agent_improvement:'어떤 기능이 어떻게 개선되면 좋을까요?\n현재의 불편함과 원하는 사용 방식을 알려 주세요.',new_agent:'어떤 업무를 도와주는 Agent가 필요하신가요?\n현재 업무 방식과 해결하고 싶은 문제를 알려 주세요.',other:'AX for Works에 전하고 싶은 의견을 자유롭게 작성해 주세요.'};
const readFile=file=>new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(new Error('이미지를 읽지 못했습니다. 다시 첨부해 주세요.'));r.readAsDataURL(file);});
const date=value=>new Date(value).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});

export default function Feedbacks({agents,loading:agentsLoading,error:agentsError,onRetry,user}) {
  const [type,setType]=useState(''),[agent,setAgent]=useState(''),[content,setContent]=useState(''),[images,setImages]=useState([]);
  const [error,setError]=useState(''),[busy,setBusy]=useState(false),[reading,setReading]=useState(false),[success,setSuccess]=useState(null);
  const [history,setHistory]=useState(null),[historyError,setHistoryError]=useState(''),[page,setPage]=useState(1),[revision,setRevision]=useState(0);
  const input=useRef(null),locked=useRef(false),mounted=useRef(true);
  const needsAgent=['agent_bug','agent_improvement'].includes(type);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  useEffect(()=>{
    const controller=new AbortController();setHistory(null);setHistoryError('');
    authRequest(`/feedbacks?page=${page}`,{signal:controller.signal}).then(value=>{if(!controller.signal.aborted)setHistory(value);}).catch(e=>{if(!controller.signal.aborted)setHistoryError(e.message);});
    return()=>controller.abort();
  },[page,revision]);
  async function attach(e){
    const files=Array.from(e.target.files||[]);e.target.value='';if(!files.length)return;
    setError('');
    if(images.length+files.length>5){setError('이미지는 최대 5장까지 첨부할 수 있습니다.');return;}
    if(files.some(f=>!['image/png','image/jpeg','image/webp'].includes(f.type))){setError('PNG, JPG, WebP 이미지만 첨부할 수 있습니다.');return;}
    if(files.some(f=>!f.size||f.size>5*1024*1024)){setError('이미지는 파일당 5MB 이하의 파일을 선택해 주세요.');return;}
    if(files.some(f=>f.name.length>200)){setError('파일 이름은 200자 이하로 변경해 주세요.');return;}
    setReading(true);
    try{const next=await Promise.all(files.map(async file=>({id:crypto.randomUUID(),name:file.name,size:file.size,preview:await readFile(file)})));if(mounted.current)setImages(prev=>[...prev,...next]);}
    catch(e){if(mounted.current)setError(e.message);}finally{if(mounted.current)setReading(false);}
  }
  async function submit(e){
    e.preventDefault();if(locked.current)return;
    setError('');
    if(!type||!content.trim()||(needsAgent&&!agent)){setError('피드백 유형, Agent 선택 여부와 내용을 확인해 주세요.');return;}
    locked.current=true;setBusy(true);
    try{
      const result=await authRequest('/feedbacks',{method:'POST',body:JSON.stringify({feedback_type:type,agent_id:needsAgent?agent:null,content:content.trim(),images:images.map(i=>({name:i.name,data:i.preview.split(',')[1]}))})});
      if(mounted.current){setSuccess(result.feedback_id);setType('');setAgent('');setContent('');setImages([]);setPage(1);setRevision(v=>v+1);window.scrollTo({top:0,behavior:'smooth'});}
    }catch(e){if(mounted.current)setError(e.message);}finally{locked.current=false;if(mounted.current)setBusy(false);}
  }
  const pages=Math.max(1,Math.ceil((history?.total||0)/10));
  return <div className="feedback-page">
    <div className="feedback-heading"><p className="eyebrow"><span/>BETTER WORK, TOGETHER</p><h1>Feedbacks</h1><p>작은 불편부터 새로운 아이디어까지, 더 나은 업무 경험을 함께 만들어 주세요.</p></div>
    {success?<section className="feedback-success" role="status"><CheckCircle2 size={38}/><h2>의견을 보내주셔서 감사합니다.</h2><p>피드백이 정상적으로 접수되었습니다. 아래 제출 내역에서 확인할 수 있습니다.</p><button type="button" onClick={()=>setSuccess(null)}>새 피드백 작성</button></section>:<form className="feedback-form" onSubmit={submit}>
      <fieldset disabled={busy||reading}>
        <section className="feedback-section"><div className="feedback-section-title"><span>01</span><h2>어떤 의견을 보내고 싶으신가요?</h2><small>필수</small></div>
          <div className="feedback-types" role="radiogroup" aria-label="피드백 유형">{types.map(({id,name,hint,Icon})=><label key={id} className={`feedback-type ${type===id?'is-selected':''}`}><input type="radio" name="feedback-type" value={id} checked={type===id} onChange={()=>{setType(id);setAgent('');setError('');}} required/><span className="feedback-type-icon"><Icon size={22}/></span><strong>{name}</strong><small>{hint}</small></label>)}</div>
          {needsAgent&&<div className="feedback-agent"><label htmlFor="feedback-agent">대상 Agent <span>필수</span></label><select id="feedback-agent" value={agent} onChange={e=>setAgent(e.target.value)} required disabled={agentsLoading||agentsError}><option value="">{agentsLoading?'Agent 목록을 불러오는 중…':'Agent를 선택해 주세요'}</option>{agents.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select>{agentsError&&<p role="alert">Agent 목록을 불러오지 못했습니다. <button type="button" onClick={onRetry}>다시 시도</button></p>}</div>}
        </section>
        <section className="feedback-section"><div className="feedback-section-title"><span>02</span><label htmlFor="feedback-content">내용을 들려주세요</label><small>필수</small></div><textarea id="feedback-content" value={content} onChange={e=>setContent(e.target.value)} placeholder={placeholders[type]||'유형을 선택하고 의견을 작성해 주세요.'} required maxLength={10000} rows={7}/><div className="feedback-content-help"><span>문제가 발생한 상황이나 원하는 변화를 구체적으로 알려주시면 도움이 됩니다.</span><span>{content.length.toLocaleString()} / 10,000</span></div></section>
        <section className="feedback-section"><div className="feedback-section-title"><span>03</span><h2>이미지를 함께 첨부하세요</h2><small>선택</small></div><div className="feedback-upload"><div><ImagePlus size={24}/><span><strong>화면 캡처로 더 자세히 전달하세요.</strong><small>PNG, JPG, WebP · 파일당 5MB · 최대 5장</small></span></div><button type="button" onClick={()=>input.current?.click()} disabled={images.length>=5||reading}><ImagePlus size={16}/>{reading?'읽는 중…':'이미지 선택'} <span>{images.length}/5</span></button><input ref={input} type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={attach} hidden aria-label="피드백 이미지 첨부"/></div>
          {images.length>0&&<div className="feedback-previews">{images.map(image=><figure key={image.id}><img src={image.preview} alt={`첨부 미리보기: ${image.name}`}/><button type="button" aria-label={`${image.name} 첨부 삭제`} onClick={()=>setImages(prev=>prev.filter(i=>i.id!==image.id))}><X size={15}/></button><figcaption title={image.name}>{image.name}<small>{(image.size/1024/1024).toFixed(2)}MB</small></figcaption></figure>)}</div>}
        </section>
      </fieldset>
      {error&&<div className="feedback-error" role="alert">{error}</div>}
      <div className="feedback-submit"><p>제출한 내용과 이미지는 작성자와 관리자만 확인할 수 있습니다.</p><button type="submit" disabled={busy||reading||!type||!content.trim()||(needsAgent&&(!agent||agentsLoading||agentsError))}><Send size={17}/>{busy?'보내는 중…':'피드백 보내기'}</button></div>
    </form>}
    <section className="feedback-history"><div className="feedback-history-heading"><div><h2>{user.is_admin?'접수된 피드백':'내가 보낸 피드백'}</h2><p>{user.is_admin?'구성원들이 보내온 의견을 확인하세요.':'보내주신 의견을 다시 확인할 수 있습니다.'}</p></div><span>{history?.total||0}건</span></div>
      {historyError?<div className="feedback-error" role="alert">{historyError}<button type="button" onClick={()=>setRevision(v=>v+1)}>다시 시도</button></div>:!history?<p className="feedback-empty" role="status">제출 내역을 불러오는 중입니다.</p>:history.feedbacks.length===0?<p className="feedback-empty">아직 접수된 피드백이 없습니다.</p>:history.feedbacks.map(item=><details className="feedback-item" key={item.feedback_id}><summary><span className="feedback-kind">{types.find(t=>t.id===item.feedback_type)?.name}</span><span className="feedback-summary"><strong>{item.agent_name||'AX for Works'}</strong><span>{item.content}</span></span><span className="feedback-date">{user.is_admin&&<span>{item.author_name||'삭제된 계정'}</span>}<time dateTime={item.created_at}>{date(item.created_at)}</time></span></summary><div className="feedback-detail"><p>{item.content}</p>{item.images.length>0&&<div className="feedback-saved-images">{item.images.map(image=><a key={image.image_id} href={image.url} target="_blank" rel="noreferrer"><img src={image.url} alt={image.name} loading="lazy"/><span>{image.name}<ArrowUpRight size={14}/></span></a>)}</div>}</div></details>)}
      {history&&pages>1&&<div className="feedback-pagination"><button aria-label="이전 피드백 페이지" disabled={page<=1} onClick={()=>setPage(p=>p-1)}><ChevronLeft size={17}/></button><span>{page} / {pages}</span><button aria-label="다음 피드백 페이지" disabled={page>=pages} onClick={()=>setPage(p=>p+1)}><ChevronRight size={17}/></button></div>}
    </section>
  </div>;
}
