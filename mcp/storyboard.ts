import type {Project} from '../studio/domain/schema.ts';
import {storyLink} from '../studio/domain/storyboard.ts';
import {page,type QueryOptions} from './query.ts';

export function listStoryboard(p:Project,q:QueryOptions={}){
 const words=(q.query??'').toLocaleLowerCase().split(/\s+/).filter(Boolean),cards=(p.storyboard?.cards??[]).filter(c=>(!q.sequenceId||c.sequenceId===q.sequenceId)&&words.every(w=>(c.title+' '+c.description+' '+c.id).toLocaleLowerCase().includes(w)));
 return page(p,'storyboard',cards,q,c=>({id:c.id,title:c.title,status:c.status,durationFrames:c.durationFrames,sequenceId:c.sequenceId,image:c.image,nodeIds:c.nodeIds,openComments:c.comments.filter(c=>!c.resolved).length,link:storyLink(p,c)}));
}
export function getStoryCard(p:Project,q:{cardId?:string;field?:string;textOffset?:number}&QueryOptions){
 const card=p.storyboard?.cards.find(c=>c.id===q.cardId);
 if(q.field==='synopsis'||card&&['title','description','camera','transition','sound','sources'].includes(q.field??'')){
  const offset=q.textOffset??0;if(!Number.isInteger(offset)||offset<0)throw Error('textOffset: целое >=0');const text=q.field==='synopsis'?p.storyboard?.synopsis??'':String((card as any)[q.field!]);
  return{projectId:p.id,revision:p.revision,cardId:card?.id,field:q.field,text:text.slice(offset,offset+1000),textOffset:offset,textLength:text.length,nextTextOffset:offset+1000<text.length?offset+1000:null,complete:offset===0&&text.length<=1000};
 }
 if(!card)throw Error('Карточка раскадровки не найдена');
 if(q.field==='comments')return page(p,'story-comments',card.comments,q,c=>({id:c.id,text:c.text,resolved:c.resolved}));
 if(q.field!==undefined)throw Error('field: synopsis, title, description, camera, transition, sound, sources, comments');
 return{projectId:p.id,revision:p.revision,card:{id:card.id,title:card.title,status:card.status,durationFrames:card.durationFrames,sequenceId:card.sequenceId,nodeIds:card.nodeIds,image:card.image,comments:card.comments.length,openComments:card.comments.filter(c=>!c.resolved).length,link:storyLink(p,card),textLengths:Object.fromEntries(['description','camera','transition','sound','sources'].map(f=>[f,(card as any)[f].length]))},next:'Текст: get_story_card(field:...). Тексты длиннее 1000 символов читать по nextTextOffset. Замечания: field comments + offset/limit. Правки: updateStoryCard, addStoryComment через propose_changes.'};
}
