import {useEffect, useRef, useState} from 'react';
import {X, Loader2, Pencil, ShieldCheck} from 'lucide-react';
import {postAuth} from './authApi';
import RegistrationAutocomplete from './RegistrationAutocomplete';
import './editProfile.css';

const fields = [['organization','조직','organizations'],['team_name','팀','teams'],['role_name','직급','roles']];
export default function EditProfileDialog({onClose,onDone}) {
  const dialog=useRef(null);
  const [credentials,setCredentials]=useState({employee_id:'',password:''});
  const [original,setOriginal]=useState(null), [values,setValues]=useState({}), [editing,setEditing]=useState({});
  const [busy,setBusy]=useState(false), [error,setError]=useState(''), [success,setSuccess]=useState('');
  const [options,setOptions]=useState({organizations:[],teams:[],roles:[]});
  useEffect(()=>{const opener=document.activeElement;dialog.current.showModal();return()=>opener?.focus();},[]);
  useEffect(()=>{
    if(!original)return;
    const controller=new AbortController();
    fetch('/api/auth/registration-options',{credentials:'same-origin',signal:controller.signal})
      .then(r=>{if(!r.ok)throw Error();return r.json();}).then(setOptions).catch(()=>{});
    return()=>controller.abort();
  },[original]);
  const changed=original && fields.some(([key])=>values[key]!==original[key]);
  async function submit(event) {
    event.preventDefault();setError('');setBusy(true);
    try {
      if(!original){
        const result=await postAuth('/auth/profile/verify',credentials);setOriginal(result);setValues(result);
      }else{
        const patch=Object.fromEntries(fields.filter(([key])=>values[key]!==original[key]).map(([key])=>[key,values[key]]));
        const result=await postAuth('/auth/profile/update',{...credentials,revision:original.revision,...patch});
        setCredentials(current=>({...current,password:''}));setSuccess(result.message);
      }
    }catch(e){setError(e.message);}finally{setBusy(false);}
  }
  function reset(){setOriginal(null);setValues({});setEditing({});setCredentials(c=>({...c,password:''}));setError('');}
  return <dialog ref={dialog} className="auth-card account-dialog edit-profile-dialog" aria-labelledby="edit-profile-title" onCancel={e=>{e.preventDefault();if(!busy)onClose();}}>
    <div className="account-dialog-heading"><h2 id="edit-profile-title">정보 변경</h2><button className="account-dialog-close" type="button" disabled={busy} onClick={onClose} aria-label="닫기"><X size={21}/></button></div>
    {success?<><div className="account-success" role="status"><ShieldCheck size={23}/><p>{success}</p></div><button type="button" className="button primary auth-submit" onClick={()=>onDone(credentials.employee_id)}>로그인으로 돌아가기</button></>:<>
      <p>{original?'변경할 항목의 연필 아이콘을 눌러 주세요.':'사번과 현재 비밀번호로 본인 확인 후 정보를 변경할 수 있습니다.'}</p>
      <form onSubmit={submit}><fieldset disabled={busy}>
        {!original?<>
          <label>사번<input autoFocus required maxLength={40} autoComplete="username" value={credentials.employee_id} onChange={e=>setCredentials({...credentials,employee_id:e.target.value})}/></label>
          <label>현재 비밀번호<input type="password" required maxLength={128} autoComplete="current-password" value={credentials.password} onChange={e=>setCredentials({...credentials,password:e.target.value})}/></label>
        </>:<>
          <div className="edit-profile-identity"><span>사번 <strong>{credentials.employee_id}</strong></span><button type="button" onClick={reset}>다시 조회</button></div>
          <div className="edit-profile-fields">{fields.map(([key,label,option])=><div className="edit-profile-row" key={key}>
            <div>{editing[key]?<RegistrationAutocomplete name={key} label={label} value={values[key]} onChange={value=>setValues(v=>({...v,[key]:value}))} options={options[option]} loading={false}/>:<label>{label}<input readOnly value={values[key]||'미등록'} aria-label={label}/></label>}</div>
            <button className="edit-profile-toggle" type="button" aria-label={`${label} ${editing[key]?'편집 취소':'편집'}`} title={`${label} ${editing[key]?"변경 취소":"수정"}`} aria-pressed={Boolean(editing[key])} onClick={()=>{if(editing[key])setValues(v=>({...v,[key]:original[key]}));setEditing(v=>({...v,[key]:!v[key]}));}}>{editing[key]?<X size={18} aria-hidden="true"/>:<Pencil size={17} aria-hidden="true"/>}</button>
          </div>)}</div>
          <p className="account-reset-note">저장하면 기존 로그인이 종료됩니다. 다시 로그인하면 변경된 정보가 적용됩니다.</p>
        </>}
        {error&&<p className="auth-error" role="alert">{error}</p>}
        <button className="button primary auth-submit" type="submit" disabled={busy||Boolean(original&&!changed)}>{busy?<Loader2 size={17} className="spin"/>:<ShieldCheck size={17}/>} {busy?'처리 중':original?'저장':'본인 확인'}</button>
      </fieldset></form>
    </>}
  </dialog>;
}
