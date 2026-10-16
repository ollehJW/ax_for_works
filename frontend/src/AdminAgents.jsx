import { useEffect, useState } from 'react';
import { ArrowUpRight, RefreshCw, Layers3, Eye, EyeOff } from 'lucide-react';
import { authRequest } from './authApi';
import './admin.css';

export default function AdminAgents({onCatalogChange}) {
  const [agents,setAgents]=useState(null),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(''),[revision,setRevision]=useState(0);
  useEffect(()=>{
    const controller=new AbortController();setError('');
    authRequest('/admin/agents',{signal:controller.signal}).then(data=>{if(!controller.signal.aborted)setAgents(data.agents);}).catch(e=>{if(!controller.signal.aborted)setError(e.message);});
    return()=>controller.abort();
  },[revision]);
  async function toggle(agent){
    if(busy)return;setBusy(agent.id);setError('');setNotice('');
    try{
      const result=await authRequest(`/admin/agents/${agent.id}`,{method:'PATCH',body:JSON.stringify({enabled:!agent.enabled,expected_enabled:agent.enabled})});
      setAgents(list=>list.map(a=>a.id===agent.id?{...a,...result}:a));setNotice(`${agent.name} ${result.enabled?'활성화':'비활성화'} 설정을 저장했습니다.`);onCatalogChange();
    }catch(e){setError(e.message);if(e.status===409)setRevision(v=>v+1);}finally{setBusy('');}
  }
  const enabled=agents?.filter(a=>a.enabled).length||0;
  return <div className="admin-page"><div className="admin-heading"><div><p className="eyebrow"><span/>PLATFORM OPERATIONS</p><h1>Agent 관리</h1><p>플랫폼에 공개할 Agent를 선택하고, 서비스별 운영 화면으로 이동하세요.</p></div><button className="admin-secondary" onClick={()=>setRevision(v=>v+1)} disabled={!!busy}><RefreshCw size={15}/>새로고침</button></div>
    <div className="admin-agent-stats">{[[Layers3,'등록된 Agent',agents?.length||0],[Eye,'활성화',enabled],[EyeOff,'비활성화',(agents?.length||0)-enabled]].map(([Icon,label,n])=><div key={label}><Icon size={21}/><span>{label}</span><strong>{n}</strong></div>)}</div>
    {error&&<div className="admin-error" role="alert">{error}</div>}{notice&&<div className="admin-success" role="status">{notice}</div>}
    <section className="admin-agent-panel"><div className="admin-panel-heading"><h2>Agent 공개 설정</h2><span>변경 즉시 저장</span></div>
      {!agents?<div className="admin-empty">Agent 목록을 불러오는 중입니다.</div>:!agents.length?<div className="admin-empty">등록된 Agent가 없습니다.</div>:agents.map((a,i)=><div className="admin-agent-row" key={a.id}><span className="admin-agent-order">{String(i+1).padStart(2,'0')}</span><span className="admin-agent-icon" style={{background:a.tint,color:a.color}}><svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={a.d}/></svg></span><div className="admin-agent-copy"><h3>{a.name}</h3><p>{a.sub}</p></div><span className={`admin-agent-state ${a.enabled?'is-on':''}`}><i/>{a.enabled?'플랫폼에 공개 중':'플랫폼에서 숨김'}</span><button type="button" role="switch" aria-checked={a.enabled} aria-label={`${a.name} 활성화`} disabled={!!busy} className="admin-switch" onClick={()=>toggle(a)}><span/></button><a className="admin-service-link" href={a.admin_url} target="_blank" rel="noopener noreferrer" aria-label={`${a.name} 운영 화면 열기`} title="서비스 운영 화면 열기"><ArrowUpRight size={21}/></a></div>)}
      <div className="admin-panel-note">비활성화하면 Agents, Guides, 피드백의 Agent 선택 목록에서 숨겨집니다. 운영 화면 이동 버튼은 비활성 상태에서도 이용할 수 있습니다.</div>
    </section>
  </div>;
}
