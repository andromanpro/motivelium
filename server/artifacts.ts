import fs from 'node:fs/promises';import path from 'node:path';import{localDataDir}from'./dataPaths.ts';
const terminal=new Set(['ready','failed','cancelled']),valid=/^[a-z0-9-]{1,100}$/;
export function createArtifactMaintenance(root:string){
 const base=path.resolve(localDataDir(root));
 async function bytes(file:string):Promise<number>{try{const stat=await fs.lstat(file);if(stat.isSymbolicLink())return 0;if(stat.isFile())return stat.size;let total=0;for(const n of await fs.readdir(file))total+=await bytes(path.join(file,n));return total}catch{return 0}}
 async function candidates(ageDays=1){const files:string[]=[];const folder=path.join(base,'video-exports');
  for(const pid of await fs.readdir(folder).catch(()=>[])){if(!valid.test(pid))continue;const parent=path.join(folder,pid);if((await fs.lstat(parent)).isSymbolicLink())continue;
   for(const jid of await fs.readdir(parent)){if(!valid.test(jid)||jid==='requests')continue;const dir=path.join(parent,jid);if((await fs.lstat(dir)).isSymbolicLink())continue;
    try{const job=JSON.parse(await fs.readFile(path.join(dir,'job.json'),'utf8')),at=Date.parse(job.updatedAt??job.createdAt);if(!terminal.has(job.status)||!Number.isFinite(at)||at>Date.now()-ageDays*86400000)continue;
     for(const name of ['frames','assets','mix.wav','decode.f32','video-only.mp4','result.tmp.mp4']){const file=path.join(dir,name);if(await bytes(file))files.push(file)}
    }catch{}
   }
  }return files;
 }
 async function info(){const files=await candidates();let reclaimableBytes=0;for(const file of files)reclaimableBytes+=await bytes(file);return{derivedBytes:await bytes(path.join(base,'video-exports')),reclaimableBytes,items:files.length,ageDays:1,preserves:['projects','history','original assets','MP4','poster','export receipts']}}
 return{info,async clean(){const files=await candidates();let reclaimedBytes=0,removed=0;for(const file of files){const resolved=await fs.realpath(file).catch(()=>null),allowed=path.join(base,'video-exports')+path.sep;if(!resolved||!resolved.toLowerCase().startsWith(allowed.toLowerCase()))continue;const stat=await fs.lstat(file);if(stat.isSymbolicLink())continue;const count=await bytes(file);await fs.rm(file,{recursive:true,force:true});reclaimedBytes+=count;removed++}return{reclaimedBytes,removed,...await info()}}};
}
