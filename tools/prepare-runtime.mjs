// Explicit runtime allowlist. Refuses an existing destination; never reads .local or .env.
import fs from'node:fs/promises';import path from'node:path';import{fileURLToPath}from'node:url';import crypto from'node:crypto';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),args=process.argv.slice(2),out=path.resolve(args[args.indexOf('--out')+1]??'');
if(!args.includes('--out')||!args[args.indexOf('--out')+1])throw Error('Usage: node tools/prepare-runtime.mjs --out NEW_FOLDER');
try{await fs.lstat(out);throw Error('Destination already exists: '+out)}catch(e){if(e.code!=='ENOENT')throw e;}
const files=['server.mjs','launch.mjs','launch.py','START.cmd','SETUP.cmd','package.json','package-lock.json','README.md','LICENSE','THIRD_PARTY.md','licenses','CHANGELOG.md','third-party.txt',
 'tools/setup.mjs','tools/prepare-runtime.mjs','docs/INSTALLATION.md','docs/RELEASE_0_1.md','docs/KNOWN_ISSUES.md','docs/ALPHA_TEST.md','docs/EXAMPLES.md','server','studio/package.json','studio/package-lock.json','studio/build.mjs','studio/tsconfig.json','studio/src','studio/domain','studio/effects','studio/render','studio/agent',
 'www/studio','www/catalog','www/shaders','www/licenses','www/models','www/showcase/assets','www/energy/assets','www/matter/assets','www/projects/iikona/assets/monitoring-journal-historical.png',
 'templates/catalog.json','templates/SOURCES.md','templates/spectrum','templates/route','templates/signal'];
await fs.mkdir(out,{recursive:true});
for(const file of files)await fs.cp(path.join(root,file),path.join(out,file),{recursive:true,errorOnExist:true,force:false});
const manifest=[];async function walk(dir){for(const entry of await fs.readdir(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isSymbolicLink())throw Error('Links are not allowed in a runtime kit: '+file);if(entry.isDirectory())await walk(file);else{const bytes=await fs.readFile(file);manifest.push({path:path.relative(out,file).replaceAll('\\','/'),bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')});}}}
await walk(out);manifest.sort((a,b)=>a.path.localeCompare(b.path));await fs.writeFile(path.join(out,'runtime-manifest.json'),JSON.stringify({format:'motivelium-installation-check',version:1,publicRelease:false,files:manifest},null,2));
console.log(JSON.stringify({out,files:manifest.length,bytes:manifest.reduce((n,f)=>n+f.bytes,0),publicRelease:false}));
