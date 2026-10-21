"""Reproducible license inventory for the exact lockfile and pinned shader sources.
Use --verify to check the distributed inventory without laboratory downloads.
Regeneration uses the author's pinned upstream cache in lab/.
No network/LLM/publication here. Does not infer a license from a repository name.
"""
from pathlib import Path
import json,hashlib,shutil,re,sys
ROOT=Path(__file__).resolve().parents[1];WORK=ROOT/'lab/release-r6-20261020';OUT=ROOT/'licenses'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def copy(p,relative):
 target=OUT/relative;target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(p,target)
 return {'file':str(target.relative_to(ROOT)).replace('\\','/'),'sha256':sha(target)}
def verify():
 """Validate shipped notices against lockfile, originals and model bytes offline."""
 report=json.loads((OUT/'manifest.json').read_text(encoding='utf-8'))
 version=json.loads((ROOT/'package.json').read_text(encoding='utf-8'))['version']
 assert report['applicationVersion']==version and report['applicationLicense']=='MIT'
 lock=json.loads((ROOT/'studio/package-lock.json').read_text(encoding='utf-8'))
 expected={name.removeprefix('node_modules/'):(item['version'],item['integrity'],item['license']) for name,item in lock['packages'].items() if name and not item.get('dev')}
 actual={row['name']:(row['version'],row['lockIntegrity'],row['license']) for row in report['npm']}
 assert actual==expected,'Production lockfile differs from license inventory: regenerate and review notices'
 verified=0
 def check(entry):
  nonlocal verified
  p=(ROOT/entry['file']).resolve()
  assert p.is_relative_to(OUT.resolve()) and p.is_file(),'Notice missing or outside licenses/: '+entry['file']
  assert sha(p)==entry['sha256'],'Notice SHA differs: '+entry['file']
  verified+=1
 for row in report['npm']:
  assert row['notices'],'Package has no full notice: '+row['name']
  for notice in row['notices']:check(notice)
 ready={s['id'] for s in json.loads((ROOT/'studio/effects/shaders/ready.json').read_text(encoding='utf-8'))}
 assert {s['id'] for s in report['shaders'] if s['ready']}==ready,'Ready shader inventory differs'
 for shader in report['shaders']:
  check(shader['original'])
  assert shader['sha256']==shader['original']['sha256'],'Original upstream SHA differs: '+shader['id']
 assert sha(ROOT/'www/models/ToyCar.glb')==report['model']['sha256'],'Model SHA differs'
 for required in ['runtime/Node-24.12.0-LICENSE.txt','runtime/WebView2-SDK-1.0.4258.31-LICENSE.txt','installer/NSIS-3.13-COPYING.txt','models/CC0-1.0.txt','models/ToyCar.README.md','media/template-sources.md']:
  assert (OUT/required).is_file() and (OUT/required).stat().st_size>0,'Missing full notice: '+required
 assert (ROOT/'LICENSE').is_file() and 'Permission is hereby granted' in (ROOT/'LICENSE').read_text(encoding='utf-8')
 print(json.dumps({'verified':True,'npm':len(actual),'shaderSources':len(report['shaders']),'ready':len(ready),'noticeSHA256Checked':verified,'modelSHA256':report['model']['sha256'],'networkRequests':False}))
