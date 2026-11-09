import {useEffect,useState} from 'react';
import {Users,LogIn,TrendingUp,RefreshCw,ChevronLeft,ChevronRight} from 'lucide-react';
import {authRequest} from './authApi';
import './admin.css';
import './adminAccess.css';
const stamp=value=>new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(new Date(value));
const number=value=>Number(value).toLocaleString('ko-KR');
function VisitorsChart({series}){
 const width=1000,height=260,left=48,right=18,top=24,bottom=38;
 const plotWidth=width-left-right,plotHeight=height-top-bottom;
 const peak=Math.max(0,...series.map(point=>point.visitors));
 const step=Math.max(1,Math.ceil(peak/4)),max=step*4;
 const slot=plotWidth/series.length,bar=Math.min(48,slot*.58);
 return <svg className="access-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="일별 고유 접속자 수. X축 날짜, Y축 접속자 수(명)">
  <text x={left} y={13} className="access-axis">접속자 수 (명)</text>
  {[0,1,2,3,4].map(i=>{const y=top+plotHeight*(1-i/4);return <g key={i}><line x1={left} x2={width-right} y1={y} y2={y} stroke="#e8edf5"/><text x={left-10} y={y+4} textAnchor="end" className="access-axis">{step*i}</text></g>;})}
  {series.map((point,i)=>{const x=left+slot*(i+.5),h=point.visitors/max*plotHeight;return <g key={point.day} tabIndex={0} aria-label={`${point.day}: ${point.visitors}명`}>
   <title>{point.day} · {point.visitors}명</title>
   <rect x={x-slot/2+1} y={top} width={slot-2} height={plotHeight} fill="transparent"/>
   <rect x={x-bar/2} y={top+plotHeight-h} width={bar} height={h} rx={4} fill="#315fbc"/>
   {series.length===7&&<text x={x} y={top+plotHeight-h-8} textAnchor="middle" className="access-value">{point.visitors}</text>}
   {(series.length===7||i%5===0||i===series.length-1)&&<text x={x} y={height-13} textAnchor="middle" className="access-axis">{point.day.slice(5).replace('-','/')}</text>}
  </g>})}
 </svg>;
}
export default function AdminAccess(){
 const [query,setQuery]=useState({days:7,service:'all',page:1,snapshot:null});
 const [data,setData]=useState(null),[error,setError]=useState(''),[loading,setLoading]=useState(true),[revision,setRevision]=useState(0);
 useEffect(()=>{
  const controller=new AbortController();setLoading(true);setError('');
  const params=new URLSearchParams({days:String(query.days),service:query.service,page:String(query.page)});
  if(query.snapshot!==null)params.set('snapshot',query.snapshot);
  authRequest('/admin/access?'+params,{signal:controller.signal})
   .then(result=>{if(!controller.signal.aborted)setData(result);})
   .catch(e=>{if(!controller.signal.aborted)setError(e.message);})
   .finally(()=>{if(!controller.signal.aborted)setLoading(false);});
  return()=>controller.abort();
 },[query,revision]);
 function choose(key,value){setQuery(q=>({...q,[key]:value,page:1,snapshot:null}));}
 const names=Object.fromEntries((data?.services||[]).map(s=>[s.id,s.name]));
 return <div className="admin-page access-page">
  <div className="admin-heading"><div><p className="eyebrow"><span/>PLATFORM INSIGHTS</p><h1>접속자 관리</h1><p>플랫폼 로그인과 서비스 첫 진입 현황을 확인하세요.</p></div>
   <button className="admin-secondary" disabled={loading} onClick={()=>{setQuery(q=>({...q,page:1,snapshot:null}));setRevision(v=>v+1);}}><RefreshCw size={15}/>새로고침</button>
  </div>
  <div className="access-toolbar"><div className="access-periods" role="group" aria-label="조회 기간">{[7,30].map(days=><button key={days} aria-pressed={query.days===days} onClick={()=>choose('days',days)}>최근 {days}일</button>)}</div>
   <label className="access-filter">서비스<select aria-label="서비스 필터" value={query.service} onChange={e=>choose('service',e.target.value)}><option value="all">전체 서비스</option>{(data?.services||[]).map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
   <span className="access-timezone">한국 시간 · 오늘 포함</span>
  </div>
  {error?<div className="admin-error" role="alert">{error}<button className="admin-secondary" onClick={()=>setRevision(v=>v+1)}>다시 시도</button></div>:loading?<div className="admin-empty" role="status">접속 현황을 불러오는 중입니다.</div>:data&&<>
   <div className="access-stats">{[[Users,'기간 내 고유 접속자',number(data.summary.visitors),'명'],[LogIn,'로그인·첫 진입 기록',number(data.summary.events),'건'],[TrendingUp,'하루 최다 접속자',number(Math.max(0,...data.series.map(p=>p.visitors))),'명']].map(([Icon,label,value,unit])=><section key={label}><span className="access-stat-icon"><Icon size={22}/></span><div><p>{label}</p><strong>{value}<small>{unit}</small></strong></div></section>)}</div>
   <section className="access-panel"><div className="access-panel-head"><div><h2>일별 접속자 수</h2><p>같은 날 여러 번 접속해도 한 사람은 1명으로 집계합니다.</p></div><span className="access-legend"><i/>고유 접속자</span></div><VisitorsChart series={data.series}/>
    {data.summary.visitors===0&&<p className="access-empty-note">선택한 기간에 기록된 접속자가 없습니다.</p>}
   </section>
   <section className="access-panel"><div className="access-panel-head"><div><h2>접속 이력 <span>{number(data.total)}</span></h2><p>플랫폼 로그인 성공 및 로그인 세션당 서비스별 첫 진입 기록입니다.</p></div><span className="access-timezone">최신순 · 10개씩</span></div>
    <div className="access-table-wrap"><table className="access-table"><thead><tr><th>접속 일시</th><th>이름</th><th>사번</th><th>팀</th><th>서비스</th><th>유형</th></tr></thead><tbody>{data.events.length?data.events.map(event=><tr key={event.event_id}><td className="access-timestamp">{stamp(event.occurred_at)}</td><td><strong>{event.full_name}</strong></td><td>{event.employee_id}</td><td>{event.team_name||'미지정'}</td><td>{names[event.service_id]||event.service_id}</td><td><span className={`access-kind ${event.event_kind==='login'?'login':''}`}>{event.event_kind==='login'?'로그인':'첫 진입'}</span></td></tr>):<tr><td colSpan={6} className="access-no-rows">접속 기록이 없습니다.</td></tr>}</tbody></table></div>
    <div className="access-pagination"><span>총 {number(data.total)}건</span><div><button disabled={data.page<=1} onClick={()=>setQuery(q=>({...q,page:data.page-1,snapshot:data.snapshot}))}><ChevronLeft size={16}/>이전</button><span>{data.page} / {data.pages}</span><button disabled={data.page>=data.pages} onClick={()=>setQuery(q=>({...q,page:data.page+1,snapshot:data.snapshot}))}>다음<ChevronRight size={16}/></button></div></div>
   </section>
   <p className="access-footnote">기록 수집 시작: {stamp(data.collection_started_at)} · 수집 시작 이전의 접속은 포함되지 않습니다. 첫 진입 이후 활동이나 새로고침은 추가 집계하지 않습니다.</p>
  </>}
 </div>;
}
