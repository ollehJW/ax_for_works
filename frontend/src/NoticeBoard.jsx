import { useEffect, useState } from 'react';
import { Bell, History, Search, PenLine, ArrowLeft, ChevronLeft, ChevronRight, FileText } from 'lucide-react';
import { authRequest } from './authApi';
import './notice-board.css';
import RichTextEditor, {safeHTML,hasContent} from './RichTextEditor.jsx';
const labels = {notice:'공지사항',patch:'패치노트'};
const date = value => new Date(value).toLocaleDateString('ko-KR', {year:'numeric',month:'2-digit',day:'2-digit',timeZone:'Asia/Seoul'});
const go = (category, suffix='') => {window.location.hash=`notices/${category}${suffix ? '/'+suffix : ''}`;};
export default function NoticeBoard({user,route}) {
  const parts=route.split('/');const category=parts[1]==='patch'?'patch':'notice';const id=parts[2];const editing=id==='new'||parts[3]==='edit';
  const [page,setPage]=useState(1),[search,setSearch]=useState(''),[query,setQuery]=useState(''),[revision,setRevision]=useState(0);
  const [data,setData]=useState(null),[post,setPost]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const [form,setForm]=useState({title:'',content:'',content_format:'html'});
  useEffect(()=>{setPage(1);setSearch('');setQuery('');},[category]);
  useEffect(()=>{
    const c=new AbortController();setError('');setPost(null);setData(null);
    if(id==='new'){setForm({title:'',content:'',content_format:'html'});setLoading(false);return()=>c.abort();}
    setLoading(true);
    const path=id?`/board/${encodeURIComponent(id)}${editing?'?count_view=false':''}`:`/board?category=${category}&page=${page}&q=${encodeURIComponent(query)}`;
    const timer=setTimeout(()=>authRequest(path,{signal:c.signal}).then(value=>{if(c.signal.aborted)return;if(id){setPost(value);setForm({title:value.title,content:value.content,content_format:value.content_format||'plain'});}else setData(value);}).catch(e=>{if(!c.signal.aborted)setError(e.message);}).finally(()=>{if(!c.signal.aborted)setLoading(false);}),0);
    return()=>{clearTimeout(timer);c.abort();};
  },[category,id,editing,page,query,revision]);
  async function save(e){e.preventDefault();setBusy(true);setError('');try{const result=await authRequest(id==='new'?'/board':`/board/${id}`,{method:id==='new'?'POST':'PUT',body:JSON.stringify({...form,category:post?.category||category})});go(post?.category||category,result.post_id);setRevision(v=>v+1);}catch(e){setError(e.message);}finally{setBusy(false);}}
  const pages=Math.max(1,Math.ceil((data?.total||0)/10));
  return <div className="notice-page"><div className="notice-heading"><p className="eyebrow"><span/>NEWS & UPDATES</p><h1>공지사항</h1><p>서비스 안내와 AX for Works의 새로운 변화를 확인하세요.</p></div>
    <div className="notice-tabs" role="tablist" aria-label="게시판 선택">{Object.entries(labels).map(([key,label])=>{const Icon=key==='notice'?Bell:History;return <button key={key} id={`board-tab-${key}`} role="tab" aria-selected={category===key} aria-controls="board-panel" tabIndex={category===key?0:-1} onClick={()=>go(key)} onKeyDown={e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();const target=e.key==='Home'?'notice':e.key==='End'?'patch':category==='notice'?'patch':'notice';go(target);document.getElementById(`board-tab-${target}`).focus();}}}><Icon size={18}/>{label}</button>;})}</div>
    <section className="board-panel" id="board-panel" role="tabpanel" aria-labelledby={`board-tab-${category}`}>
      {error&&<div className="board-error" role="alert">{error}{!editing&&<button onClick={()=>setRevision(v=>v+1)}>다시 시도</button>}</div>}
      {loading?<div className="board-empty" role="status">불러오는 중입니다.</div>:editing?(user.is_admin?<form className="board-editor" onSubmit={save}><div className="board-section-heading"><h2>{labels[post?.category||category]} {id==='new'?'작성':'수정'}</h2><span>관리자 전용</span></div><fieldset disabled={busy}><label>제목<input value={form.title} onChange={e=>setForm({...form,title:e.target.value})} required maxLength={160} autoFocus/></label><span className="rich-label">내용</span><RichTextEditor key={`${id}-${category}`} value={form.content} format={form.content_format} disabled={busy} onChange={content=>setForm(current=>({...current,content,content_format:'html'}))}/><p className="board-editor-help">색상과 서식은 저장 후 게시글에도 동일하게 표시됩니다.</p><div className="board-editor-actions"><button type="button" onClick={()=>go(category,id==='new'?'':id)}>취소</button><button className="primary" type="submit" disabled={busy||!form.title.trim()||!hasContent(form.content,form.content_format)||form.content.length>30000}>{busy?'저장 중…':'게시글 저장'}</button></div></fieldset></form>:<div className="board-empty">관리자만 게시글을 작성할 수 있습니다.</div>):id?(post&&<article className="board-detail"><button className="board-back" onClick={()=>go(category)}><ArrowLeft size={16}/>목록으로</button><div className="board-post-label">{labels[post.category]}</div><h2>{post.title}</h2><div className="board-post-meta"><span>AX for Works 운영팀</span><span>등록 {date(post.created_at)}</span><span>조회수 {(post.view_count||0).toLocaleString()}</span>{post.updated_at!==post.created_at&&<span>수정 {date(post.updated_at)}</span>}{user.is_admin&&<button onClick={()=>go(post.category,`${id}/edit`)}><PenLine size={14}/>수정</button>}</div>{post.content_format==='html'?<div className="board-content board-rich" dangerouslySetInnerHTML={{__html:safeHTML(post.content)}}/>:<div className="board-content">{post.content}</div>}</article>):<>
        <div className="board-toolbar"><div><h2>{labels[category]}</h2><span>총 {data?.total||0}건</span></div><form onSubmit={e=>{e.preventDefault();setPage(1);setQuery(search.trim());}}><label className="board-search"><Search size={16}/><input aria-label="게시글 제목 검색" placeholder="제목으로 검색" value={search} onChange={e=>setSearch(e.target.value)} maxLength={100}/></label><button type="submit">검색</button></form>{user.is_admin&&<button className="board-write" onClick={()=>go(category,'new')}><PenLine size={15}/>글쓰기</button>}</div>
        <table className="board-table"><caption className="board-sr-only">{labels[category]} 게시글 목록</caption><thead><tr><th scope="col">번호</th><th scope="col">제목</th><th scope="col">작성자</th><th scope="col">등록일</th><th scope="col">조회수</th></tr></thead><tbody>{data?.posts.map((item,i)=><tr key={item.post_id}><td>{data.total-(page-1)*10-i}</td><td><a href={`#notices/${category}/${item.post_id}`}>{item.title}</a></td><td>운영팀</td><td>{date(item.created_at)}</td><td>{(item.view_count||0).toLocaleString()}</td></tr>)}</tbody></table>
        {!data?.posts.length&&<div className="board-empty"><FileText size={30}/><strong>{query?'검색 결과가 없습니다.':`등록된 ${labels[category]}${category==='notice'?'이':'가'} 없습니다.`}</strong><p>{query?'다른 검색어로 다시 찾아보세요.':category==='notice'?'서비스 이용에 필요한 소식을 이곳에서 안내합니다.':'기능 개선과 업데이트 내역을 이곳에서 안내합니다.'}</p></div>}
        <div className="board-pagination"><button aria-label="이전 페이지" disabled={page<=1} onClick={()=>setPage(p=>p-1)}><ChevronLeft size={16}/></button><span>{page} / {pages}</span><button aria-label="다음 페이지" disabled={page>=pages} onClick={()=>setPage(p=>p+1)}><ChevronRight size={16}/></button></div>
      </>}
    </section></div>;
}
