import {buildEnergyFilm as buildV4} from './energyFilmV4.ts';
import type {FilmResources} from './demoFilm.ts';
/** Pinned MIT Storm Lance shader, replacing the rejected smooth CPU polyline. */
export function buildEnergyFilm(resources:FilmResources){
 const p=buildV4(resources);p.id='motivelium-energy-film-v5';p.title='Разряд · импульс';
 p.effects=p.effects.filter(e=>e.definitionId!=='motion-memory');
 for(const e of p.effects)if(e.definitionId==='electric-arc'){
  e.definitionId='storm-lightning';e.params={...e.params,branches:e.targetId==='breakdown-channel'?6:3,roughness:.7,width:e.targetId==='breakdown-channel'?2.6:1.8,speed:.75};
 }
 return p;
}