def main():
 OUT.mkdir(exist_ok=True); rows=[]
 lock=json.loads((ROOT/'studio/package-lock.json').read_text(encoding='utf-8'))
 for name,item in lock['packages'].items():
  if not name or item.get('dev'):continue
  folder=ROOT/'studio'/name;meta=json.loads((folder/'package.json').read_text(encoding='utf-8'));notices=[]
  for p in folder.rglob('*'):
   if p.is_file() and (re.match(r'^(license|licence|notice|copying|copyright)(\.|$|-|_)',p.name,re.I) or re.search(r'third.?party.?notices',p.name,re.I)):notices.append(copy(p,Path('npm')/meta['name']/p.relative_to(folder)))
  assert notices,(name,'Missing full license')
  repository=meta.get('repository',{});repository=repository.get('url','') if isinstance(repository,dict) else repository
  rows.append({'name':meta['name'],'version':item['version'],'license':item['license'],'source':repository,'lockIntegrity':item['integrity'],'notices':notices})
 shaders=json.loads((WORK/'upstream-shaders.json').read_text(encoding='utf-8'));ready={s['id'] for s in json.loads((ROOT/'studio/effects/shaders/ready.json').read_text(encoding='utf-8'))}
 assert len(shaders)==424
 for s in shaders:
  s['ready']=s['id'] in ready;s['original']=copy(WORK/'upstream-shaders'/(s['id']+'.txt'),Path('shader-sources')/(s['id']+'.txt'))
  s['adaptation']='Motivelium extracts GLSL and normalizes inputs for WebGL2; original CREDIT, metadata and license comments retained here. Original and adapted source are both supplied.'
 for p in (ROOT/'www/shaders/licenses').iterdir():
  if p.is_file():copy(p,Path('shaders')/p.name)
 for s in shaders:
  if s['license']!='MIT':copy(WORK/'upstream-shaders'/(s['id']+'.txt'),Path('shaders')/(s['id']+'-full-notice.txt'))
 copy(WORK/'downloads/CC0-1.0.txt','models/CC0-1.0.txt');copy(ROOT/'www/models/ToyCar.README.md','models/ToyCar.README.md');copy(ROOT/'www/models/ToyCar.source.json','models/ToyCar.source.json')
 model=json.loads((ROOT/'www/models/ToyCar.source.json').read_text(encoding='utf-8'));assert sha(ROOT/'www/models/ToyCar.glb')==model['sha256']
 copy(ROOT/'lab/desktop-exe-20261020/downloads/NODE-LICENSE.txt','runtime/Node-24.12.0-LICENSE.txt');copy(ROOT/'lab/desktop-exe-20261020/downloads/sdk/LICENSE.txt','runtime/WebView2-SDK-1.0.4258.31-LICENSE.txt');copy(WORK/'tools/nsis-3.13/COPYING','installer/NSIS-3.13-COPYING.txt')
 copy(ROOT/'templates/SOURCES.md','media/template-sources.md')
 report={'format':'motivelium-third-party-inventory','version':1,'applicationVersion':'0.1.0-alpha.3','date':'2026-10-20','applicationLicense':'MIT','npm':rows,'shaders':shaders,'model':model,'runtime':{'node':'24.12.0; exact full license incl. vendored dependencies in licenses/runtime','webview2SDK':'1.0.4258.31; SDK redistributable DLLs, not the Evergreen runtime'},'installer':'NSIS 3.13, unmodified; zlib compression chosen; full COPYING retained','notBundled':['FFmpeg/FFprobe','Google Chrome/Chromium','WebView2 Evergreen Runtime','.NET Framework','Python','GSAP','legacy vendor Three.js 0.186.1','research clones, private projects and profiles'],'media':'Own procedural music without samples and generated illustrations; see licenses/media/template-sources.md. System fonts are referenced, not redistributed.'}
 (OUT/'manifest.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
 text=['# Сторонние компоненты Motivelium 0.1.0-alpha.3','','Собственный код — MIT (LICENSE). Эти условия не заменяют лицензии перечисленных компонентов. Полный машинный перечень с SHA-256, исходными URL и индивидуальными CREDIT — licenses/manifest.json.','','## Пакеты из production lockfile','', '| Пакет | Версия | Лицензия |','|---|---|---|']
 text += [f"| {r['name']} | {r['version']} | {r['license']} |"for r in rows]
 text += ['','Полные LICENSE/NOTICE каждого пакета, включая вложенные уведомления playwright-core, находятся в licenses/npm/. Apache NOTICE сохранён, если присутствует в пакете.','','## Шейдеры','','352 подключённых программы: GL Transitions121 (119MIT, одинBSD-3-Clause Hewlett-Packard, одинBSD-2-Clause Theodore K Schundler), ISF191 (MIT репозитория VIDVOX и встроенные авторские уведомления), Radiant40 (MIT Paul Bakaus). Ещё72 программы — заготовки адаптации, не список работающих эффектов. Все424 исходника из закреплённых commit сохранены в licenses/shader-sources/ вместе с оригинальными CREDIT и метаданными. Собственная адаптация явно отмечена в manifest.json. Кометный шлейф отдельно использует VIDVOX Comet Tails/MIT (licenses/shaders/VIDVOX-feedback-MIT.txt).','','Некоторые исходники ISF указывают на Shadertoy как на предшествующий источник. Здесь сохранены объявленная MIT коллекции и индивидуальные уведомления; наличие ссылки на Shadertoy не выдаётся за отдельное разрешение от автора оригинала. Это проверка заявленных условий полученных исходников, не гарантия прав на всю предысторию чужого кода.','','## Runtime, модели и материалы','','Node24.12.0 включает сторонний код под несколькими лицензиями: полный upstream LICENSE в licenses/runtime и runtime/node. WebView2 SDK DLL1.0.4258.31 — уведомление Microsoft в licenses/runtime и runtime/desktop. Evergreen Runtime и .NET предоставляются Microsoft отдельно.','','ToyCar — CC0-1.0; Guido Odendahl и Eric Chadwick; проверен SHA закреплённой модели. Полный CC0 и исходный README — licenses/models/. Другие исследованные модели, CAD и картинки из прошлых роликов в этот установщик не включены.','','Шаблоны: собственные программные сцены и синтезированная музыка без сторонних семплов, изображения image_gen. Их происхождение — licenses/media/template-sources.md. Системные шрифты не упакованы. Собственные материалы поставки разрешено использовать и менять вместе с шаблонами по MIT; права на пользовательские импорты этим не определяются.','','## Установщик и внешние программы','','NSIS3.13, без модификации движка; использовано zlib-сжатие, полный COPYING — licenses/installer/. [Условия NSIS](https://nsis.sourceforge.io/Docs/AppendixI.html). FFmpeg/FFprobe, Chrome/Chromium, Evergreen Runtime, .NET и Python не входят в установщик. Пользователь устанавливает их отдельно по собственным условиям. В частности, локальная тестовая GPL-сборка FFmpeg не переносится в дистрибутив.','','Устаревший GSAP из www/vendor исключён из runtime: новая студия его не импортирует. Прежний прототип в исходной рабочей папке сохраняет GSAP Standard License; MIT приложения на него не распространяется. Исследовательские ссылки и репозитории в research/lab не становятся частью MIT-кода Motivelium.','','Публичная публикация этого кандидата не выполнялась.']
 (ROOT/'THIRD_PARTY.md').write_text('\n'.join(text)+'\n',encoding='utf-8')
 (ROOT/'third-party.txt').write_text('Motivelium 0.1.0-alpha.3\nOwn code: MIT, see LICENSE.\nFull current third-party inventory: THIRD_PARTY.md and licenses/manifest.json.\nAll full license texts and preserved original shader notices: licenses/.\nLegacy www/vendor (not in installer): GSAP 3.14.2, GSAP Standard License; Three.js 0.186.1, MIT.\n',encoding='utf-8')
 print(json.dumps({'npm':len(rows),'shaderSources':len(shaders),'ready':len(ready),'modelSHA256':model['sha256'],'manifest':str(OUT/'manifest.json')}))
if __name__=='__main__':
 if sys.argv[1:]==['--verify']:verify()
 elif not sys.argv[1:]:main()
 else:raise SystemExit('Usage: license-report.py [--verify]')
