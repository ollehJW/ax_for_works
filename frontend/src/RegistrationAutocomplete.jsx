import { useEffect, useId, useState } from 'react';
import { Building2, Check } from 'lucide-react';

export default function RegistrationAutocomplete({ label, name, value, onChange, options, loading }) {
  const id=useId();
  const [open,setOpen]=useState(false), [active,setActive]=useState(-1);
  const prefix=value.trim();
  const matches=[...new Set(options)].filter(option=>option.toLocaleLowerCase().startsWith(prefix.toLocaleLowerCase())).sort((a,b)=>a.localeCompare(b,'ko'));
  const visible=open && Boolean(prefix) && (loading || options.length>0);
  useEffect(()=>{if(visible && active>=0)document.getElementById(`${id}-${active}`)?.scrollIntoView({block:'nearest'});},[active,visible,id]);
  function choose(option){onChange(option);setOpen(false);setActive(-1);}
  function keyDown(event){
    if(event.nativeEvent.isComposing || event.keyCode===229){if(event.key==='Enter')event.preventDefault();return;}
    if(event.key==='Escape' && visible){event.preventDefault();event.stopPropagation();setOpen(false);setActive(-1);return;}
    if((event.key==='ArrowDown' || event.key==='ArrowUp') && prefix && matches.length){
      event.preventDefault();setOpen(true);setActive(index=>Math.max(0,Math.min(matches.length-1,index+(event.key==='ArrowDown'?1:-1))));
    }else if(event.key==='Enter' && visible){event.preventDefault();if(active>=0 && matches[active])choose(matches[active]);else setOpen(false);}
    else if(event.key==='Tab')setOpen(false);
  }
  return <div className="registration-suggestion-field">
    <label htmlFor={id}>{label}</label>
    <div className={`registration-autocomplete ${visible?'is-open':''}`}>
      <input id={id} name={name} role="combobox" aria-autocomplete="list" aria-expanded={visible} aria-controls={visible?`${id}-list`:undefined} aria-activedescendant={visible&&active>=0&&matches[active]?`${id}-${active}`:undefined} value={value} onChange={event=>{onChange(event.target.value);setActive(-1);setOpen(true);}} onFocus={()=>setOpen(true)} onBlur={()=>{setOpen(false);setActive(-1);}} onKeyDown={keyDown} autoComplete="off" required maxLength={80}/>
      {visible && <div className="registration-suggestions">
        <div className="registration-suggestion-heading">추천 {label}<span>{loading?'…':matches.length}</span></div>
        <div id={`${id}-list`} role="listbox" aria-label={`${label} 추천`} aria-busy={loading} className="registration-options">
          {matches.map((option,index)=><div key={option} id={`${id}-${index}`} role="option" aria-selected={value===option} className={`registration-option ${active===index?'is-active':''}`} onPointerMove={()=>setActive(index)} onMouseDown={event=>event.preventDefault()} onClick={()=>choose(option)}><Building2 size={16} aria-hidden="true"/><span><strong>{option.slice(0,prefix.length)}</strong>{option.slice(prefix.length)}</span>{value===option&&<Check size={15} aria-hidden="true"/>}</div>)}
        </div>
        {loading?<p className="registration-no-results" role="status">추천 목록을 불러오는 중입니다.</p>:!matches.length&&<p className="registration-no-results" role="status">일치하는 항목이 없습니다. 입력한 값을 사용할 수 있습니다.</p>}
      </div>}
    </div>
  </div>;
}
