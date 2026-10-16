import { Trophy, UsersRound, Star, MessageSquareHeart, Sparkles, Medal, CalendarDays } from 'lucide-react';
import './awards.css';

const medals = [
  { name: 'Gold', rank: '01', tone: 'gold' },
  { name: 'Silver', rank: '02', tone: 'silver' },
  { name: 'Bronze', rank: '03', tone: 'bronze' },
];

export default function Awards() {
  return <div className="awards-page">
    <section className="awards-hero" aria-labelledby="awards-title">
      <div className="awards-hero-copy">
        <p className="awards-eyebrow"><Sparkles size={14} aria-hidden="true"/> MONTHLY AWARDS</p>
        <h1 id="awards-title">함께 만드는 변화,<br/><em>그 주인공을 만나는 시간.</em></h1>
        <p className="awards-hero-description">꾸준한 활용부터 함께 나누는 의견까지.<br/>매월 AX for Works와 새로운 업무 방식을 만들어가는 팀과 동료를 소개합니다.</p>
        <span className="awards-opening"><CalendarDays size={14} aria-hidden="true"/> 서비스 오픈 후 첫 집계가 시작됩니다</span>
      </div>
      <div className="awards-emblem" aria-hidden="true"><span className="awards-orbit orbit-one"/><span className="awards-orbit orbit-two"/><span className="awards-emblem-star star-one">✦</span><span className="awards-emblem-star star-two">✦</span><div className="awards-trophy"><Trophy size={68} strokeWidth={1.2}/></div><span className="awards-emblem-caption">EVERYDAY WORK. EXTRAORDINARY CHANGE.</span></div>
    </section>

    <div className="awards-section-heading"><div><p>RECOGNIZING YOUR IMPACT</p><h2>이달의 Awards</h2></div><span className="awards-pending"><i/>첫 시상 준비 중</span></div>

    <div className="awards-feature-grid">
      <section className="awards-category awards-team" aria-labelledby="awards-team-title">
        <div className="awards-category-top"><span className="awards-category-icon"><UsersRound size={23} aria-hidden="true"/></span><span className="awards-category-count">TEAM · 1팀</span></div>
        <p className="awards-category-kicker">함께할수록 커지는 변화</p><h3 id="awards-team-title">AX Dream Team</h3>
        <p className="awards-category-description">한 달 동안 Agent를 가장 많이 활용한 팀에게.</p>
        <div className="awards-waiting"><span className="awards-waiting-icon"><UsersRound size={25} strokeWidth={1.5} aria-hidden="true"/></span><div><strong>첫 번째 Dream Team을 기다립니다</strong><p>서비스 오픈 후 팀별 활용량 집계가 시작됩니다.</p></div></div>
        <div className="awards-category-foot"><span>선정 기준</span><strong>팀 전체 Agent 활용량 1위</strong></div>
      </section>
      <section className="awards-category awards-creator" aria-labelledby="awards-creator-title">
        <div className="awards-category-top"><span className="awards-category-icon"><MessageSquareHeart size={23} aria-hidden="true"/></span><span className="awards-category-count">FEEDBACK · 1명</span></div>
        <p className="awards-category-kicker">좋은 의견이 만드는 더 나은 내일</p><h3 id="awards-creator-title">AX Co-Creator</h3>
        <p className="awards-category-description">한 달 동안 가장 많은 피드백을 나눠준 동료에게.</p>
        <div className="awards-waiting"><span className="awards-waiting-icon"><MessageSquareHeart size={25} strokeWidth={1.5} aria-hidden="true"/></span><div><strong>첫 번째 Co-Creator를 기다립니다</strong><p>서비스 오픈 후 피드백 활동 집계가 시작됩니다.</p></div></div>
        <div className="awards-category-foot"><span>선정 기준</span><strong>피드백 작성 건수 1위</strong></div>
      </section>
    </div>

    <section className="awards-category awards-allstars" aria-labelledby="awards-allstars-title">
      <div className="awards-allstars-heading"><div className="awards-allstars-heading-copy"><span className="awards-category-icon"><Star size={23} aria-hidden="true"/></span><div><p className="awards-category-kicker">일상 속 활용이 빛나는 순간</p><h3 id="awards-allstars-title">AX All-Stars</h3></div></div><span className="awards-category-count">INDIVIDUAL · 3명</span></div>
      <p className="awards-category-description">한 달 동안 가장 활발하게 Agent를 활용한 세 명의 동료에게.</p>
      <div className="awards-medals">{medals.map(m=><article className={`awards-medal awards-medal-${m.tone}`} key={m.name} aria-label={`개인 활동량 ${Number(m.rank)}위 ${m.name}`}><div className="awards-medal-top"><span><Medal size={20} aria-hidden="true"/>{m.name}</span><span className="awards-medal-rank">{m.rank}</span></div><div className="awards-medal-placeholder"><Star size={24} strokeWidth={1.3} aria-hidden="true"/></div><h4>아직 집계 전입니다</h4><p>오픈 후 여러분의 활동이<br/>이 자리를 채워갑니다.</p></article>)}</div>
      <div className="awards-category-foot"><span>선정 기준</span><strong>개인별 Agent 활동량 1–3위</strong><span className="awards-allstars-note">Gold · Silver · Bronze</span></div>
    </section>
  </div>;
}
