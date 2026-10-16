import { useState } from 'react';
import { Trophy, UsersRound, Star, MessageSquareHeart, Search, BarChart3, UserRound, CalendarDays, LockKeyhole } from 'lucide-react';
import './admin.css';
import './admin-awards.css';

const categories=[{id:'team',name:'AX Dream Team',label:'팀 부문',Icon:UsersRound},{id:'individual',name:'AX All-Stars',label:'개인 부문',Icon:Star},{id:'feedback',name:'AX Co-Creator',label:'피드백 부문',Icon:MessageSquareHeart}];
const monthNow=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit'}).format(new Date());
export default function AdminAwards(){
  const [category,setCategory]=useState('team');
  const [month,setMonth]=useState(monthNow);
  const [query,setQuery]=useState('');
  const [searched,setSearched]=useState(false);
  const feedback=category==='feedback',team=category==='team';
  const active=categories.find(c=>c.id===category);
  return <div className="admin-page admin-awards">
    <div className="admin-heading"><div><p className="eyebrow"><span/>RECOGNITION & IMPACT</p><h1>Awards 관리</h1><p>활용 현황과 개선 기여를 살펴보고, 이달의 수상자를 직접 선정하세요.</p></div><span className="aa-draft"><Trophy size={16}/>선정 준비 중</span></div>
    <div className="aa-toolbar"><label htmlFor="award-month"><CalendarDays size={17}/>시상 대상 월</label><input id="award-month" type="month" value={month} onChange={e=>setMonth(e.target.value)}/><p>집계 및 선정 저장 기능은 준비 중입니다. 현재 화면에서 실제 수상자가 선정되지는 않습니다.</p></div>
    <div className="aa-tabs" role="tablist" aria-label="시상 부문" onKeyDown={e=>{const keys=['ArrowLeft','ArrowRight','Home','End'];if(!keys.includes(e.key))return;e.preventDefault();const i=categories.findIndex(c=>c.id===category);const next=e.key==='Home'?0:e.key==='End'?2:(i+(e.key==='ArrowRight'?1:2))%3;setCategory(categories[next].id);setQuery('');setSearched(false);document.getElementById(`award-tab-${categories[next].id}`)?.focus();}}>{categories.map(({id,name,label,Icon})=><button key={id} id={`award-tab-${id}`} type="button" role="tab" tabIndex={category===id?0:-1} aria-selected={category===id} aria-controls="award-management-panel" onClick={()=>{setCategory(id);setQuery('');setSearched(false);}}><span className="aa-tab-icon"><Icon size={22}/></span><span><small>{label}</small><strong>{name}</strong></span></button>)}</div>
    <section id="award-management-panel" role="tabpanel" aria-labelledby={`award-tab-${category}`}>
      <div className="aa-section-title"><div><h2>{active.name}</h2><p>{feedback?'더 나은 서비스를 만드는 데 실질적으로 기여한 임직원을 선정합니다.':team?'팀별 활용 순위를 참고해 수상 팀 1팀을 직접 선정합니다.':'개인별 활동 순위를 참고해 Gold · Silver · Bronze 수상자를 직접 선정합니다.'}</p></div><span>{feedback?'개선 기여자 1명':team?'수상 팀 1팀':'수상자 3명'}</span></div>
      <div className="aa-workspace">
        <section className="aa-panel" aria-label={feedback?'임직원 검색':'활용 순위'}>
          <div className="aa-panel-heading"><h3>{feedback?'임직원 검색':team?'팀별 활용 순위':'개인별 활동 순위'}</h3><span>{feedback?'이름 · 사번 · 팀':'집계 전'}</span></div>
          {feedback?<><form className="aa-search" onSubmit={e=>{e.preventDefault();setSearched(true);}}><Search size={18}/><input aria-label="수상 후보 임직원 검색" value={query} maxLength={100} onChange={e=>{setQuery(e.target.value);setSearched(false);}} placeholder="이름, 사번 또는 팀을 입력하세요"/><button type="submit" disabled={!query.trim()}>검색</button></form><div className="aa-empty" role="status"><UserRound size={34} strokeWidth={1.4}/><strong>{searched?'임직원 검색 연동을 준비하고 있습니다':'개선에 기여한 동료를 찾아보세요'}</strong><p>{searched?'검색 결과 및 후보 선택은 기능 연동 후 이용할 수 있습니다.':'피드백 수나 순위가 아닌, 실제 개선에 도움을 준 기여를 기준으로 선정합니다.'}</p></div></>:<><div className="aa-ranking-head"><span>순위</span><span>{team?'조직 / 팀':'임직원 / 소속'}</span><span>{team?'활용량':'활동량'}</span><span>선택</span></div><div className="aa-empty"><BarChart3 size={36} strokeWidth={1.4}/><strong>아직 집계된 순위가 없습니다</strong><p>활동량 산정 기준이 정해지면 순위가 표시됩니다.<br/>목록에서 후보를 선택해 수상 대상에 추가할 수 있습니다.</p></div><div className="aa-panel-bottom">순위는 선정 참고 자료이며, 최종 수상 대상은 관리자가 결정합니다.</div></>}
        </section>
        <section className="aa-panel aa-selection" aria-label="수상 대상 선택"><div className="aa-panel-heading"><h3>수상 대상</h3><span>0 / {team||feedback?'1':'3'}</span></div>
          <div className="aa-selection-slots">{(team?['Dream Team']:feedback?['Co-Creator']:['Gold','Silver','Bronze']).map((label,i)=><div className={`aa-selection-slot aa-slot-${i}`} key={label}><span className="aa-slot-label">{label}</span><div><span className="aa-slot-avatar">{team?<UsersRound size={20}/>:<UserRound size={20}/>}</span><span><strong>{team?'선정된 팀이 없습니다':'선정된 임직원이 없습니다'}</strong><small>{feedback?'검색 결과에서 후보 선택':'순위 목록에서 후보 선택'}</small></span></div></div>)}</div>
          <div className="aa-selection-footer"><p>선정 기능 연동 후 저장할 수 있습니다.</p><button type="button" disabled><LockKeyhole size={15}/>선정 내용 저장</button></div>
        </section>
      </div>
    </section>
  </div>;
}
