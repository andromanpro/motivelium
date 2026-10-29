import type{Project,TextNode}from'./schema.ts';
export type EnglishFilm='letters'|'matter'|'collage';
const copy:Record<EnglishFilm,{title:string;text:Record<string,string>;scenes:Record<string,string>;cues:Record<string,string>}>={
 letters:{title:'Type Unleashed · a typography lab',text:{
  quiet:"Quiet. I think they're alive.",hero:'TYPE','hero-sub':'went off script.',
  'caption-0':'Every character has its own path. Text stays editable.',
  'editorial-small':'ONE TEXT. FOUR DISTINCT VOICES.',character:'Character','character-sub':'is never the default.',
  'ink-label':'INK. INSIDE THE LETTERS.','ink-title':'NOT A PNG.','ink-sub':'Change the font. Move the glyphs. Paint with light.',
  'contour-label':'WHAT IF THE SHAPE ITSELF COULD CHANGE?','contour-title':'TYPE','contour-sub':'And you can still refine it by hand.',
  'contour-note':'ONEST OUTLINES / MORPHING  ·  EVERY WORD STAYS EDITABLE',
 },scenes:{'letters-0':'Type unleashed','letters-1':'A voice of its own','letters-2':'Ink inside letters','letters-3':'Living outlines'},cues:{}},
 matter:{title:'Matter · every part in its place',text:{
  'hero-line':'Form on the outside.','exploded-line':'Purpose on the inside.','engine-label':'Under the hood.',
  'wheel-label':'Down to the brake disc.','matter-title':'MATTER','matter-sign':'Every part. In its place.',
  'car-credit':'Car Concept · Unity Fan / Eric Chadwick / DGG · CC BY 4.0 · illustrative disassembly',
 },scenes:{hero:'The whole',explode:'Under the shell',engine:'To the engine',wheel:'Closer to the mechanism',assemble:'Back together'},cues:{}},
 collage:{title:'Set Ideas in Motion · a paper flight',text:{
  'perspective-folio':'02 / A DIFFERENT ANGLE','perspective-title':'NEW\nANGLE',
  'perspective-note':'It is all a matter of perspective.','perspective-caption':'METAL / LIGHT / TEXTURE',
  'collage-folio':'03 / PARTS BECOME A WHOLE','collage-final-title':'LET\nIDEAS\nFLY',
  'collage-signature':'Make it yours. With what you have.','journey-note':'DO NOT LEAVE YOUR IDEA BY THE ROADSIDE.',
  'object-note':'THIS BELONGS IN THE FRAME, TOO.','opening-folio':'01 / FIRST, THERE WERE PIECES',
  'seal-caption-top':'WORKSHOP','seal-word-register':'YOURS','seal-word':'YOURS','seal-caption-bottom':'No. 03',
 },scenes:{'letter-assembly':'Pieces → perspective → collage → whole'},cues:{
  pieces:'Letter assembly','whole-word':'Make it yours','first-flight':'Beyond the frame',perspective:'A new angle',texture:'Into the texture',collage:'The cards come together',canvas:'The whole canvas',final:'Set ideas in motion',
 }},
};
const assetNames:Record<string,string>={
 'asset-film-score':'Matter · original score · 150 BPM','asset-film-car':'Car Concept · Unity Fan / Eric Chadwick / DGG · CC BY 4.0',
 'asset-film-credits':'Model authors and preparation notes','asset-film-knot':'Titanium knot · illustration','asset-film-road':'Coastal road · illustration',
 'asset-film-sculpture':'Kinetic sculpture · illustration','asset-collage-score':'Set Ideas in Motion · original score · 120 BPM',
 'asset-collage-tick':'Paper tick','asset-collage-sweep':'Paper flight',
};
function fitText(node:TextNode){
 const max=Math.max(...node.text.split('\n').map(s=>s.length));
 const factor=node.fontFamily==='Rubik Mono One'?.86:node.fontFamily==='Literata Italic'?.62:.75;
 node.fontSize=Math.min(node.fontSize,(node.geometry.width-8)/Math.max(1,max*factor));
}
/** Applies only to a newly generated built-in recipe, never to user documents. */
export function englishFilm(source:Project,kind:EnglishFilm):Project{
 const p=structuredClone(source),c=copy[kind];p.id+='-en';p.title=c.title;
 for(const node of p.nodes){
  if(node.kind==='text'){
   if(c.text[node.id]!==undefined)node.text=c.text[node.id]!;
   if(kind==='letters'&&node.id.startsWith('satellite-'))node.text='ABCMXYZQ'[Number(node.id.slice(10))%8]!;
   if(kind==='letters'&&node.id.startsWith('specimen-'))node.text='Aa Bb 0'+node.id.slice(9);
   if(kind!=='collage'||!node.id.startsWith('letter-'))fitText(node);
  }
  if(/[А-Яа-яЁё]/u.test(node.name))node.name=node.kind==='text'?node.text.replaceAll('\n',' '):node.id.replaceAll('-',' ');
 }
 for(const s of p.sequences)s.name=c.scenes[s.id]??s.name;
 for(const cue of p.cues)cue.label=c.cues[cue.id]??p.sequences.find(s=>s.fromFrame===cue.frame)?.name??(/^[0-9 .-]+$/.test(cue.label)?cue.label:cue.id.replaceAll('-',' '));
 for(const camera of p.cameraTracks)camera.name=c.title+' · camera';
 for(const a of p.assets){if(assetNames[a.id])a.title=assetNames[a.id];else if(a.title&&/[А-Яа-яЁё]/u.test(a.title))a.title=kind==='letters'?'Type Unleashed · original score · 180 BPM':a.id}
 for(const track of p.audioTracks)track.name=track.id.replaceAll('-',' ');
 if(kind==='letters'){const fx=p.effects.find(e=>e.targetId==='contour-title'&&e.definitionId==='letter-morph');if(fx){fx.params.fromText='TYPE';fx.params.toText='ALIVE'}}
 return p;
}
