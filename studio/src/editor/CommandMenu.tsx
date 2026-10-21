import {useEffect,useId,useRef,useState} from 'react';
import {Icon} from './Icon.tsx';

export type MenuCommand={label:string;hint?:string;icon?:string;disabled?:boolean;divider?:boolean;action:()=>void};
export function CommandMenu({label,commands,primary=false,disabled=false,align='end',appearance='text'}:{label:string;commands:MenuCommand[];primary?:boolean;disabled?:boolean;align?:'start'|'end';appearance?:'text'|'more'}){
 const [open,setOpen]=useState(false),root=useRef<HTMLDivElement>(null),trigger=useRef<HTMLButtonElement>(null),id=useId();
 const items=()=>Array.from(root.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')??[]);
 const focus=(last=false)=>requestAnimationFrame(()=>{const list=items();(last?list.at(-1):list[0])?.focus()});
 useEffect(()=>{if(!open)return;const close=(e:PointerEvent)=>{if(!root.current?.contains(e.target as Node))setOpen(false)};document.addEventListener('pointerdown',close);return()=>document.removeEventListener('pointerdown',close)},[open]);
 useEffect(()=>{if(disabled)setOpen(false)},[disabled]);
 return <div ref={root} className="command-menu" data-align={align} onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget))setOpen(false)}} onKeyDown={e=>{
  if(e.key==='Escape'&&open){e.preventDefault();e.stopPropagation();setOpen(false);trigger.current?.focus()}
  if(!open||e.target===trigger.current)return;
  const list=items(),index=list.indexOf(document.activeElement as HTMLButtonElement);
  if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();const next=e.key==='Home'?0:e.key==='End'?list.length-1:(index+(e.key==='ArrowDown'?1:-1)+list.length)%list.length;list[next]?.focus()}
 }}>
  <button ref={trigger} type="button" className={'command-trigger '+(primary?'command-primary':'')+(appearance==='more'?' command-more':'')} aria-label={label} disabled={disabled} aria-haspopup="menu" aria-expanded={open} aria-controls={open?id:undefined} onClick={()=>setOpen(v=>!v)} onKeyDown={e=>{if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();setOpen(true);focus(e.key==='ArrowUp')}}}>{appearance==='more'?<span aria-hidden="true">⋯</span>:<>{primary&&<Icon name="download" size={16}/>}<span>{label}</span><Icon name="down" size={12}/></>}</button>
  {open&&<div id={id} className="command-popover" role="menu" aria-label={label}>{commands.map(c=><button key={c.label} type="button" role="menuitem" className={c.divider?'command-divider':''} disabled={c.disabled} onClick={()=>{setOpen(false);c.action()}}>{c.icon&&<Icon name={c.icon} size={17}/>}<span><strong>{c.label}</strong>{c.hint&&<small>{c.hint}</small>}</span></button>)}</div>}
 </div>;
}
