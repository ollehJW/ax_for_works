import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import AuthGate from './Auth.jsx';
import AgentPreview from './AgentPreview.jsx';
import AgentIntroduction from './AgentIntroduction.jsx';
import NoticeBoard from './NoticeBoard.jsx';

const STAR = 'm12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z';
const ARROW = 'M4 12h16m-6-6 6 6-6 6';
const CHECK = 'm5 12 4 4L19 6';
function Icon({ d = STAR, size = 20, ...props }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}><path d={d}/></svg>;
}
function Badge({ agent, children }) {
  return <span className="agent-icon" style={{ background: agent.tint, color: agent.color }}>{children || <Icon d={agent.d} size={24}/>}</span>;
}
function InfoDialog({ kind, agents, close, user }) {
  const ref = useRef(null);
  useEffect(() => {
    const trigger = document.activeElement;
    ref.current.showModal();
    return () => trigger?.focus();
  }, []);
  const title = '내 계정';
  return <dialog ref={ref} onCancel={close} onClick={e => { if (e.target === e.currentTarget) close(); }} aria-labelledby="dialog-title">
    <div className="dialog-content"><span className="brand-symbol"><Icon/></span><h2 id="dialog-title">{title}</h2>
      {kind === 'account' && <div className="account-details"><p><strong>{user.full_name}</strong> · {user.employee_id}</p>{user.organization && <p>{user.organization}</p>}<p>{user.team_name} · {user.role_name}</p><p>{user.email}</p><p>{user.is_admin ? '관리자' : '일반 사용자'}</p></div>}
      <button className="primary" onClick={close}>확인</button>
    </div>
  </dialog>;
}
function App({ user, onLogout }) {
  const [route, setRoute] = useState(() => window.location.hash);
  const introductionsPage = route.startsWith('#introductions');
  const noticesPage = route.startsWith('#notices');
  useEffect(() => {
    const update = () => { setRoute(window.location.hash); };
    window.addEventListener('hashchange', update);
    return () => window.removeEventListener('hashchange', update);
  }, []);
  useEffect(() => { if (introductionsPage) window.scrollTo(0, 0); }, [introductionsPage]);
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [current, setCurrent] = useState(0);
  const [playing, setPlaying] = useState(() => !window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [interacting, setInteracting] = useState(false);
  const [visible, setVisible] = useState(!document.hidden);
  const [dialog, setDialog] = useState(null);
  useEffect(() => {
    const update = () => setVisible(!document.hidden);
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    let active = true;
    setLoading(true); setError(false);
    fetch('/api/agents', { signal: controller.signal })
      .then(r => { if (r.status === 401) window.dispatchEvent(new Event('ax-session-expired')); if (!r.ok) throw new Error('API failed'); return r.json(); })
      .then(data => { if (!Array.isArray(data.agents)) throw new Error('Invalid response'); if (active) { setAgents(data.agents); setCurrent(0); } })
      .catch(() => { if (active) setError(true); })
      .finally(() => { clearTimeout(timeout); if (active) setLoading(false); });
    return () => { active = false; clearTimeout(timeout); controller.abort(); };
  }, [attempt]);
  const running = playing && !interacting && !dialog && visible && !introductionsPage && !noticesPage;
  useEffect(() => {
    if (!running || agents.length < 2) return;
    const timer = setTimeout(() => setCurrent(i => (i + 1) % agents.length), 6000);
    return () => clearTimeout(timer);
  }, [running, current, agents.length]);
  const select = i => setCurrent((i + agents.length) % agents.length);
  const a = agents[current];
  function tabKey(e, i) {
    let target;
    if (e.key === 'ArrowRight') target = (i + 1) % agents.length;
    if (e.key === 'ArrowLeft') target = (i - 1 + agents.length) % agents.length;
    if (e.key === 'Home') target = 0;
    if (e.key === 'End') target = agents.length - 1;
    if (target !== undefined) { e.preventDefault(); select(target); document.getElementById(`tab-${agents[target].id}`).focus(); }
  }
  return <>
    <a className="skip-link" href="#main">본문으로 건너뛰기</a>
    <header><div className="header-inner">
      <a className="brand" href="#top" aria-label="AX for Works 홈"><span className="brand-symbol"><Icon size={18}/></span><span>AX <em>for Works</em></span></a>
      <nav aria-label="주요 메뉴"><a className={`navlink ${!introductionsPage && !noticesPage ? 'active' : ''}`} href="#agents" aria-current={!introductionsPage && !noticesPage ? 'page' : undefined}>AI Agents</a><a className={`navlink ${introductionsPage ? 'active' : ''}`} href="#introductions" aria-current={introductionsPage ? 'page' : undefined}>Agent 소개</a><a className={`navlink ${noticesPage ? 'active' : ''}`} href="#notices/notice" aria-current={noticesPage ? 'page' : undefined}>공지사항</a></nav>
      <div className="workspace"><button className="workspace-identity" aria-label="내 계정" onClick={() => setDialog('account')}>
        {user.team_name && user.team_name !== '미지정' && <span className="workspace-team">{user.team_name}</span>}
        <span className="workspace-person"><strong>{user.full_name}</strong>{user.role_name && user.role_name !== '미지정' && <span> {user.role_name}</span>}</span>
      </button><span className="workspace-divider" aria-hidden="true"/><button className="logout-button" onClick={onLogout}><Icon d="M9 5H5v14h4 M14 8l4 4-4 4 M9 12h9" size={16}/>로그아웃</button></div>
    </div></header>
    <main id="main">{noticesPage ? <NoticeBoard user={user} route={route}/> : introductionsPage ? <AgentIntroduction agents={agents} loading={loading} error={error} onRetry={()=>setAttempt(v=>v+1)} selection={route.split('/')[1]}/> : <><div id="top"/>
      <section className="intro"><div><p className="eyebrow"><span/>MAKE WORK FLOW</p><h1>일하는 방식의 변화, <em>AI와 함께.</em></h1></div><p className="intro-caption">반복되는 일은 줄이고, 더 중요한 일에 집중하세요.</p></section>
      {loading ? <div className="state-panel" role="status"><span className="loader"/>AI 파트너를 불러오고 있습니다.</div> : error ? <div className="state-panel" role="alert"><h2>Agent 목록을 불러오지 못했습니다.</h2><p>잠시 후 다시 시도해 주세요.</p><button className="primary" onClick={() => setAttempt(v => v + 1)}>다시 시도</button></div> : !a ? <div className="state-panel"><h2>준비 중인 AI 파트너</h2><p>현재 이용 가능한 Agent가 없습니다.</p></div> : <>
        <section className="hero" aria-roledescription="캐러셀" aria-label="AI Agent 소개" onMouseEnter={() => setInteracting(true)} onMouseLeave={() => setInteracting(false)} onFocusCapture={() => setInteracting(true)} onBlurCapture={e => { if (!e.currentTarget.contains(e.relatedTarget)) setInteracting(false); }}>
          <div className="hero-circle circle-one"/><div className="hero-circle circle-two"/>
          <div className="hero-body" id={`panel-${a.id}`} role="tabpanel" aria-labelledby={`tab-${a.id}`} key={a.id}>
            <div className="hero-copy"><span className="partner"><Icon size={13}/>YOUR AI PARTNER · {String(current + 1).padStart(2, '0')}</span><p className="hero-name">{a.name} <span>· {a.sub}</span></p><h2>{a.title}</h2><p className="hero-detail">{a.detail}</p><div className="hero-actions"><a className="launch" href={a.launch_url}>{a.name} 시작하기 <Icon d={ARROW} size={18}/></a></div></div>
            <AgentPreview agent={a} playing={playing && visible && !dialog}/>
          </div>
          <div className="hero-bottom"><div className="tabs" role="tablist" aria-label="소개할 Agent 선택" style={{ gridTemplateColumns: `repeat(${agents.length}, minmax(150px, 1fr))` }}>
            {agents.map((agent, i) => <button key={agent.id} id={`tab-${agent.id}`} role="tab" aria-selected={i === current} aria-controls={i === current ? `panel-${agent.id}` : undefined} tabIndex={i === current ? 0 : -1} className={`tab ${i === current ? 'selected' : ''}`} onClick={() => select(i)} onKeyDown={e => tabKey(e, i)}>
              {i === current && <span key={`${current}-${running}`} className={`progress ${running ? 'running' : ''}`}/>}<span className="tab-number">{String(i + 1).padStart(2, '0')}</span><span><strong>{agent.name}</strong><small>{agent.sub}</small></span>
            </button>)}
          </div><div className="controls"><button onClick={() => select(current - 1)} aria-label="이전 슬라이드"><Icon d="M20 12H4m6-6-6 6 6 6" size={16}/></button><button onClick={() => setPlaying(v => !v)} aria-label={playing ? '자동 재생 일시 정지' : '자동 재생 시작'}><Icon d={playing ? 'M8 5v14M16 5v14' : 'm8 5 11 7-11 7Z'} size={14}/></button><button onClick={() => select(current + 1)} aria-label="다음 슬라이드"><Icon d={ARROW} size={16}/></button></div></div>
        </section>
        <section id="agents" className="agents"><div className="section-heading"><div><h2>나의 AI 파트너</h2><span className="count">{agents.length}</span></div><p>업무에 필요한 Agent를 선택해 바로 시작하세요.</p></div>
          <div className="cards">{agents.map((agent, i) => <a className="card" href={agent.launch_url} key={agent.id} aria-label={`${agent.name} ${agent.sub} 바로가기`}><div className="card-top"><Badge agent={agent}/><span>{String(i + 1).padStart(2, '0')}</span></div><h3>{agent.name}</h3><p className="card-sub" style={{ color: agent.color }}>{agent.sub} Agent</p><p className="card-description">{agent.desc}</p><div className="card-bottom"><strong>바로 시작하기</strong><span className="go"><Icon d={ARROW} size={15}/></span></div></a>)}</div>
        </section>
      </>}
      <div className="bottom-note"><Icon size={15}/><span>작은 업무의 변화가 만드는 더 큰 가능성. <strong>We can, with AI.</strong></span></div>
      </>}
      <footer><span><b>WIA</b>© {new Date().getFullYear()} Hyundai WIA. All rights reserved.</span><span>AX for Works <span className="footer-tagline">함께 만드는 업무의 다음 단계</span></span></footer>
    </main>
    {dialog && <InfoDialog kind={dialog} agents={agents} user={user} close={() => setDialog(null)}/>}
  </>;
}
createRoot(document.getElementById('root')).render(<React.StrictMode><AuthGate>{(user,onLogout)=><App user={user} onLogout={onLogout}/>}</AuthGate></React.StrictMode>);
