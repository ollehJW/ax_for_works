import React,{useLayoutEffect,useRef} from 'react';
import {createPortal} from 'react-dom';
import {Mail,X} from 'lucide-react';
import MailReader from './MailReader';
import './mail-popup.css';

export default function MailPopup({message,api,onClose,onInvalid}){
 const ref=useRef(null);
 useLayoutEffect(()=>{
  const dialog=ref.current;
  const previous=document.activeElement;
  dialog.showModal();
  return ()=>{dialog.close();if(previous?.isConnected)previous.focus();};
 },[]);
 return createPortal(<dialog ref={ref} className="mail-source-popup" aria-labelledby="mail-source-popup-title" onCancel={event=>{event.preventDefault();onClose();}}>
  <header className="mail-popup-header"><span className="mail-popup-icon"><Mail size={21}/></span><div><small>출처 메일</small><h2 id="mail-source-popup-title">메일 원문 보기</h2></div><button type="button" className="mail-popup-close" onClick={onClose} aria-label="메일 팝업 닫기"><X size={22}/></button></header>
  <div className="mail-popup-content"><MailReader key={message.id} message={message} api={api} onBack={onClose} backLabel="출처로 돌아가기" onInvalid={onInvalid}/></div>
 </dialog>,document.body);
}
