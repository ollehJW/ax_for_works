import { AudioLines, Check, FileText, ArrowDown, Mail, Search, MessageSquare, Sparkles, Copy, CalendarDays } from 'lucide-react';
import './agent-preview.css';

function Result({ icon: Icon = FileText, title, children }) {
  return <div className="demo-result demo-reveal"><div className="demo-result-title"><Icon size={16}/><strong>{title}</strong><Check size={15}/></div>{children}</div>;
}
function Meet() {
  return <><div className="demo-heading"><span>MEETING NOTES</span><h3>대화가 기록이 되는 순간</h3></div>
    <div className="demo-audio demo-reveal"><AudioLines size={20}/><div><strong>프로젝트 정기 회의.m4a</strong><small>녹음 파일 분석</small></div><div className="demo-wave" aria-hidden="true">{[12,24,16,32,22,14,28,36,18,26,12,22].map((h,i)=><i key={i} style={{height:h,animationDelay:`${i*.09}s`}}/>)}</div></div>
    <div className="demo-transcript demo-reveal"><div><span>화자 1</span><p>시범 적용 범위를 먼저 정하겠습니다.</p></div><div><span>화자 2</span><p>다음 회의까지 검토안을 준비하겠습니다.</p></div><small><Check size={12}/>화자 매칭 확인·수정</small></div>
    <div className="demo-connector"><ArrowDown size={15}/><span>작성 관점을 반영해 생성</span></div>
    <Result title="프로젝트 정기 회의록"><p><b>논의 사항</b> 시범 적용 범위 검토</p><p><b>후속 업무</b> 다음 회의 전 검토안 준비</p></Result></>;
}
function Report() {
  return <><div className="demo-heading"><span>WEEKLY REPORT</span><h3>이번 주의 기록, 다음 주의 계획</h3></div>
    <div className="demo-period"><CalendarDays size={15}/><strong>이번 보고 주간</strong><span>개인별 작성</span></div>
    <div className="demo-report-grid demo-reveal"><div className="demo-project"><small>참여 과제</small><strong>업무 자동화</strong><span>선택한 과제</span></div><div className="demo-report-fields"><p><span className="demo-dot done"/><b>진행 실적</b><small>현행 업무 분석 완료</small></p><p><span className="demo-dot risk"/><b>리스크 / 이슈</b><small>연계 데이터 확인 필요</small></p><p><span className="demo-dot plan"/><b>차주 계획</b><small>시범 적용 범위 정의</small></p></div></div>
    <div className="demo-connector"><ArrowDown size={15}/><span>작성 완료 후 보고 주간 마감</span></div>
    <Result title="주간 보고 라운지"><p>완료된 보고 주간의 멤버별 리포트 열람</p><div className="demo-document-lines" aria-hidden="true"><i/><i/><i/></div></Result></>;
}
function News() {
  return <><div className="demo-heading"><span>TECH NEWSLETTER</span><h3>관심 기술을 한 통의 뉴스레터로</h3></div>
    <div className="demo-search"><Search size={16}/><strong>제조 현장의 AI 활용</strong><span>관심 주제</span></div>
    <div className="demo-articles demo-reveal"><div><span>01</span><div><strong>제조 AI 기술 동향</strong><small>관련성·기술적 중요도 평가</small></div><Check size={15}/></div><div><span>02</span><div><strong>비전 검사 적용 사례</strong><small>핵심 내용 요약 · 원문 출처 확인</small></div><Check size={15}/></div></div>
    <div className="demo-connector"><ArrowDown size={15}/><span>샘플 확인 후 구독 설정</span></div>
    <Result icon={Mail} title="나의 기술 뉴스레터"><div className="demo-mail-settings"><span>주간 발행</span><span>수신 멤버 설정</span></div><p>설정한 주기로 이메일에서 받아보세요.</p></Result></>;
}
function Coding() {
  return <><div className="demo-heading"><span>FIRST DEVELOPMENT PROMPT</span><h3>아이디어를 개발의 시작 문장으로</h3></div>
    <div className="demo-conversation demo-reveal"><div><MessageSquare size={16}/><p>팀의 반복 업무를 줄이고 싶어요.</p></div><div><Sparkles size={16}/><p>누가 사용하고, 어떤 기능이 필요한가요?</p></div></div>
    <div className="demo-answer-tags demo-reveal"><span>사용자 · 팀원</span><span>기능 · 요청 등록</span><span>조건 · 상태 조회</span></div>
    <div className="demo-connector"><ArrowDown size={15}/><span>과제 정의와 맞춤 질문 답변으로 생성</span></div>
    <div className="demo-prompt demo-reveal"><div><FileText size={15}/><strong>초기 개발 프롬프트.md</strong><span><Copy size={13}/>복사</span></div><p><b># 개발 목표</b><br/>팀 업무 요청을 등록하고 진행 상태를<br/>조회하는 웹 도구를 만들어 주세요.</p><small>완성한 프롬프트를 바이브코딩 도구에 붙여넣기</small></div></>;
}
const previews = { wiameet: Meet, wiareport: Report, wianews: News, wiacoding: Coding };
export default function AgentPreview({ agent: a, playing }) {
  const Content = previews[a.id];
  return <div className={`preview service-preview ${playing ? '' : 'demo-paused'}`} style={{'--demo-color':a.color,'--demo-tint':a.tint}}>
    <div className="preview-window" role="group" aria-label={`${a.name} 예시 화면`}>
      <div className="window-bar"><i/><i/><i/><span>{a.name}</span><small>사용 흐름 예시</small></div>
      <div className="service-demo">{Content ? <Content/> : <><div className="demo-heading"><h3>{a.preview}</h3><p>{a.meta}</p></div><Result title={a.row1}><p>{a.text1}</p></Result><Result title={a.row2}><p>{a.text2}</p></Result></>}</div>
    </div><div className="demo-caption"><Check size={14}/>{a.note}</div>
  </div>;
}
