"""Build an explicit user-started verifier. It never starts ordinary installation."""
from pathlib import Path
import subprocess,argparse,shutil,json,hashlib
ROOT=Path(__file__).resolve().parents[1]
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def main():
 parser=argparse.ArgumentParser();parser.add_argument('--out',required=True);parser.add_argument('--candidate',required=True,help='Build folder with installer-manifest.json');parser.add_argument('--previous-run',help='Exact successful prior verifier result; permits only its unchanged alpha.2 installation');args=parser.parse_args();out=Path(args.out).resolve();assert not out.exists();out.mkdir(parents=True)
 old=ROOT/'Поставки/2026-10-20_R6_установщик';new=Path(args.candidate).resolve();recipe={'format':'motivelium-normal-windows-check','suiteId':'motivelium-r6-normal-windows-20261020-alpha2-unelevated-v2','requiresUserStart':True,'requiresUnelevated':True,'publicRelease':False}
 for key,folder in [('old',old),('candidate',new)]:
  meta=json.loads((folder/'installer-manifest.json').read_text(encoding='utf-8'));setup=folder/meta['setup']['name'];assert sha(setup)==meta['setup']['sha256'];target=out/'Установщики'/setup.name;target.parent.mkdir(exist_ok=True);shutil.copy2(setup,target)
  manifest=out/'Манифесты'/(key+'.json');manifest.parent.mkdir(exist_ok=True);shutil.copy2(folder/'installer-manifest.json',manifest)
  recipe[key]={'version':meta['version'],'file':str(target.relative_to(out)).replace('\\','/'),'sha256':sha(target),'manifest':str(manifest.relative_to(out)).replace('\\','/')}
 if args.previous_run:
  previous=Path(args.previous_run).resolve();receipt=json.loads(previous.read_text(encoding='utf-8-sig'));assert receipt['success'] is True and receipt['qaInstall'] is False and receipt['registeredVersion']=='0.1.0-alpha.2'
  target=out/'previous-run.json';shutil.copy2(previous,target);recipe['previousRun']={'file':target.name,'sha256':sha(target),'runId':receipt['runId']}
 (out/'windows-check.json').write_text(json.dumps(recipe,ensure_ascii=False,indent=2),encoding='utf-8')
 compiler='C:/Windows/Microsoft.NET/Framework64/v4.0.30319/csc.exe';exe=out/'Проверить-установку-Motivelium.exe'
 subprocess.run([compiler,'/nologo','/utf8output','/target:winexe','/platform:x64','/optimize+','/out:'+str(exe),'/win32manifest:'+str(ROOT/'desktop/app.manifest'),'/win32icon:'+str(ROOT/'desktop/Motivelium.ico'),'/reference:System.dll','/reference:System.Core.dll','/reference:System.Windows.Forms.dll','/reference:System.Drawing.dll','/reference:System.Web.Extensions.dll',str(ROOT/'desktop/InstallerVerification.cs')],check=True)
 shutil.copy2(ROOT/'desktop/InstallerVerification.cs',out/'InstallerVerification.cs')
 (out/'Прочти-меня.md').write_text('''# Проверка обычной установки Motivelium в Windows

Откройте «Проверить-установку-Motivelium.exe» **двойным щелчком из Проводника** и нажмите «Начать проверку». **Не выбирайте «Запуск от имени администратора».** При повышенном токене EXE остановится до изменения установки. Уровень прав записывается в result.json. Файлы в папках «Установщики» и «Манифесты» должны оставаться рядом с программой проверки.

Будут выполнены: установка alpha.1 в стандартную папку пользователя → проверка настоящей регистрации HKCU и ярлыка «Пуска» → запуск этого ярлыка без тестовых аргументов → создание своего проверочного проекта с изображением и музыкой → закрытие только собственного экземпляра → обновление до alpha.2 → проверка проекта → удаление программы → проверка сохранности всех файлов проектов → повторная установка alpha.2 и проверка проекта.

Проверка не использует /QA, перенаправление пользовательского хранилища, повышение прав, планировщик задач, изменения ACL или защитных настроек. Если включена закреплённая квитанция прошлого успешного прогона, разрешается повторить на его неизменённой alpha.2: проверяются путь, регистрация, SHA всех файлов программы, граф и ресурсы прежнего проверочного проекта. В этом случае alpha.2 сначала заменяется на alpha.1 для проверки обновления; отдельное удаление пользователем не требуется. Все прежние проекты сравниваются по SHA до и после. Изменённая или чужая установка не заменяется. Без квитанции допускается только пустая папка без зарегистрированной программы. Если установка не завершится, следующие действия не выполняются. Проекты не удаляются. Исходники проверяющего кода лежат рядом.

После успешного прогона alpha.2 остаётся установленной; студия доступна в меню «Пуск», проверочный проект остаётся в списке. Отчёты — «Результаты-Windows/latest.json» и новый каталог каждого запуска. Они содержат версии, хеши и статусы; ключи ИИ и чужие проекты не выгружаются. Сообщите здесь, что проверка завершилась: Codex прочитает свежий протокол и сверит результат.

Важная граница: программа создаёт проверочный проект через API собственного запущенного сервера. Запуск приложения идёт через настоящий Windows-ярлык; редактирование мышью в этом прогоне не имитируется. Внешняя установка из этого пакета ещё не считается пройденной до появления свежего успешного отчёта. Публичной публикации нет. EXE и установщики не подписаны.
''',encoding='utf-8')
 print(json.dumps({'out':str(out),'verifier':str(exe),'sha256':sha(exe),'requiresUserStart':True,'publicRelease':False},ensure_ascii=False))
if __name__=='__main__':main()
