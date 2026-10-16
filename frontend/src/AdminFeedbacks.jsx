import { useEffect, useRef, useState } from 'react';
import { Search, RefreshCw, Inbox, Paperclip, ArrowUpRight, Save, ChevronLeft, ChevronRight } from 'lucide-react';
import { authRequest } from './authApi';
import './admin.css';
const statuses={received:'접수',reviewing:'검토 중',resolved:'완료',on_hold:'보류'};
const kinds={platform_inquiry:'플랫폼 이용 문의',agent_usage:'사용 방법 문의',agent_bug:'Agent 버그 제보',agent_improvement:'Agent 기능 개선',new_agent:'신규 Agent 제안',other:'기타'};
const date=v=>new Date(v).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});
export default function AdminFeedbacks(){
  const [status,setStatus]=useState(''),[kind,setKind]=useState(''),[agent,setAgent]=useState(''),[order,setOrder]=useState('newest'),[query,setQuery]=useState(''),[search,setSearch]=useState(''),[page,setPage]=useState(1);
  const [data,setData]=useState(null),[selected,setSelected]=useState(''),[detail,setDetail]=useState(null),[form,setForm]=useState(null),[revision,setRevision]=useState(0),[detailRevision,setDetailRevision]=useState(0);
  const [error,setError]=useState(''),[detailError,setDetailError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true);
  const dirty=!!detail&&!!form&&(form.status!==detail.status||form.reply!==detail.reply||form.admin_note!==detail.admin_note);
  const dirtyRef=useRef(dirty);dirtyRef.current=dirty;
  useEffect(()=>{const listener=e=>{if(dirtyRef.current){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',listener);return()=>window.removeEventListener('beforeunload',listener);},[]);
  useEffect(()=>{
    const leaving=e=>{const link=e.target.closest?.('a');if(link?.getAttribute('href')?.startsWith('#')&&dirtyRef.current&&!window.confirm('저장하지 않은 변경사항이 있습니다. 다른 화면으로 이동할까요?')){e.preventDefault();e.stopPropagation();}};
    document.addEventListener('click',leaving,true);return()=>document.removeEventListener('click',leaving,true);
  },[]);
  useEffect(()=>{
    const controller=new AbortController();setLoading(true);setError('');
    const params=new URLSearchParams({page:String(page),order});if(status)params.set('status',status);if(kind)params.set('feedback_type',kind);if(agent)params.set('agent_id',agent);if(query)params.set('q',query);
    authRequest(`/admin/feedbacks?${params}`,{signal:controller.signal}).then(value=>{if(!controller.signal.aborted)setData(value);}).catch(e=>{if(!controller.signal.aborted)setError(e.message);}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return()=>controller.abort();
  },[status,kind,agent,query,order,page,revision]);
  useEffect(()=>{
    if(!selected){setDetail(null);setForm(null);return;}
    const controller=new AbortController();setDetail(null);setForm(null);setDetailError('');setNotice('');
    authRequest(`/admin/feedbacks/${selected}`,{signal:controller.signal}).then(value=>{if(!controller.signal.aborted){setDetail(value);setForm({status:value.status,reply:value.reply,admin_note:value.admin_note,revision:value.revision});}}).catch(e=>{if(!controller.signal.aborted)setDetailError(e.message);});
    return()=>controller.abort();
  },[selected,detailRevision]);
  function select(id){if(busy)return;if(id===selected)return;if(dirty&&!window.confirm('저장하지 않은 변경사항이 있습니다. 다른 피드백을 열까요?'))return;setSelected(id);}
  async function save(e){e.preventDefault();if(busy||!detail)return;setBusy(true);setDetailError('');setNotice('');try{const result=await authRequest(`/admin/feedbacks/${selected}`,{method:'PATCH',body:JSON.stringify(form)});setDetail(old=>({...old,...result}));setForm({status:result.status,reply:result.reply,admin_note:result.admin_note,revision:result.revision});setNotice('처리 내용을 저장했습니다.');setRevision(v=>v+1);}catch(e){setDetailError(e.message);}finally{setBusy(false);}}
  const total=Object.values(data?.counts||{}).reduce((a,b)=>a+Number(b),0),pages=Math.max(1,Math.ceil((data?.total||0)/10));
  return <div className="admin-page"><div className="admin-heading"><div><p className="eyebrow"><span/>LISTEN & IMPROVE</p><h1>피드백 관리</h1><p>구성원의 의견을 살펴보고, 처리 현황과 답변을 관리하세요.</p></div><button className="admin-secondary" onClick={()=>setRevision(v=>v+1)}><RefreshCw size={15}/>목록 새로고침</button></div>
    <div className="admin-status-filters" aria-label="처리 상태 필터">{[['','전체',total],...Object.entries(statuses).map(([key,label])=>[key,label,data?.counts?.[key]||0])].map(([key,label,n])=><button key={key} className={status===key?'selected':''} aria-pressed={status===key} onClick={()=>{setStatus(key);setPage(1);}}><span>{label}</span><strong>{n}</strong></button>)}</div>
    <div className="admin-feedback-filters"><select aria-label="피드백 유형 필터" value={kind} onChange={e=>{setKind(e.target.value);setPage(1);}}><option value="">모든 유형</option>{Object.entries(kinds).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select><select aria-label="Agent 필터" value={agent} onChange={e=>{setAgent(e.target.value);setPage(1);}}><option value="">모든 Agent</option>{data?.agents.map(a=><option key={a.agent_id} value={a.agent_id}>{a.agent_name}</option>)}</select><form onSubmit={e=>{e.preventDefault();setQuery(search.trim());setPage(1);}}><Search size={16}/><input aria-label="피드백 검색" placeholder="내용 · 작성자 · 사번 검색" value={search} maxLength={100} onChange={e=>setSearch(e.target.value)}/><button type="submit">검색</button></form><select aria-label="피드백 정렬" value={order} onChange={e=>{setOrder(e.target.value);setPage(1);}}><option value="newest">최신순</option><option value="oldest">오래된 순</option></select></div>
    {error&&<div className="admin-error" role="alert">{error}</div>}
    <div className="admin-feedback-workspace"><section className="admin-feedback-list" aria-label="접수 목록"><div className="admin-panel-heading"><h2>접수 목록</h2><span>{data?.total||0}건</span></div>
      {loading?<div className="admin-empty" role="status">피드백을 불러오는 중입니다.</div>:!data?.feedbacks.length?<div className="admin-empty"><Inbox size={32}/><strong>조건에 맞는 피드백이 없습니다.</strong><span>검색어나 필터를 변경해 보세요.</span></div>:data.feedbacks.map(item=><button type="button" className={`admin-feedback-item ${selected===item.feedback_id?'selected':''}`} key={item.feedback_id} disabled={busy} onClick={()=>select(item.feedback_id)}><div><span className={`admin-status status-${item.status}`}>{statuses[item.status]}</span><small>{kinds[item.feedback_type]}</small>{item.image_count>0&&<span className="admin-attachment-count"><Paperclip size={12}/>{item.image_count}</span>}</div><strong>{item.agent_name||'AX for Works'}</strong><p>{item.preview}</p><div className="admin-item-meta"><span>{item.author_name||'삭제된 계정'}</span><time dateTime={item.created_at}>{date(item.created_at)}</time></div></button>)}
      <div className="admin-pagination"><button aria-label="이전 페이지" disabled={page<=1||loading} onClick={()=>setPage(p=>p-1)}><ChevronLeft size={17}/></button><span>{page} / {pages}</span><button aria-label="다음 페이지" disabled={page>=pages||loading} onClick={()=>setPage(p=>p+1)}><ChevronRight size={17}/></button></div>
    </section><section className="admin-feedback-detail" aria-label="피드백 상세">
      {!selected?<div className="admin-detail-placeholder"><Inbox size={43}/><h2>피드백을 선택해 주세요.</h2><p>상세 내용과 첨부 이미지를 확인하고<br/>처리 상태와 답변을 남길 수 있습니다.</p></div>:<>{detailError&&<div className="admin-error" role="alert">{detailError}<button type="button" disabled={busy} onClick={()=>{if(!dirty||window.confirm('입력 중인 내용을 버리고 최신 내용을 불러올까요?'))setDetailRevision(v=>v+1);}}>최신 내용 불러오기</button></div>}{notice&&<div className="admin-success" role="status">{notice}</div>}
        {!detail&&!detailError?<div className="admin-empty">상세 내용을 불러오는 중입니다.</div>:detail&&<><div className="admin-detail-heading"><span className={`admin-status status-${detail.status}`}>{statuses[detail.status]}</span><span>{kinds[detail.feedback_type]}</span><h2>{detail.agent_name||'AX for Works'}</h2><p>{detail.author_name||'삭제된 계정'}{detail.author_employee_id&&` · ${detail.author_employee_id}`}<span>{date(detail.created_at)}</span></p></div><div className="admin-feedback-content">{detail.content}</div>{detail.images.length>0&&<div className="admin-feedback-images">{detail.images.map(image=><a key={image.image_id} href={image.url} target="_blank" rel="noreferrer"><img src={image.url} alt={image.name}/><span>{image.name}<ArrowUpRight size={13}/></span></a>)}</div>}
        <form className="admin-feedback-editor" onSubmit={save}><fieldset disabled={busy}><label>처리 상태<select value={form.status} onChange={e=>setForm({...form,status:e.target.value})}>{Object.entries(statuses).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label><label>작성자에게 답변<span>작성자의 피드백 내역에 표시됩니다.</span><textarea rows={4} maxLength={10000} value={form.reply} onChange={e=>setForm({...form,reply:e.target.value})} placeholder="확인한 내용이나 안내할 사항을 작성하세요."/></label><label>관리자 메모<span>관리자에게만 표시됩니다.</span><textarea rows={3} maxLength={10000} value={form.admin_note} onChange={e=>setForm({...form,admin_note:e.target.value})} placeholder="검토 내용이나 후속 작업을 기록하세요."/></label></fieldset><div className="admin-editor-actions"><small>{detail.revision>0?`최근 처리 ${date(detail.updated_at)}`:'아직 처리 내역이 없습니다.'}{dirty&&' · 저장되지 않은 변경사항'}</small><button type="submit" className="admin-primary" disabled={!dirty||busy}><Save size={16}/>{busy?'저장 중…':'처리 내용 저장'}</button></div></form></>}
      </>}
    </section></div>
  </div>;
}
