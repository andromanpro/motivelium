/** Explicit lighting profiles reset every frame; old projects keep neutral light. */
export function stageLighting3d(profile:string|undefined,strength=1,discharge=false){
 if(discharge)return{ambient:.04,hemisphere:.12,key:.3,rim:.35,environment:.3,strip:0,fog:.055,roughness:.8,metalness:.04,keyColor:'#fff2d8',rimColor:'#6ea8ff'};
 if(profile==='dramatic')return{ambient:.10,hemisphere:.30,key:1.8*strength,rim:1.6,environment:.48,strip:2,fog:.008,roughness:.32,metalness:.28,keyColor:'#ffe8cb',rimColor:'#97cce8'};
 return{ambient:.55,hemisphere:1.2,key:1.15*strength,rim:.35,environment:1,strip:0,fog:.055,roughness:.65,metalness:.12,keyColor:'#fff2d8',rimColor:'#6ea8ff'};
}
