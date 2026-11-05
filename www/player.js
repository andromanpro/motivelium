const legacyFetch=window.fetch.bind(window);window.fetch=async(input,init)=>{if(typeof input==='string'&&['/api/notes','/api/settings'].includes(input)&&init?.method==='POST'){const token=(await(await legacyFetch('/api/v1/project-packages')).json()).mutationToken;init={...init,headers:{...init.headers,'x-motivelium-token':token}}}return legacyFetch(input,init)};
let project,sessionKey;
const $=id=>document.getElementById(id),audio=$('audio'),canvas=$('view');
const DEFAULTS={distance:1,roll:0,pulse:1,depth:1};let settings={...DEFAULTS},time=0,playing=false,overview=false,frameInfo={},lastFrame=0,fpsSamples=[];
let scene;const errors=[];window.addEventListener('error',e=>errors.push(e.message));window.addEventListener('unhandledrejection',e=>errors.push(String(e.reason)));
const fmt=t=>`${Math.floor(t/60)}:${(t%60).toFixed(2).padStart(5,'0')}`;
function outputSettings(){for(const k in DEFAULTS){$(k).value=settings[k];$(k+'-v').textContent=k==='roll'?settings[k]+'°':Number(settings[k]).toFixed(2);}}
function saveLocal(){sessionStorage.setItem(sessionKey,JSON.stringify({time,settings,playbackVersion:2,loop:$('loop').checked,in:$('in').value,out:$('out').value,noteDraft:$('note').value}));}
function bounds(){const a=Number($('in').value),b=Number($('out').value);return {start:Math.max(0,Math.min(scene.duration-1/60,Number.isFinite(a)?a:0)),end:Math.min(scene.duration,Number.isFinite(b)?b:scene.duration)};}
function outputLoop(){if(!scene)return;const {start,end}=bounds(),on=$('loop').checked;
 $('loop-band').hidden=!on;$('loop-start-marker').hidden=!on;$('loop-end-marker').hidden=!on;
 $('loop-band').style.left=(start/scene.duration*100)+'%';$('loop-band').style.width=((end-start)/scene.duration*100)+'%';
 $('loop-start-marker').style.left=(start/scene.duration*100)+'%';$('loop-end-marker').style.left=(end/scene.duration*100)+'%';
 $('loop-start-marker').firstElementChild.textContent=fmt(start);$('loop-end-marker').firstElementChild.textContent=fmt(end);
 $('loop-status').textContent=on?`Цикл ${fmt(start)} → ${fmt(end)}`:`Без повтора · до ${fmt(scene.duration)}`;
 $('loop-here').classList.toggle('active',on);saveLocal();
}
function paint(){if(!scene)return;frameInfo=scene.render(time,{...settings,overview});$('time').textContent=fmt(time);$('seek').value=time;$('caption').textContent=frameInfo.caption;$('shot').textContent=frameInfo.shot;saveLocal();}
function seek(t){time=Math.max(0,Math.min(scene.duration,Number(t)||0));audio.currentTime=time;paint();}
function pause({render=true}={}){playing=false;audio.pause();$('play').textContent='▶ Смотреть';if(render)paint();}
async function play(){const on=$('loop').checked,{start,end}=bounds();if(on&&(time<start||time>=end-.001))seek(start);else if(!on&&time>=scene.duration-.001)seek(0);audio.playbackRate=Number($('speed').value);audio.muted=!$('sound').checked;audio.currentTime=time;try{await audio.play();playing=true;$('play').textContent='Ⅱ Пауза';$('state').textContent='Живая сцена · музыка синхронизирована';}catch(e){$('state').textContent='Нажми «Смотреть», чтобы браузер разрешил звук';errors.push('audio play: '+e.message);}}
function tick(now){if(lastFrame){fpsSamples.push(1000/(now-lastFrame));if(fpsSamples.length>120)fpsSamples.shift();}lastFrame=now;if(playing){time=audio.currentTime;const on=$('loop').checked,b= bounds(),end=on?b.end:scene.duration;if(time>=end){if(on){seek(b.start);}else{time=end;pause();$('state').textContent='Конец пробы · повтор выключен';}}paint();}requestAnimationFrame(tick);}
async function loadNotes(){try{const ns=await(await fetch('/api/notes')).json();$('notes').replaceChildren();for(const n of ns.slice(0,12)){const el=document.createElement('div');el.className='note-card';el.tabIndex=0;const b=document.createElement('b');b.textContent=fmt(n.time);const text=document.createElement('span');text.textContent=n.text;el.append(b,text);el.onclick=()=>{pause();seek(n.time);};el.onkeydown=e=>{if(e.key==='Enter')el.click();};$('notes').append(el);}}catch(e){$('note-status').textContent='Заметки не загрузились: '+e.message;}}
try{
 project=await(await fetch('./project.json')).json();sessionKey='workshop:'+project.id;
 document.title=project.title+' · Мастерская';audio.src=project.audio;$('scene-label').textContent=project.sceneLabel||'ПОЯСНЯЮЩАЯ СЦЕНА';
 for(const c of project.chapters||[]){const e=document.createElement(c.time===undefined?'span':'button');e.textContent=c.title;const s=document.createElement('small');s.textContent=c.subtitle||'';e.append(s);if(c.time!==undefined){e.dataset.seek=c.time;e.className='active';}$('chapters').append(e);}
 for(const s of project.shots||[]){const e=document.createElement('button');e.textContent=s.title;e.dataset.seek=s.time;$('shots').append(e);}
 const {makeScene}=await import(project.sceneModule);await document.fonts.ready;scene=await makeScene(canvas);
 $('seek').max=scene.duration;$('out').max=scene.duration;$('out').value=scene.duration;$('in').max=scene.duration-1/60;
 $('project-info').textContent=(project.musicNote||'')+' · '+project.bpm+' BPM · '+fmt(scene.duration);
 try{const s=await(await fetch('/api/settings')).json();for(const k in DEFAULTS)if(Number.isFinite(s[k]))settings[k]=s[k];}catch{}
 try{const s=JSON.parse(sessionStorage.getItem(sessionKey)||'{}');time=Math.max(0,Math.min(scene.duration,s.time||0));if(s.settings)settings={...settings,...s.settings};if(s.playbackVersion===2){if(s.in!==undefined)$('in').value=s.in;if(s.out!==undefined)$('out').value=s.out;if(s.loop!==undefined)$('loop').checked=s.loop;}if(s.noteDraft)$('note').value=s.noteDraft;}catch{}
 const urlTime=new URLSearchParams(location.search).get('t');if(urlTime!==null)time=Math.max(0,Math.min(scene.duration,Number(urlTime)||0));
 outputSettings();outputLoop();paint();$('state').textContent=project.title+' · без рендера MP4';
 $('play').onclick=()=>playing?pause():play();$('restart').onclick=()=>{pause();seek(0);};$('prev').onclick=()=>{pause();seek(time-1/60);};$('next').onclick=()=>{pause();seek(time+1/60);};
 // Capture the native range value before rendering can write the previous time back.
 $('seek').onpointerdown=()=>pause({render:false});
 $('seek').oninput=e=>{const targetTime=e.currentTarget.valueAsNumber;pause({render:false});seek(targetTime);};
 $('sound').onchange=()=>audio.muted=!$('sound').checked;$('speed').onchange=()=>audio.playbackRate=Number($('speed').value);
 document.querySelectorAll('[data-seek]').forEach(b=>b.onclick=()=>{pause();overview=false;$('overview').classList.remove('active');seek(b.dataset.seek);});
 for(const k in DEFAULTS)$(k).oninput=()=>{settings[k]=Number($(k).value);outputSettings();paint();};
 $('reset-settings').onclick=()=>{settings={...DEFAULTS};outputSettings();paint();};
 $('save-settings').onclick=async()=>{try{const r=await fetch('/api/settings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(settings)});if(!r.ok)throw Error(await r.text());$('saved-settings').textContent='Сохранено в проекте';}catch(e){$('saved-settings').textContent='Не сохранено: '+e.message;}};
 $('overview').onclick=()=>{overview=!overview;$('overview').style.borderColor=overview?'#edb23a':'';paint();};
 $('loop-here').onclick=()=>{pause();$('in').value=Math.max(0,time-1).toFixed(2);$('out').value=Math.min(scene.duration,time+1).toFixed(2);$('loop').checked=true;outputLoop();};
 $('loop').onchange=()=>outputLoop();
 $('clear-loop').onclick=()=>{$('loop').checked=false;$('in').value=0;$('out').value=scene.duration;outputLoop();};
 for(const k of ['in','out'])$(k).onchange=()=>{pause({render:false});const b=bounds();$('in').value=b.start;$('out').value=Math.max(b.start+1/60,b.end);outputLoop();paint();};
 $('note').oninput=saveLocal;
 $('full').onclick=()=>$('stage').requestFullscreen();
 $('save-note').onclick=async()=>{pause();const text=$('note').value.trim();if(!text){$('note-status').textContent='Добавь текст замечания';return;}$('save-note').disabled=true;try{const r=await fetch('/api/notes',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({time,text,settings,project:project.id,part:frameInfo.part||null,camera:frameInfo.camera,image:canvas.toDataURL('image/png')})});if(!r.ok)throw Error(await r.text());$('note').value='';$('note-status').textContent='Кадр и замечание сохранены в проекте';await loadNotes();}catch(e){$('note-status').textContent='Не сохранено: '+e.message;}finally{$('save-note').disabled=false;}};
 document.addEventListener('keydown',e=>{if(['TEXTAREA','INPUT','SELECT'].includes(e.target.tagName))return;if(e.code==='Space'){e.preventDefault();playing?pause():play();}if(e.code==='ArrowRight'){pause();seek(time+1/60);}if(e.code==='ArrowLeft'){pause();seek(time-1/60);}});
 for(let i=0;i<=10;i++){let s=document.createElement('span');s.textContent=fmt(scene.duration*i/10);$('beats').append(s);}
 const refs=await(await fetch('./references.json')).json();for(const r of refs){let div=document.createElement('article');div.className='reference';let b=document.createElement('b');b.textContent=r.title;div.append(b);let p=document.createElement('p');p.textContent=r.application;div.append(p);for(const [label,url] of [['Демо',r.demo],['Код',r.code]]){if(!url)continue;let a=document.createElement('a');a.href=url;a.target='_blank';a.rel='noopener noreferrer';a.textContent=label;div.append(a,document.createTextNode(' · '));}$('references').append(div);}
 await loadNotes();requestAnimationFrame(tick);
 const es=new EventSource('/events');es.onmessage=()=>{saveLocal();audio.pause();location.reload();};
 window.__lab={seek,pause,play,setSettings(s){settings={...settings,...s};outputSettings();paint();},get state(){return {time,playing,settings,camera:frameInfo.camera,fps:fpsSamples.length?fpsSamples.reduce((a,b)=>a+b,0)/fpsSamples.length:0,errors};},get duration(){return scene.duration;},get project(){return project;},get storageKey(){return sessionKey;}};
 window.__ready=true;
}catch(e){errors.push(String(e.stack||e));$('state').textContent='Ошибка загрузки';$('load-error').hidden=false;$('load-error').textContent='Сцена не запустилась:\n'+String(e.message||e);console.error(e);}
