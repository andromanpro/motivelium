"""Pinned Windows x64 portable build. Does not include author profiles or projects."""
from pathlib import Path
import argparse,subprocess,shutil,json,hashlib,urllib.request,zipfile,base64,sys,os
from PIL import Image,ImageDraw
ROOT=Path(__file__).resolve().parents[1]
SDK_VERSION='1.0.4258.31'
SDK_SHA='56f7f4b8bf9aee4b8efefbbdd4f67d5f74ebd1b100ed0806da71bf76af481aa9'
NODE_SHA='2ffe3acc0458fdde999f50d11809bbe7c9b7ef204dcf17094e325d26ace101d8'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def main():
 parser=argparse.ArgumentParser();parser.add_argument('--out',required=True);parser.add_argument('--node',default=os.environ.get('MOTIVELIUM_BUILD_NODE') or shutil.which('node') or 'F:/Program Files/nodejs/node.exe');args=parser.parse_args();out=Path(args.out).resolve();assert not out.exists(),'Output must be new'
 work=ROOT/'lab/desktop-exe-20261020';cache=work/'downloads';cache.mkdir(parents=True,exist_ok=True)
 url='https://api.nuget.org/v3-flatcontainer/microsoft.web.webview2/'+SDK_VERSION+'/microsoft.web.webview2.'+SDK_VERSION+'.nupkg';package=cache/('webview2-'+SDK_VERSION+'.nupkg')
 if not package.exists():
  with urllib.request.urlopen(url,timeout=60)as f:package.write_bytes(f.read())
 assert sha(package)==SDK_SHA,'WebView2 package differs from the pinned official NuGet download'
 # NuGet flat-container hash is recorded alongside locally computed hashes.
 remote_hash=None
 try:
  with urllib.request.urlopen(url+'.sha512',timeout=20)as f:remote_hash=f.read().decode().strip()
 except urllib.error.HTTPError as e:
  if e.code!=404:raise
 if remote_hash:assert base64.b64encode(hashlib.sha512(package.read_bytes()).digest()).decode()==remote_hash
 with zipfile.ZipFile(package)as z:
  assert z.testzip()is None
  names=z.namelist();(work/'sdk-files.json').write_text(json.dumps(names,indent=2),encoding='utf-8')
  sdk=cache/'sdk';sdk.mkdir(exist_ok=True)
  for name in ['lib/net462/Microsoft.Web.WebView2.Core.dll','lib/net462/Microsoft.Web.WebView2.WinForms.dll','runtimes/win-x64/native/WebView2Loader.dll','LICENSE.txt']:
   assert name in names,name
   (sdk/Path(name).name).write_bytes(z.read(name))
 node=Path(args.node).resolve();assert sha(node)==NODE_SHA,'Node differs from official v24.12.0 win-x64 checksums'
 node_license=cache/'NODE-LICENSE.txt'
 if not node_license.exists():
  with urllib.request.urlopen('https://raw.githubusercontent.com/nodejs/node/v24.12.0/LICENSE',timeout=30)as f:node_license.write_bytes(f.read())
 assert b'Permission is hereby granted' in node_license.read_bytes()
 # Own original vector mark, rasterized for the Windows icon. No stock asset.
 im=Image.new('RGBA',(256,256),(243,241,235,255));g=ImageDraw.Draw(im);g.rounded_rectangle((4,4,252,252),radius=52,fill=(243,241,235),outline=(217,223,211),width=4)
 for box,color in [((49,64,181,91),'#365f4e'),((65,112,197,139),'#9aaf93'),((81,160,213,187),'#af623f')]:g.rounded_rectangle(box,radius=6,fill=color)
 im=im.rotate(12,resample=Image.Resampling.BICUBIC,fillcolor=(243,241,235,0));icon=ROOT/'desktop/Motivelium.ico';im.save(icon,format='ICO',sizes=[(16,16),(24,24),(32,32),(48,48),(64,64),(128,128),(256,256)])
 subprocess.run([str(node),str(ROOT/'tools/prepare-runtime.mjs'),'--out',str(out/'app')],cwd=ROOT,check=True)
 # Runtime-only dependencies; retain each package's notices and own lockfile.
 npm=node.parent/'node_modules/npm/bin/npm-cli.js';subprocess.run([str(node),str(npm),'ci','--omit=dev','--no-audit','--no-fund','--prefix',str(out/'app/studio')],cwd=ROOT,check=True)
 for name in ['START.cmd','SETUP.cmd','launch.py','runtime-manifest.json']:(out/'app'/name).unlink()
 (out/'runtime/node').mkdir(parents=True);shutil.copy2(node,out/'runtime/node/node.exe');shutil.copy2(node_license,out/'runtime/node/LICENSE.txt')
 (out/'runtime/desktop').mkdir(parents=True)
 for name in ['Microsoft.Web.WebView2.Core.dll','Microsoft.Web.WebView2.WinForms.dll','WebView2Loader.dll','LICENSE.txt']:shutil.copy2(sdk/name,out/'runtime/desktop'/name)
 shutil.copy2(ROOT/'desktop/Motivelium.exe.config',out/'Motivelium.exe.config')
 compiler='C:/Windows/Microsoft.NET/Framework64/v4.0.30319/csc.exe'
 args=[compiler,'/nologo','/target:winexe','/platform:x64','/optimize+','/utf8output','/out:'+str(out/'Motivelium.exe'),'/win32icon:'+str(icon),'/win32manifest:'+str(ROOT/'desktop/app.manifest'),'/reference:System.dll','/reference:System.Core.dll','/reference:System.Drawing.dll','/reference:System.Windows.Forms.dll','/reference:System.Web.Extensions.dll','/reference:'+str(sdk/'Microsoft.Web.WebView2.Core.dll'),'/reference:'+str(sdk/'Microsoft.Web.WebView2.WinForms.dll'),str(ROOT/'desktop/Program.cs'),str(ROOT/'desktop/ServerHost.cs'),str(ROOT/'desktop/QaSession.cs')]
 subprocess.run(args,cwd=ROOT,check=True)
 sources={'node':{'version':'24.12.0','sha256':NODE_SHA,'checksums':'https://nodejs.org/download/release/v24.12.0/SHASUMS256.txt','license':'runtime/node/LICENSE.txt'},'webview2':{'version':SDK_VERSION,'source':url,'packageSHA256':sha(package),'packageSHA512':base64.b64encode(hashlib.sha512(package.read_bytes()).digest()).decode(),'remoteSHA512':remote_hash,'license':'runtime/desktop/LICENSE.txt'},'desktop':{'framework':'.NET Framework 4.8','target':'Windows x64','subsystem':'Windows GUI','codeSigning':False}}
 (out/'runtime/SOURCES.json').write_text(json.dumps(sources,ensure_ascii=False,indent=2),encoding='utf-8')
 shutil.copy2(ROOT/'desktop/Прочти-меня.md',out/'Прочти-меня.md')
 for name in ['LICENSE','THIRD_PARTY.md','CHANGELOG.md']:shutil.copy2(ROOT/name,out/name)
 shutil.copytree(ROOT/'licenses',out/'licenses')
 print(json.dumps({'out':str(out),'exe':str(out/'Motivelium.exe'),'nodeSHA256':sha(out/'runtime/node/node.exe'),'SDK':SDK_VERSION},ensure_ascii=False))
if __name__=='__main__':main()
