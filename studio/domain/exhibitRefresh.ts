import type {Project} from './schema.ts';
/** Only NEW gallery copies use this edition. Stored documents and v1 presets stay intact. */
export function refreshExhibit(input:Project):Project{
 const p=structuredClone(input);p.title+=' · новая типографика';
 let i=0;
 for(const n of p.nodes){if(n.kind!=='text')continue;
  const big=n.fontSize>=80;if(!big){n.fontFamily='Onest';continue}
  const single=n.text.replace(/\s/g,'').length<3;
  n.fontFamily=single?'Rubik Mono One':i++%3===1?'Literata Italic':'Unbounded';
  n.fontWeight=n.fontFamily==='Unbounded'?700:500;
  n.fontSize=Math.round(n.fontSize*(n.fontFamily==='Unbounded'?.77:n.fontFamily==='Rubik Mono One'?.8:1));
  if(p.effects.some(e=>e.targetId===n.id&&e.definitionId==='letter-morph'))continue;
  const s=p.sequences.find(s=>s.id===n.sequenceId)!;
  p.effects.push({id:'glyph-edition-'+n.id,definitionId:'glyph-motion',definitionVersion:1,targetId:n.id,fromFrame:s.fromFrame,toFrame:s.toFrame,order:99,enabled:true,params:{mode:single?'orbit':'wave',amplitude:single?20:12,rotation:single?9:3,cycles:1.5,stagger:.44}});
 }
 return p;
}
