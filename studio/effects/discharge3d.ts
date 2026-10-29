/** A reproducible event, in seconds relative to its effect interval. */
export type Discharge3d={seconds:number;impact:number;strength:number;reach:number;seed:number;sourcePart:string;lightScene:boolean};
export function dischargePulse(seconds:number,impact:number){
 const d=seconds-impact;
 const leader=d<0?.07*Math.exp(-Math.pow((d+.18)/.025,2))+.12*Math.exp(-Math.pow((d+.07)/.018,2)):0;
 const main=d>=0&&d<.23?Math.exp(-d/.07):0;
 const echo=d>=.4-1e-6&&d<.58?.42*Math.exp(-Math.max(0,d-.4)/.055):0;
 const trace=d>=0?.05*Math.exp(-d/.15):0;
 const ember=d>=0?Math.exp(-d/.55):0;
 return{leader,main,echo,channel:Math.min(1,leader+main+echo+trace),flash:Math.min(1,main+echo+leader*.6),ember,age:d};
}
