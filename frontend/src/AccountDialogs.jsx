import { useEffect, useRef, useState } from 'react';
import { X, Loader2, ShieldCheck } from 'lucide-react';
import { postAuth } from './authApi';
import RegistrationAutocomplete from './RegistrationAutocomplete';

export default function AccountDialog({ mode, onClose, onDone }) {
  const register = mode === 'register';
  const title = register ? '계정 생성' : '패스워드 초기화';
  const dialog = useRef(null);
  const [values, setValues] = useState({ employee_id:'', password:'', confirm:'', full_name:'', organization:'', team_name:'', role_name:'', email:'' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [options,setOptions]=useState({organizations:[],teams:[],roles:[]});
  const [optionsLoading,setOptionsLoading]=useState(register);
  useEffect(()=>{
    if(!register)return;
    const controller=new AbortController();
    fetch('/api/auth/registration-options',{signal:controller.signal,credentials:'same-origin'})
      .then(response=>{if(!response.ok)throw new Error('Suggestions unavailable');return response.json();})
      .then(data=>{if(!controller.signal.aborted)setOptions(data);})
      .catch(()=>{})
      .finally(()=>{if(!controller.signal.aborted)setOptionsLoading(false);});
    return()=>controller.abort();
  },[register]);
  useEffect(() => {
    const opener = document.activeElement;
    dialog.current.showModal();
    return () => opener?.focus();
  }, []);
  function update(event) { setValues(current => ({ ...current, [event.target.name]: event.target.value })); }
  async function submit(event) {
    event.preventDefault(); setError('');
    if (register && values.password !== values.confirm) { setError('비밀번호가 서로 일치하지 않습니다.'); return; }
    setBusy(true);
    try {
      const { confirm, ...account } = values;
      const body = register ? account : { employee_id: values.employee_id, full_name: values.full_name };
      const result = await postAuth(register ? '/auth/register' : '/auth/reset-password', body);
      setSuccess(result.message);
      setValues(current => ({...current, password:'', confirm:''}));
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  return <dialog ref={dialog} className={`auth-card account-dialog ${register ? 'registration-dialog' : ''}`} aria-labelledby="account-dialog-title" aria-describedby="account-dialog-help" onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
    <div className="account-dialog-heading"><h2 id="account-dialog-title">{title}</h2><button type="button" className="account-dialog-close" aria-label="닫기" disabled={busy} onClick={onClose}><X size={21}/></button></div>
    <p id="account-dialog-help">{register ? '계정 정보를 입력하고 사용할 비밀번호를 설정해 주세요.' : '계정에 등록된 사번과 이름을 입력해 주세요.'}</p>
    {success ? <><div className="account-success" role="status"><ShieldCheck size={23}/><p>{success}</p></div><button className="button primary auth-submit" type="button" onClick={() => onDone(values.employee_id)}>로그인으로 돌아가기</button></> : <form onSubmit={submit}><fieldset disabled={busy}>
      <div className={register ? 'registration-fields' : ''}>
        <label>사번<input name="employee_id" value={values.employee_id} onChange={update} autoComplete="username" required maxLength={40} pattern="[A-Za-z0-9._\-]+" autoFocus/></label>
        <label>이름<input name="full_name" value={values.full_name} onChange={update} autoComplete="name" required maxLength={80}/></label>
        {register && <>
          <label>패스워드<input name="password" type="password" value={values.password} onChange={update} autoComplete="new-password" required minLength={8} maxLength={128}/></label>
          <label>패스워드 확인<input name="confirm" type="password" value={values.confirm} onChange={update} autoComplete="new-password" required minLength={8} maxLength={128}/></label>
          <p className="registration-hint">영문, 숫자, 특수문자를 포함해 8자 이상 입력하세요. 초기 비밀번호(wia1234!)는 사용할 수 없습니다.</p>
          {[['organization','조직','organizations'],['team_name','팀','teams'],['role_name','직급','roles']].map(([name,label,key])=><RegistrationAutocomplete key={name} name={name} label={label} value={values[name]} onChange={value=>setValues(current=>({...current,[name]:value}))} options={options[key]} loading={optionsLoading}/>)}
          <label>이메일<input name="email" type="email" value={values.email} onChange={update} autoComplete="email" required maxLength={254}/></label>
        </>}
      </div>
      {!register && <p className="account-reset-note">일치하는 계정의 패스워드를 wia1234!로 초기화합니다.<br/>기존 로그인이 해제되며, 다음 로그인 시 비밀번호를 변경해야 합니다.</p>}
      {error && <p className="auth-error" role="alert">{error}</p>}
      <button className="button primary auth-submit" type="submit">{busy && <Loader2 size={17} className="spin"/>}{busy ? '처리 중' : title}</button>
    </fieldset></form>}
  </dialog>;
}
