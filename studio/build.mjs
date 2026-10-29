// Сборка студии Motivelium. Только локальные node_modules studio/, без внешних fallback-путей.
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
const here=path.dirname(fileURLToPath(import.meta.url));
const args=process.argv.slice(2),outArg=args.indexOf('--out-dir');
const outDir=outArg>=0?path.resolve(args[outArg+1]):path.resolve(here,'..','www','studio');
fs.mkdirSync(outDir,{recursive:true});
const production=!process.argv.includes('--development');
const require=createRequire(path.join(here,'package.json'));
await require('esbuild').build({
  absWorkingDir:here,
  entryPoints:[path.join(here,'src','editor','main.tsx')],
  outfile:path.join(outDir,'app.js'),
  bundle:true,format:'esm',platform:'browser',jsx:'automatic',
  sourcemap:true,minify:production,
  define:{'process.env.NODE_ENV':JSON.stringify(production?'production':'development')},
  logLevel:'info'
});
await require('esbuild').build({absWorkingDir:here,entryPoints:[path.join(here,'src','editor','appearanceBoot.ts')],outfile:path.join(outDir,'appearance-boot.js'),bundle:true,format:'iife',platform:'browser',minify:production,logLevel:'info'});
for(const name of ['index.html','style.css','storyboard.css','audio.css','onboarding.css','theme.css']) fs.copyFileSync(path.join(here,'src','editor',name),path.join(outDir,name));
fs.mkdirSync(path.join(outDir,'export'),{recursive:true});
await require('esbuild').build({absWorkingDir:here,entryPoints:[path.join(here,'src','export','worker.ts')],outfile:path.join(outDir,'export','worker.js'),bundle:true,format:'esm',platform:'browser',sourcemap:true,minify:production,logLevel:'info'});
fs.copyFileSync(path.join(here,'src','export','index.html'),path.join(outDir,'export','index.html'));
console.log('studio built -> www/studio (own lockfile, no external node_modules fallbacks)');
