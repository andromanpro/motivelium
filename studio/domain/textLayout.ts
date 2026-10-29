/** Authoring helper: stores explicit line breaks and font size in ordinary editable text nodes. */
export function fitCopy(text:string,width:number,height:number,maximum:number,lineHeight=1.15,measure:(s:string,size:number)=>number=(s,size)=>[...s].reduce((n,c)=>n+(c===' '?.3:/[.,:;!«»'—-]/.test(c)?.4:.68),0)*size){
 function wrap(size:number){const lines:string[]=[];for(const paragraph of text.split('\n')){let line='';for(const word of paragraph.split(/\s+/).filter(Boolean)){const joined=line?line+' '+word:word;if(measure(joined,size)<=width){line=joined;continue}if(line){lines.push(line);line=''}if(measure(word,size)<=width){line=word;continue}for(const ch of word){if(line&&measure(line+ch,size)>width){lines.push(line);line=''}line+=ch}}lines.push(line)}return lines}
 let size=maximum,lines=wrap(size);while(size>12&&(lines.length*size*lineHeight>height||lines.some(s=>measure(s,size)>width))){size=Math.max(12,size-2);lines=wrap(size)}return{text:lines.join('\n'),fontSize:size};
}
