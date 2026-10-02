import { useEffect } from 'react';
import { EditorContent, useEditor, useEditorState } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { TextStyle, Color, BackgroundColor } from '@tiptap/extension-text-style';
import DOMPurify from 'dompurify';
import { Bold, Italic, Underline, Strikethrough, List, ListOrdered, Undo2, Redo2, RemoveFormatting, Quote } from 'lucide-react';
import './rich-text.css';

export function safeHTML(html) {
  return DOMPurify.sanitize(html, {ALLOWED_TAGS:['p','br','strong','b','em','i','u','s','span','h2','h3','ul','ol','li','blockquote','hr','a'],ALLOWED_ATTR:['style','href','title','start','rel'],ALLOW_DATA_ATTR:false});
}
function initialHTML(value,format) {
  if(format==='html')return safeHTML(value);
  return value.split('\n').map(line=>`<p>${line.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;')||'<br>'}</p>`).join('');
}
export function hasContent(value,format) {
  if(format!=='html')return Boolean(value.trim());
  const doc=new DOMParser().parseFromString(safeHTML(value),'text/html');
  return Boolean(doc.body.textContent.replace(/[\s\u200b\u200c\u200d\ufeff]/g,''));
}
export default function RichTextEditor({value,format,onChange,disabled}) {
  const editor=useEditor({extensions:[StarterKit.configure({heading:{levels:[2,3]},code:false,codeBlock:false,link:{openOnClick:false}}),TextStyle,Color,BackgroundColor],content:initialHTML(value,format),editable:!disabled,
    editorProps:{attributes:{class:'board-rich rich-editor-input',role:'textbox','aria-label':'내용','aria-multiline':'true'},transformPastedHTML:html=>safeHTML(html)},
    onUpdate:({editor})=>onChange(editor.getHTML()),
  });
  const state=useEditorState({editor,selector:({editor:e})=>e?{bold:e.isActive('bold'),italic:e.isActive('italic'),underline:e.isActive('underline'),strike:e.isActive('strike'),bulletList:e.isActive('bulletList'),orderedList:e.isActive('orderedList'),blockquote:e.isActive('blockquote'),heading:e.isActive('heading',{level:2})?'2':e.isActive('heading',{level:3})?'3':'p'}:{}});
  useEffect(()=>{editor?.setEditable(!disabled);},[editor,disabled]);
  if(!editor)return null;
  const actions=[['굵게',Bold,'bold','toggleBold'],['기울임',Italic,'italic','toggleItalic'],['밑줄',Underline,'underline','toggleUnderline'],['취소선',Strikethrough,'strike','toggleStrike'],['글머리 기호',List,'bulletList','toggleBulletList'],['번호 목록',ListOrdered,'orderedList','toggleOrderedList'],['인용',Quote,'blockquote','toggleBlockquote']];
  return <div className="rich-editor"><div className="rich-toolbar" role="group" aria-label="본문 서식 도구">
    <select aria-label="문단 스타일" disabled={disabled} value={state.heading||'p'} onChange={e=>{const chain=editor.chain().focus();(e.target.value==='p'?chain.setParagraph():chain.setHeading({level:Number(e.target.value)})).run();}}><option value="p">본문</option><option value="2">큰 제목</option><option value="3">작은 제목</option></select>
    {actions.map(([label,Icon,key,command])=><button type="button" key={key} title={label} aria-label={label} aria-pressed={Boolean(state[key])} disabled={disabled} onMouseDown={e=>e.preventDefault()} onClick={()=>editor.chain().focus()[command]().run()}><Icon size={17}/></button>)}
    <label className="rich-color" title="글자색">글자색<input type="color" aria-label="글자색" defaultValue="#263e5b" disabled={disabled} onChange={e=>editor.chain().focus().setColor(e.target.value).run()}/></label>
    <label className="rich-color" title="배경색">배경색<input type="color" aria-label="배경색" defaultValue="#fff3a3" disabled={disabled} onChange={e=>editor.chain().focus().setBackgroundColor(e.target.value).run()}/></label>
    <button type="button" aria-label="서식 지우기" title="서식 지우기" disabled={disabled} onMouseDown={e=>e.preventDefault()} onClick={()=>editor.chain().focus().unsetAllMarks().clearNodes().run()}><RemoveFormatting size={17}/></button>
    <button type="button" aria-label="실행 취소" title="실행 취소" disabled={disabled||!editor.can().undo()} onClick={()=>editor.chain().focus().undo().run()}><Undo2 size={17}/></button>
    <button type="button" aria-label="다시 실행" title="다시 실행" disabled={disabled||!editor.can().redo()} onClick={()=>editor.chain().focus().redo().run()}><Redo2 size={17}/></button>
  </div><EditorContent editor={editor}/><div className="rich-editor-bottom">글자를 선택해 서식을 적용하세요. Ctrl+B 굵게 · Ctrl+U 밑줄<span>{value.length.toLocaleString()} / 30,000 (서식 포함)</span></div></div>;
}
