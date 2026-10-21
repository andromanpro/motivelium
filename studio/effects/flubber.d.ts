declare module 'flubber' {
 type Point=[number,number];
 const flubber:{interpolate:(from:string|Point[],to:string|Point[],options:{string:false;maxSegmentLength:number})=>(t:number)=>Point[]};
 export default flubber;
}
