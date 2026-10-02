import AccountDialog from './AccountDialogs.jsx';
import { safeDestination } from './loginDestination.js';
import React, { useEffect, useRef, useState } from 'react';
import { Sparkles, ArrowRight, LockKeyhole, Loader2, ShieldCheck } from 'lucide-react';
import { authRequest, postAuth } from './authApi';
import './auth.css';

function Brand() { return <div className="auth-brand"><Sparkles size={31}/><span>AX for Works<small>AI WORKSPACE</small></span></div>; }
function PasswordChange({ user, onChanged, onLogout, notice }) {
  const [values,setValues]=useState({current_password:'',new_password:'',confirm:''});
  const [error,setError]=useState(''); const [busy,setBusy]=useState(false);
  const first=useRef(null);
  useEffect(()=>{first.current?.focus();},[]);
  async function submit(e) {
    e.preventDefault();setError('');
    if(values.new_password!==values.confirm){setError('새 비밀번호가 서로 일치하지 않습니다.');return;}
    setBusy(true);
    try{onChanged(await postAuth('/auth/password',{current_password:values.current_password,new_password:values.new_password}));}
    catch(err){setError(err.message);}finally{setBusy(false);}
  }
  return <div className="auth-page"><div className="auth-required-backdrop"><section className="auth-card password-dialog" role="dialog" aria-modal="true" aria-labelledby="change-title" aria-describedby="change-help">
    <span className="auth-icon"><LockKeyhole size={27}/></span><h1 id="change-title">비밀번호를 변경해 주세요</h1><p id="change-help">{user.full_name}님, 초기 비밀번호로 로그인하셨습니다.<br/>새 비밀번호를 설정하면 서비스를 이용할 수 있습니다.</p>
    <form onSubmit={submit}><fieldset disabled={busy}>
      <label>현재 비밀번호<input ref={first} type="password" autoComplete="current-password" required maxLength={128} value={values.current_password} onChange={e=>setValues({...values,current_password:e.target.value})}/></label>
      <label>새 비밀번호<input type="password" autoComplete="new-password" required minLength={8} maxLength={128} value={values.new_password} onChange={e=>setValues({...values,new_password:e.target.value})}/><small>영문·숫자·특수문자를 포함해 8자 이상 입력하세요.</small></label>
      <label>새 비밀번호 확인<input type="password" autoComplete="new-password" required minLength={8} maxLength={128} value={values.confirm} onChange={e=>setValues({...values,confirm:e.target.value})}/></label>
      {(error||notice)&&<p className="auth-error" role="alert">{error||notice}</p>}
      <button className="button primary auth-submit" type="submit">{busy?<Loader2 size={17} className="spin"/>:<ShieldCheck size={17}/>}비밀번호 변경 후 시작</button>
      <button className="auth-text-button" type="button" onClick={onLogout}>로그아웃</button>
    </fieldset></form>
  </section></div></div>;
}
function Login({onLogin,notice}) {
  const [dialog,setDialog]=useState(null);
  const [employee,setEmployee]=useState('');const [password,setPassword]=useState('');const [error,setError]=useState('');const [busy,setBusy]=useState(false);
  async function submit(e){e.preventDefault();setError('');setBusy(true);try{onLogin(await postAuth('/auth/login',{employee_id:employee.trim(),password}));}catch(err){setError(err.message);}finally{setBusy(false);}}
  return <div className="auth-page"><div className="login-layout"><section className="login-intro"><Brand/><div className="login-message"><span>MAKE WORK FLOW</span><h1>일하는 방식의 변화,<br/>AI와 함께.</h1><p>반복되는 일은 줄이고,<br/>더 중요한 일에 집중하세요.</p></div><small>AX for Works · We can, with AI.</small></section>
    <section className="auth-card login-card"><span className="auth-icon"><LockKeyhole size={26}/></span><h2>로그인</h2><p>사번과 비밀번호로 시작하세요.</p><form onSubmit={submit}><fieldset disabled={busy}>
      <label>사번<input autoComplete="username" autoFocus required maxLength={40} placeholder="사번을 입력하세요" value={employee} onChange={e=>setEmployee(e.target.value)}/></label>
      <label>비밀번호<input type="password" autoComplete="current-password" required maxLength={128} placeholder="비밀번호를 입력하세요" value={password} onChange={e=>setPassword(e.target.value)}/></label>
      {(error||notice)&&<p className="auth-error" role="alert">{error||notice}</p>}
      <button className="button primary auth-submit" type="submit">{busy?<Loader2 size={17} className="spin"/>:<>로그인<ArrowRight size={17}/></>}</button>
    </fieldset></form><div className="login-account-actions"><button type="button" disabled={busy} onClick={()=>setDialog('reset')}>패스워드 초기화</button><span aria-hidden="true"/><button type="button" disabled={busy} onClick={()=>setDialog('register')}>계정 생성</button></div>{dialog&&<AccountDialog mode={dialog} onClose={()=>setDialog(null)} onDone={employee=>{setEmployee(employee);setPassword('');setError('');setDialog(null);}}/>}</section></div></div>;
}
export default function AuthGate({children}) {
  const [user,setUser]=useState(null);const [loading,setLoading]=useState(true);const [notice,setNotice]=useState('');
  useEffect(()=>{
    let active=true;
    async function refresh(){try{const value=await authRequest('/auth/me');if(active){setUser(value);setNotice('');}}catch(err){if(active){if(err.status===401){setUser(null);if(window.location.pathname!=='/login')window.location.replace('/login');}else setNotice(err.message);}}finally{if(active)setLoading(false);}}
    function expired(){window.location.replace('/login');setUser(null);setNotice('로그인이 만료되었습니다. 다시 로그인해 주세요.');}
    refresh();window.addEventListener('ax-session-expired',expired);window.addEventListener('focus',refresh);
    return()=>{active=false;window.removeEventListener('ax-session-expired',expired);window.removeEventListener('focus',refresh);};
  },[]);
  async function logout(){try{await postAuth('/auth/logout');setUser(null);setNotice('');window.location.replace('/login');}catch(err){setNotice(err.message);}}
  useEffect(()=>{
    if(!loading && user && !user.must_change_password && window.location.pathname==='/login'){
      const target=safeDestination(new URLSearchParams(window.location.search).get('next'));
      window.location.replace(target);
    }
  },[loading,user]);
  if(loading)return <div className="auth-page"><Loader2 className="spin" size={32}/><span>로그인 확인 중</span></div>;
  if(!user)return <Login notice={notice} onLogin={value=>{setUser(value);setNotice('');}}/>;
  if(user.must_change_password)return <PasswordChange key={user.user_id} notice={notice} user={user} onChanged={setUser} onLogout={logout}/>;
  return <>{notice&&<div className="auth-global-error" role="alert">{notice}</div>}{children(user,logout)}</>;
}
