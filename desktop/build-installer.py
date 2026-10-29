"""Build a per-user NSIS setup from a clean, explicit desktop runtime payload."""
from pathlib import Path
import argparse,subprocess,sys,hashlib,json,shutil,os,zipfile
from PIL import Image,ImageDraw,ImageFont
ROOT=Path(__file__).resolve().parents[1]
NSIS_ZIP_SHA='ba63dffc4410ee89193e1cb5a41989991bd77c61068da17e3156d136b7b0b3d8'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def q(s):return str(s).replace('$','$$').replace('"','$\\"')
def main():
 parser=argparse.ArgumentParser();parser.add_argument('--out',required=True);parser.add_argument('--compiler');parser.add_argument('--compiler-archive',help='Pinned NSIS ZIP required with a custom compiler');parser.add_argument('--payload',help='Reuse an already built payload for an identical installer rebuild');args=parser.parse_args()
 node=os.environ.get('MOTIVELIUM_BUILD_NODE') or shutil.which('node') or 'F:/Program Files/nodejs/node.exe'
 release=json.loads(subprocess.run([node,str(ROOT/'tools/sync-version.mjs'),'--check'],cwd=ROOT,capture_output=True,text=True,encoding='utf-8',check=True).stdout)
 version=release['version']
 out=Path(args.out).resolve();assert not out.exists(),'Output must be a new folder';out.mkdir(parents=True)
 if args.compiler:
  compiler=Path(args.compiler).resolve();archive=Path(args.compiler_archive or str(ROOT/'lab/release-r6-20261020/downloads/nsis-3.13.zip')).resolve()
 else:
  prep=subprocess.run([sys.executable,'-X','utf8',str(ROOT/'tools/prepare-windows-build.py')],cwd=ROOT,capture_output=True,text=True,encoding='utf-8',check=True)
  prepared=json.loads(prep.stdout);compiler=Path(prepared['compiler']);archive=Path(prepared['archive'])
 assert compiler.is_file() and archive.is_file();assert sha(archive)==NSIS_ZIP_SHA
 with zipfile.ZipFile(archive)as pinned:assert hashlib.sha256(pinned.read('nsis-3.13/makensis.exe')).hexdigest()==sha(compiler),'Compiler differs from pinned archive'
 if args.payload:payload=Path(args.payload).resolve();assert (payload/'Motivelium.exe').is_file()
 else:
  subprocess.run([sys.executable,str(ROOT/'tools/license-report.py'),'--verify'],cwd=ROOT,check=True)
  subprocess.run([node,str(ROOT/'studio/build.mjs')],cwd=ROOT,check=True)
  payload=out/'payload/Motivelium';subprocess.run([sys.executable,str(ROOT/'desktop/build.py'),'--out',str(payload)],cwd=ROOT,check=True)
 assert json.loads((payload/'app/version.json').read_text(encoding='utf-8'))['version']==version,'Payload version differs; rebuild the payload before packaging'
 # A distributable runtime contains neither a source checkout nor user data.
 assert not list(payload.rglob('.local'));assert not (payload/'app/www/vendor').exists()
 generated=out/'generated';generated.mkdir();files=sorted(p for p in payload.rglob('*') if p.is_file());all_dirs=set()
 for p in files:
  parent=p.parent
  while parent!=payload:all_dirs.add(parent.relative_to(payload));parent=parent.parent
 dirs=sorted(all_dirs,key=lambda x:(-len(x.parts),str(x)))
 lines=[]
 for parent in sorted({p.parent for p in files}):
  rel=str(parent.relative_to(payload));lines.append('SetOutPath "$INSTDIR'+('\\'+q(rel) if rel!='.' else '')+'"')
  for p in files:
   if p.parent==parent:lines.extend(['ClearErrors','File "'+q(p)+'"','IfErrors 0 +3','StrCpy $FailedFile "'+q(p.relative_to(payload))+'"','Call FailFile'])
 (generated/'files.nsh').write_text('\n'.join(lines)+'\n',encoding='utf-8')
 lines=['Delete "$INSTDIR\\'+q(p.relative_to(payload))+'"'for p in files]+['RMDir "$INSTDIR\\'+q(d)+'"'for d in dirs if str(d)!='.']
 (generated/'uninstall-files.nsh').write_text('\n'.join(lines)+'\n',encoding='utf-8')
 im=Image.new('RGB',(172,314),'#233e37');g=ImageDraw.Draw(im)
 for y in range(314):g.line((0,y,172,y),fill=(35+int(y*.04),62+int(y*.05),55+int(y*.025)))
 for box,color in [((23,78,131,100),'#e9ede3'),((33,115,141,137),'#afc4a4'),((43,152,151,174),'#c98660')]:g.rounded_rectangle(box,radius=5,fill=color)
 font=ImageFont.truetype('C:/Windows/Fonts/segoeuib.ttf',19);g.text((20,236),'motivelium.',font=font,fill='#f3f1eb');g.text((20,265),version,font=ImageFont.truetype('C:/Windows/Fonts/segoeui.ttf',11),fill='#b4c6bb');im.save(generated/'welcome.bmp')
 output=out/f'Motivelium-{version}-Setup-x64.exe'
 uninstaller=out/'Uninstall-for-verification.bin'
 cmd=[str(compiler),'/V3','/INPUTCHARSET','UTF8','/DPAYLOAD='+str(payload),'/DGENERATED='+str(generated),'/DART='+str(ROOT/'desktop'),'/DOUTPUT='+str(output),'/DMV_VERSION='+version,'/DMV_FILE_VERSION='+release['fileVersion'],'/DBUILD_PYTHON='+sys.executable,'/DCAPTURE_SCRIPT='+str(ROOT/'desktop/capture-uninstaller.py'),'/DUNINSTALLER_OUTPUT='+str(uninstaller),'/DSIZE_KB='+str(sum(p.stat().st_size for p in files)//1024),str(ROOT/'desktop/installer.nsi')]
 # This machine denies 32-bit NSIS file creation in the redirected system TEMP.
 # A build-owned temp directory also keeps all intermediates with this build.
 temp=out/'compiler-temp';temp.mkdir(parents=True,exist_ok=True)
 env={**os.environ,'TEMP':str(temp),'TMP':str(temp)}
 result=subprocess.run(cmd,cwd=ROOT,capture_output=True,env=env);(out/'compiler.log').write_bytes(result.stdout+result.stderr)
 if result.returncode:print((result.stdout+result.stderr).decode('utf-8',errors='replace')[-7000:]);raise SystemExit(result.returncode)
 manifest={'format':'motivelium-windows-installer','version':version,'fileVersion':release['fileVersion'],'publicRelease':False,'signed':False,'installerExecutionLevel':'requireAdministrator','editorExecutionLevel':'asInvoker','autoLaunchEditor':False,'compiler':'NSIS 3.13','compilerArchiveSHA256':NSIS_ZIP_SHA,'compression':'zlib','setup':{'name':output.name,'bytes':output.stat().st_size,'sha256':sha(output)},'uninstallerForStaticVerification':{'name':uninstaller.name,'bytes':uninstaller.stat().st_size,'sha256':sha(uninstaller)},'files':[{'path':str(p.relative_to(payload)).replace('\\','/'),'bytes':p.stat().st_size,'sha256':sha(p)}for p in files]}
 (out/'installer-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps({'setup':str(output),'bytes':output.stat().st_size,'sha256':sha(output),'files':len(files)},ensure_ascii=False))
if __name__=='__main__':main()
