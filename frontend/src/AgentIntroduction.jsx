import { useRef } from 'react';
import { Layers3, CodeXml, AudioLines, ChartNoAxesCombined, Presentation, FileText, Download, ArrowUpRight, Sparkles } from 'lucide-react';
import './agent-introduction.css';

// Add a service here to enable its introduction tab. Tab labels/order follow /api/agents.
const introductions = {
  wiameet: {
    eyebrow: 'MEETING INTELLIGENCE', title: '대화에 집중하는 회의,\n기록을 완성하는 AI,',
    description: '회의의 흐름은 놓치지 않고, 기록의 부담은 가볍게.\n녹음 속 대화를 분석하고 화자를 확인해\n우리 회의에 맞는 회의록을 완성합니다.',
    film: '/wiameet/media/Wiameet_intro.mp4',
    caption: '회의를 기록하는 시간은 줄이고, 대화와 결정에 집중하세요.',
    guideDescription: '참석자 그룹 설정부터 녹음·화자 검토·회의록 확정, Confluence 공유까지.', guideUrl: '/wiameet/media/WIAMeet_Guide.pdf', guideFormat: 'PDF', guidePages: 20,
    guideFilename: 'WIAMeet_Guide.pdf', tags: ['회의 녹음·업로드', '화자 매핑 검토', '회의록 확정·공유'],
  },
  wianews: {
    eyebrow: 'TECH INTELLIGENCE', title: '기술의 흐름을 읽는\n나만의 뉴스레터,',
    description: '관심 있는 기술은 깊게, 읽어야 할 소식은 간결하게.\n신뢰할 수 있는 출처에서 찾은 기술 뉴스를\nAI가 정리하고, 원하는 주기로 전해드립니다.',
    film: '/wianews/media/WiaNews_intro.mp4',
    caption: '뉴스를 찾는 시간은 줄이고, 새로운 아이디어에 집중하세요.',
    guideDescription: '주제·도메인 설정부터 뉴스 선정, 보관함·메일 발송·정기 구독까지.', guideUrl: '/wianews/media/WIANews_Guide.pdf', guideFormat: 'PDF', guidePages: 13,
    guideFilename: 'WIANews_Guide.pdf', tags: ['기술 뉴스 선별', 'AI 요약', '정기 이메일 구독'],
  },
  wiacoding: {
    eyebrow: 'YOUR FIRST CODING PROMPT', title: '업무의 아이디어를\n첫 개발 프롬프트로,',
    description: '만들고 싶은 것이 있다면, 대화부터 시작하세요.\nAI와 함께 해결할 과제를 정리하고\n나에게 맞는 첫 개발 프롬프트를 완성합니다.',
    film: '/wiacoding/media/WiaCoding_intro.mp4',
    caption: '막연한 아이디어를 정리하고, 만드는 일에 한 걸음 가까이.',
    guideDescription: '과제 정의와 맞춤 설문부터 프롬프트 수정·공유·보관까지.', guideUrl: '/wiacoding/media/WIACoding_Guide.pdf', guideFormat: 'PDF', guidePages: 10,
    guideFilename: 'WIACoding_Guide.pdf', tags: ['대화로 과제 정의', '맞춤 질문', '개발 프롬프트 완성'],
  },
};
const icons = { wiameet: AudioLines, wiareport: ChartNoAxesCombined, wianews: Layers3, wiacoding: CodeXml };
export default function AgentIntroduction({ agents, loading, error, onRetry, selection }) {
  const tabs = useRef(null);
  const available = agents.filter(a => introductions[a.id]);
  const selected = available.find(a => a.id === selection) || available[0];
  function select(id) { window.location.hash = `introductions/${id}`; }
  function navigate(event, id) {
    const index = available.findIndex(a => a.id === id);
    const next = { ArrowRight: (index + 1) % available.length, ArrowLeft: (index - 1 + available.length) % available.length, Home: 0, End: available.length - 1 }[event.key];
    if (next === undefined) return;
    event.preventDefault(); select(available[next].id);
    const tab = tabs.current.querySelector(`#intro-tab-${available[next].id}`);
    tab?.focus(); tab?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  const content = selected && introductions[selected.id];
  const guideFormat = content?.guideFormat || 'PPT';
  const GuideIcon = guideFormat === 'PDF' ? FileText : Presentation;
  return <div className="agent-introductions">
    <div className="ai-page-heading"><p className="eyebrow"><span/>MEET YOUR AGENTS</p><h1>Agent 소개</h1><p>어떤 일을 도와주는지, 어떻게 시작하는지 알아보세요.</p></div>
    {loading ? <div className="state-panel" role="status">Agent 소개를 불러오고 있습니다.</div> : error ? <div className="state-panel" role="alert"><p>Agent 목록을 불러오지 못했습니다.</p><button className="primary" onClick={onRetry}>다시 시도</button></div> : <>
      <div className="ai-tabs" role="tablist" aria-label="소개할 Agent 선택" ref={tabs}>{agents.map(a => {
        const Icon = icons[a.id] || Sparkles; const enabled = Boolean(introductions[a.id]); const active = a.id === selected?.id;
        return <button key={a.id} id={`intro-tab-${a.id}`} role="tab" aria-selected={active} aria-controls={enabled ? `intro-panel-${a.id}` : undefined} disabled={!enabled} tabIndex={active ? 0 : -1} onClick={()=>select(a.id)} onKeyDown={e=>navigate(e,a.id)} style={{'--ai-color':a.color,'--ai-tint':a.tint}}><span className="ai-tab-icon"><Icon size={23}/></span><span className="ai-tab-copy"><strong>{a.name}</strong><small>{a.sub}</small></span><span className="ai-tab-state">{enabled ? (active ? '선택됨' : '소개 보기') : '준비 중'}</span></button>;
      })}</div>
      {selected ? <section className="ai-service" key={selected.id} id={`intro-panel-${selected.id}`} role="tabpanel" aria-labelledby={`intro-tab-${selected.id}`} tabIndex={0} style={{'--ai-color':selected.color,'--ai-tint':selected.tint}}>
        <div className="ai-service-top"><span><i/>{selected.name}</span><small>AGENT OVERVIEW</small></div>
        <div className="ai-overview"><div className="ai-overview-copy"><span className="ai-kicker">{content.eyebrow}</span><h2>{content.title}<br/><em>{selected.name}.</em></h2><p>{content.description}</p><div className="ai-tags">{content.tags.map(tag=><span key={tag}>{tag}</span>)}</div></div>
          <div className="ai-film"><div className="ai-film-heading"><span>SERVICE FILM</span><small>{selected.name} 이야기</small></div><video key={content.film} controls preload="metadata" aria-label={`${selected.name} 서비스 소개 영상`}><source src={content.film} type="video/mp4"/>이 브라우저는 영상 재생을 지원하지 않습니다.</video><p>{content.caption}</p></div>
        </div>
        <section className="ai-guide" aria-labelledby={`guide-${selected.id}`}><div className="ai-guide-icon"><GuideIcon size={31}/><span>{guideFormat} GUIDE</span></div><div className="ai-guide-copy"><span className="ai-kicker">QUICK START GUIDE</span><h3 id={`guide-${selected.id}`}>처음이라면, 가이드와 함께.</h3><p>{content.guideDescription}<br/>{content.guideUrl ? `${content.guidePages ? content.guidePages + '페이지 ' : ''}${guideFormat} 가이드로 단계별 사용 방법을 확인하세요.` : '단계별 사용 방법을 담은 가이드를 준비하고 있습니다.'}</p></div><div className="ai-guide-action">{content.guideUrl ? <a href={content.guideUrl} download={content.guideFilename}><Download size={16}/>{guideFormat} 가이드 다운로드<ArrowUpRight size={16}/></a> : <><button disabled><Download size={16}/>{guideFormat} 가이드 준비 중</button><small>등록 후 다운로드할 수 있습니다.</small></>}</div></section>
      </section> : <div className="state-panel">서비스 소개를 준비하고 있습니다.</div>}
    </>}
  </div>;
}
