import {useEffect,useRef,useState} from 'react';
import {X,Loader2,UserRound,CheckCircle2,Info} from 'lucide-react';
import RegistrationAutocomplete from './RegistrationAutocomplete';
import {authRequest,postAuth} from './authApi';
import {PROFILE_FIELDS,missingProfileFields} from './profileFields';
import './profileDialog.css';

export default function ProfileDialog({user,onClose,onUpdated,returnToService=false}) {
  const dialog=useRef(null);
  const [values,setValues]=useState(()=>Object.fromEntries(PROFILE_FIELDS.map(({key})=>[key,['','미지정'].includes(String(user[key]??'').trim())?'':user[key]])));
  const [options,setOptions]=useState({organizations:[],teams:[],roles:[]});const [optionsError,setOptionsError]=useState('');
  const [loading,setLoading]=useState(true);const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [saved,setSaved]=useState(false);
  const missing=missingProfileFields(user);const missingKeys=new Set(missing.map(f=>f.key));
  useEffect(()=>{const node=dialog.current;const previous=document.activeElement;if(!node.open)node.showModal();const timer=requestAnimationFrame(()=>node.querySelector('input:not([readonly])')?.focus());return()=>{cancelAnimationFrame(timer);node.close();if(previous?.isConnected)previous.focus();};},[]);
  useEffect(()=>{const controller=new AbortController();authRequest('/auth/registration-options',{signal:controller.signal}).then(data=>{if(!controller.signal.aborted)setOptions(data);}).catch(e=>{if(!controller.signal.aborted)setOptionsError('추천 목록을 불러오지 못했습니다. 정보를 직접 입력할 수 있습니다.');}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});return()=>controller.abort();},[]);
  async function submit(event) {
    event.preventDefault();setError('');setBusy(true);
    try {const result=await postAuth('/auth/profile/complete',Object.fromEntries(missing.map(({key})=>[key,values[key].trim()])));onUpdated(result);setSaved(true);}
    catch(e){setError(e.message);}finally{setBusy(false);}
  }
  return <dialog ref={dialog} className="auth-card profile-dialog" aria-labelledby="profile-title" aria-describedby="profile-help" onCancel={e=>{e.preventDefault();if(!busy)onClose();}}>
    <div className="profile-heading"><span className="profile-symbol"><UserRound size={24}/></span><button type="button" className="profile-close" aria-label="닫기" onClick={onClose} disabled={busy}><X size={20}/></button></div>
    <p className="profile-eyebrow">AX FOR WORKS · MY ACCOUNT</p>
    <h2 id="profile-title">{saved?'계정 정보가 저장되었습니다':missing.length?'계정 정보를 완성해 주세요':'내 계정'}</h2>
    <p id="profile-help">{saved?'입력한 정보가 통합 계정에 반영되었습니다.':missing.length?'서비스 이용에 필요한 누락된 정보를 입력해 주세요.':'AX for Works에 등록된 계정 정보입니다.'}</p>
    {saved?<div className="profile-saved" role="status"><CheckCircle2 size={38}/><strong>계정 정보 입력 완료</strong><p>연결된 서비스에서 같은 정보를 사용합니다.</p><button type="button" className="profile-primary" onClick={onClose}>{returnToService?'서비스로 돌아가기':'확인'}</button></div>:<form onSubmit={submit}><fieldset disabled={busy}>
      <div className="profile-grid">
        <label>사번<input value={user.employee_id} readOnly autoComplete="username"/></label>
        {PROFILE_FIELDS.map(field=>missingKeys.has(field.key)&&field.options?<RegistrationAutocomplete key={field.key} label={field.label} name={field.key} value={values[field.key]||''} onChange={value=>setValues(v=>({...v,[field.key]:value}))} options={options[field.options].filter(v=>v.trim()!=='미지정')} loading={loading}/>:<label key={field.key}>{field.label}{missingKeys.has(field.key)&&<span className="profile-needed">입력 필요</span>}<input aria-label={field.label} type={field.key==='email'?'email':'text'} value={values[field.key]||''} onChange={e=>setValues(v=>({...v,[field.key]:e.target.value}))} readOnly={!missingKeys.has(field.key)} required={missingKeys.has(field.key)} maxLength={field.key==='email'?254:80} autoComplete={field.key==='email'?'email':field.key==='full_name'?'name':'off'}/></label>)}
      </div>
      {optionsError&&<p className="profile-note" role="status">{optionsError}</p>}
      {missing.length>0&&<p className="profile-note"><Info size={15}/>조직·팀·직급은 추천 항목을 선택하거나 직접 입력할 수 있습니다. 등록된 정보는 확인만 가능합니다.</p>}
      {error&&<p className="auth-error" role="alert">{error}</p>}
      <div className="profile-actions">{missing.length>0?<><button type="button" className="profile-secondary" onClick={onClose} disabled={busy}>나중에 입력</button><button className="profile-primary" type="submit" disabled={busy}>{busy?<><Loader2 size={16} className="spin"/>저장 중</>:'정보 저장'}</button></>:<button type="button" className="profile-primary" onClick={onClose}>확인</button>}</div>
    </fieldset></form>}
  </dialog>;
}
