using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Text.RegularExpressions;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;
[assembly:AssemblyTitle("Motivelium")]
[assembly:AssemblyDescription("Студия программного видео")]
[assembly:AssemblyProduct("Motivelium")]
[assembly:AssemblyCompany("Motivelium")]
[assembly:AssemblyVersion("0.1.0.0")]
[assembly:AssemblyFileVersion("0.1.0.3")]
[assembly:AssemblyInformationalVersion("0.1.0-alpha.3")]
namespace MotiveliumDesktop {
 static class Program {
  internal static readonly string Root=Path.GetFullPath(AppDomain.CurrentDomain.BaseDirectory).TrimEnd(Path.DirectorySeparatorChar);
  internal static readonly string AppRoot=Path.Combine(Root,"app");
  internal static readonly bool Installed=File.Exists(Path.Combine(Root,"installed.json"));
  internal static readonly string DataRoot=GetDataRoot();
  static string GetDataRoot(){string value=Environment.GetEnvironmentVariable("MOTIVELIUM_DATA_DIR");if(value!=null){if(String.IsNullOrWhiteSpace(value)||!Path.IsPathRooted(value))throw new Exception("MOTIVELIUM_DATA_DIR должен содержать абсолютный путь.");return Path.GetFullPath(value);}if(!Installed)return Path.Combine(AppRoot,".local");var c=new System.Web.Script.Serialization.JavaScriptSerializer().Deserialize<System.Collections.Generic.Dictionary<string,object>>(File.ReadAllText(Path.Combine(Root,"installed.json")));bool qa=c.ContainsKey("qa")&&Convert.ToBoolean(c["qa"]);return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),qa?"Motivelium-QA":"Motivelium");}
  internal static string SelfTestFile;internal static bool SelfTest;internal static int ExitCode;
  [STAThread]static int Main(string[] args){
   for(int i=0;i<args.Length;i++){if(args[i]=="--self-test"&&i+1<args.Length){SelfTest=true;SelfTestFile=Path.GetFullPath(args[++i]);}else if(args[i]=="--qa-session"&&i+1<args.Length){QaSession.Load(args[++i]);SelfTest=true;SelfTestFile=QaSession.ResultFile;}else return 2;}
   SetDllDirectory(Path.Combine(Root,"runtime","desktop"));
   bool first;string id;using(var sha=SHA256.Create())id=BitConverter.ToString(sha.ComputeHash(Encoding.UTF8.GetBytes(Root.ToLowerInvariant()))).Replace("-","").Substring(0,24);
   using(var mutex=new Mutex(true,"Local\\Motivelium-"+id,out first)){
    if(!first){PostMessage((IntPtr)0xffff,RegisterWindowMessage("Motivelium.Activate."+id),IntPtr.Zero,IntPtr.Zero);return 0;}
    try{Application.EnableVisualStyles();Application.SetCompatibleTextRenderingDefault(false);Application.SetUnhandledExceptionMode(UnhandledExceptionMode.CatchException);Application.ThreadException+=(s,e)=>{ExitCode=1;RecordError(e.Exception);};using(var installedLock=Installed?new Mutex(false,"Local\\Motivelium.Installed.Alpha"):null){Application.Run(new StudioWindow(id));}}
    catch(Exception e){ExitCode=1;RecordError(e);}finally{mutex.ReleaseMutex();}
   }return ExitCode;
  }
  internal static void RecordError(Exception e){try{Directory.CreateDirectory(DataRoot);File.AppendAllText(Path.Combine(DataRoot,"desktop.log"),DateTime.Now.ToString("s")+" "+e+Environment.NewLine,Encoding.UTF8);}catch{}
   if(SelfTest){File.WriteAllText(SelfTestFile,new System.Web.Script.Serialization.JavaScriptSerializer().Serialize(new{success=false,error=e.Message}),Encoding.UTF8);Application.Exit();}
   else MessageBox.Show("Не удалось запустить Motivelium.\n\n"+e.Message+"\n\nПолный комплект должен быть распакован в папку с правом записи.","Motivelium",MessageBoxButtons.OK,MessageBoxIcon.Error);
  }
  [DllImport("user32.dll",CharSet=CharSet.Unicode)]internal static extern uint RegisterWindowMessage(string name);
  [DllImport("user32.dll")]static extern bool PostMessage(IntPtr handle,uint msg,IntPtr w,IntPtr l);
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode)]static extern bool SetDllDirectory(string directory);
 }
 sealed class StudioWindow : Form {
  readonly ServerHost server=new ServerHost(Program.AppRoot);readonly WebView2 web=new WebView2();readonly Label status=new Label();readonly Panel splash=new Panel();readonly uint activate;
  bool finishing,closing,loaded,downloading;TaskCompletionSource<bool> downloadProbe;System.Windows.Forms.Timer deadline,qaControl;
  public StudioWindow(string id){
   activate=Program.RegisterWindowMessage("Motivelium.Activate."+id);Text="Motivelium";Icon=Icon.ExtractAssociatedIcon(Application.ExecutablePath);ClientSize=new Size(1440,960);MinimumSize=new Size(1000,720);StartPosition=FormStartPosition.CenterScreen;WindowState=FormWindowState.Maximized;BackColor=Color.FromArgb(243,241,235);AutoScaleMode=AutoScaleMode.Dpi;
   web.Dock=DockStyle.Fill;web.DefaultBackgroundColor=BackColor;Controls.Add(web);splash.Dock=DockStyle.Fill;splash.BackColor=BackColor;Controls.Add(splash);
   var title=new Label{Text="motivelium.",Font=new Font("Segoe UI",38,FontStyle.Bold),ForeColor=Color.FromArgb(35,62,55),AutoSize=true,Location=new Point(80,100)};splash.Controls.Add(title);
   status.Text="Запускаем студию…";status.Font=new Font("Segoe UI",14);status.ForeColor=Color.FromArgb(73,95,83);status.AutoSize=true;status.Location=new Point(86,190);splash.Controls.Add(status);
   var bar=new ProgressBar{Style=ProgressBarStyle.Marquee,Location=new Point(86,240),Size=new Size(300,4)};splash.Controls.Add(bar);
   if(Program.SelfTest){Opacity=0;ShowInTaskbar=false;deadline=new System.Windows.Forms.Timer{Interval=QaSession.Enabled?900000:120000};deadline.Tick+=(s,e)=>Fail(new TimeoutException("Desktop self-test timed out"));deadline.Start();}
   Shown+=async(s,e)=>{try{await Initialize();}catch(Exception ex){Fail(ex);}};
   FormClosing+=async(s,e)=>{if(finishing)return;e.Cancel=true;if(closing)return;closing=true;
    try{bool draft=false;if(loaded){var answer=await web.ExecuteScriptAsync("(function(){const e=new Event('beforeunload',{cancelable:true});window.dispatchEvent(e);return e.defaultPrevented;})()");draft=answer=="true";}
     if(!Program.SelfTest&&(draft||downloading||server.OwnsServer&&server.HasRunningJobs())&&MessageBox.Show("Есть несохранённые поля или выполняется операция.\nЗакрытие остановит локальные задания этой копии.\n\nЗакрыть Motivelium?","Motivelium",MessageBoxButtons.YesNo,MessageBoxIcon.Question)!=DialogResult.Yes){closing=false;return;}
     finishing=true;Close();
    }catch{closing=false;}
   };
   FormClosed+=(s,e)=>{if(deadline!=null)deadline.Dispose();if(qaControl!=null)qaControl.Dispose();web.Dispose();server.Dispose();};
  }
  async Task Initialize(){
   await server.Start();status.Text="Открываем рабочее пространство…";
   try{CoreWebView2Environment.GetAvailableBrowserVersionString();}catch(Exception){throw new Exception("Нужен Microsoft Edge WebView2 Runtime. Установите его с https://developer.microsoft.com/microsoft-edge/webview2/ и повторите запуск.");}
   var env=await CoreWebView2Environment.CreateAsync(null,Path.Combine(Program.DataRoot,"webview2"),new CoreWebView2EnvironmentOptions("--no-proxy-server"+QaSession.BrowserArguments));
   await web.EnsureCoreWebView2Async(env);web.CoreWebView2.Settings.AreDevToolsEnabled=false;web.CoreWebView2.Settings.IsStatusBarEnabled=false;web.CoreWebView2.Settings.AreDefaultContextMenusEnabled=false;
   await web.CoreWebView2.AddScriptToExecuteOnDocumentCreatedAsync("document.addEventListener('click',e=>{const a=e.target.closest&&e.target.closest('a[download]');if(!a)return;const u=new URL(a.href,location.href);if(u.origin!==location.origin)return;const zip=/^\\/api\\/v1\\/project-packages\\/exports\\/[a-z0-9-]+\\/file$/.test(u.pathname);const mp4=/^\\/api\\/v1\\/projects\\/[a-z0-9-]+\\/video-exports\\/[a-z0-9-]+\\/file$/.test(u.pathname)&&u.search==='?download=1';if(zip||mp4){e.preventDefault();window.chrome.webview.postMessage({action:'save-export',url:u.href});}},true)");
   web.CoreWebView2.WebMessageReceived+=async(s,e)=>{try{var message=server.Json.Deserialize<System.Collections.Generic.Dictionary<string,object>>(e.WebMessageAsJson);Uri source,url;if(Uri.TryCreate(e.Source,UriKind.Absolute,out source)&&source.GetLeftPart(UriPartial.Authority)==server.Origin&&message.ContainsKey("action")&&Convert.ToString(message["action"])=="save-export"&&message.ContainsKey("url")&&Uri.TryCreate(Convert.ToString(message["url"]),UriKind.Absolute,out url))await SaveExport(url);}catch(Exception ex){if(Program.SelfTest&&downloadProbe!=null)downloadProbe.TrySetException(ex);else if(!finishing)MessageBox.Show(ex.Message,"Не удалось сохранить файл",MessageBoxButtons.OK,MessageBoxIcon.Error);}};
   web.CoreWebView2.NavigationStarting+=(s,e)=>{if(Program.SelfTest)File.AppendAllText(Program.SelfTestFile+".trace","navigate "+e.Uri+Environment.NewLine);Uri uri;if(!Uri.TryCreate(e.Uri,UriKind.Absolute,out uri)||uri.GetLeftPart(UriPartial.Authority)!=server.Origin){e.Cancel=true;}};
   web.CoreWebView2.NewWindowRequested+=(s,e)=>{e.Handled=true;Uri uri;if(Uri.TryCreate(e.Uri,UriKind.Absolute,out uri)&&(uri.Scheme=="https"||uri.Scheme=="http"))Process.Start(new ProcessStartInfo(uri.AbsoluteUri){UseShellExecute=true});};
   web.CoreWebView2.ProcessFailed+=(s,e)=>{if(!finishing)Fail(new Exception("Встроенный просмотр остановился. Сохранённые проекты остаются в папке данных. Перезапустите приложение."));};
   var nav=new TaskCompletionSource<bool>();web.CoreWebView2.NavigationCompleted+=(s,e)=>{if(e.IsSuccess)nav.TrySetResult(true);else nav.TrySetException(new Exception("Не загружена студия: "+e.WebErrorStatus));};
   web.Source=new Uri(server.Origin+"/studio/");await nav.Task;loaded=true;splash.Visible=false;web.Focus();
   if(QaSession.Enabled){QaSession.Ready(server,web.CoreWebView2.Environment.BrowserVersionString);qaControl=new System.Windows.Forms.Timer{Interval=200};qaControl.Tick+=(s,e)=>{if(File.Exists(Path.Combine(QaSession.ControlDir,"close.request"))){qaControl.Stop();Close();}};qaControl.Start();}
   else if(Program.SelfTest)await RunSelfTest();
  }
  async Task RunSelfTest(){
   var start=DateTime.UtcNow;while((DateTime.UtcNow-start).TotalSeconds<30){string value=await web.ExecuteScriptAsync("document.querySelectorAll('#root button').length>3");if(value=="true")break;await Task.Delay(100);}
   string title=await web.ExecuteScriptAsync("document.title"),body=await web.ExecuteScriptAsync("document.body.innerText"),draft=await web.ExecuteScriptAsync("(function(){const h=e=>e.preventDefault();window.addEventListener('beforeunload',h);const e=new Event('beforeunload',{cancelable:true});window.dispatchEvent(e);window.removeEventListener('beforeunload',h);return e.defaultPrevented;})()");
   if(!body.Contains("Проекты")||!title.Contains("Motivelium")||draft!="true")throw new Exception("Studio DOM or unsaved-close guard failed");
   web.Source=new Uri(server.Origin+"/studio/?section=templates");await Until("document.querySelectorAll('.template-card-preview canvas').length===3");await Task.Delay(1000);var shot=Path.ChangeExtension(Program.SelfTestFile,".png");using(var stream=File.Create(shot))await web.CoreWebView2.CapturePreviewAsync(CoreWebView2CapturePreviewImageFormat.Png,stream);
   // ExecuteScriptAsync does not await JS promises. Complete the asynchronous preparation explicitly.
   await web.ExecuteScriptAsync("window.__desktopProbe={};(async()=>{try{const w=await(await fetch('/api/v1/workspace')).json();const r=await fetch('/api/v1/templates/spectrum/1/projects',{method:'POST',headers:{'Content-Type':'application/json','x-motivelium-token':w.mutationToken},body:JSON.stringify({title:'Desktop native edit test',requestId:'native-edit-'+Date.now()})});const v=await r.json();window.__desktopProbe.id=v.project.id;}catch(e){window.__desktopProbe.error=String(e);}})()");
   await Until("!!window.__desktopProbe.id");string id=server.Json.Deserialize<string>(await web.ExecuteScriptAsync("window.__desktopProbe.id"));
   web.Source=new Uri(server.Origin+"/studio/?project="+id+"&frame=52");await Until("Array.from(document.querySelectorAll('button')).some(b=>b.getAttribute('aria-label')==='Материалы шаблона')");
   await web.ExecuteScriptAsync("document.querySelector('button[aria-label=\"Материалы шаблона\"]').click()");await Until("!!document.querySelector('textarea[aria-label=\"Главный заголовок\"]')");
   await web.ExecuteScriptAsync("(()=>{const t=document.querySelector('textarea[aria-label=\"Главный заголовок\"]');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(t,'ПРИЛОЖЕНИЕ.');t.dispatchEvent(new Event('input',{bubbles:true}));})()");
   await Until("Array.from(document.querySelectorAll('button')).some(b=>b.textContent==='Применить текст')");
   string actualGuard=await web.ExecuteScriptAsync("(()=>{const e=new Event('beforeunload',{cancelable:true});window.dispatchEvent(e);return e.defaultPrevented;})()");if(actualGuard!="true")throw new Exception("Actual unsaved text was not guarded");
   await web.ExecuteScriptAsync("Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Применить текст').click()");await Until("!Array.from(document.querySelectorAll('button')).some(b=>b.textContent==='Применить текст')");
   string savedGuard=await web.ExecuteScriptAsync("(()=>{const e=new Event('beforeunload',{cancelable:true});window.dispatchEvent(e);return e.defaultPrevented;})()");if(savedGuard!="false")throw new Exception("Saved state stayed dirty");
   await web.ExecuteScriptAsync("document.querySelector('button[aria-label=\"Отменить\"]').click()");await Until("document.querySelector('textarea[aria-label=\"Главный заголовок\"]').value!=='ПРИЛОЖЕНИЕ.'");
   downloadProbe=new TaskCompletionSource<bool>();string zip=Path.ChangeExtension(Program.SelfTestFile,".zip");
   await web.ExecuteScriptAsync("window.__desktopDownload=null;(async()=>{const p=await(await fetch('/api/v1/projects/"+id+"')).json();const v=await(await fetch('/api/v1/projects/"+id+"/packages',{method:'POST',headers:{'Content-Type':'application/json','x-motivelium-token':p.mutationToken},body:JSON.stringify({expectedRevision:p.project.revision})})).json();window.__desktopDownload=v.archive.downloadUrl;})()");
   await Until("typeof window.__desktopDownload==='string'");await web.ExecuteScriptAsync("(()=>{const a=document.createElement('a');a.href=window.__desktopDownload;a.download='native-test.zip';document.body.append(a);a.click();a.remove();})()");
   if(await Task.WhenAny(downloadProbe.Task,Task.Delay(20000))!=downloadProbe.Task)throw new Exception("Native ZIP download timed out");await downloadProbe.Task;
   if(!File.Exists(zip)||new FileInfo(zip).Length<1000)throw new Exception("Native ZIP file missing");
   File.WriteAllText(Program.SelfTestFile,server.Json.Serialize(new{success=true,root=Program.Root,origin=server.Origin,pid=server.Pid,ownedServer=server.OwnsServer,webview=web.CoreWebView2.Environment.BrowserVersionString,title=title,unsavedCloseGuard=true,actualDraftGuard=true,nativeApplyUndo=true,nativeZIPDownload=true,zip=zip,screenshot=shot}),Encoding.UTF8);
   finishing=true;Close();
  }
  async Task SaveExport(Uri uri){
   if(uri.GetLeftPart(UriPartial.Authority)!=server.Origin||downloading)throw new Exception("Недопустимый адрес скачивания или файл уже сохраняется.");
   bool zip=Regex.IsMatch(uri.AbsolutePath,@"^/api/v1/project-packages/exports/[a-z0-9-]{1,100}/file$")&&uri.Query=="";
   bool mp4=Regex.IsMatch(uri.AbsolutePath,@"^/api/v1/projects/[a-z0-9-]{1,100}/video-exports/[a-z0-9-]{1,100}/file$")&&uri.Query=="?download=1";
   if(!zip&&!mp4)throw new Exception("Можно сохранять только подготовленные ZIP и MP4 этой студии.");
   string destination;
   if(Program.SelfTest)destination=Path.ChangeExtension(Program.SelfTestFile,zip?".zip":".mp4");else{using(var dialog=new SaveFileDialog{FileName=zip?"Motivelium-проект.zip":"Motivelium-видео.mp4",Filter=zip?"Проект Motivelium (*.zip)|*.zip":"Видео MP4 (*.mp4)|*.mp4",AddExtension=true,OverwritePrompt=true,RestoreDirectory=true}){if(dialog.ShowDialog(this)!=DialogResult.OK)return;destination=dialog.FileName;}}
   string temp=destination+"."+Guid.NewGuid().ToString("N")+".partial";downloading=true;Text="Motivelium — сохранение файла…";
   try{var request=(HttpWebRequest)WebRequest.Create(uri);request.Proxy=null;request.AllowAutoRedirect=false;request.Timeout=30000;
    using(var response=(HttpWebResponse)await request.GetResponseAsync()){if(response.StatusCode!=HttpStatusCode.OK)throw new Exception("Студия не вернула готовый файл.");
     using(var source=response.GetResponseStream())using(var file=new FileStream(temp,FileMode.CreateNew,FileAccess.Write,FileShare.None,65536,true)){await source.CopyToAsync(file);if(response.ContentLength>=0&&file.Length!=response.ContentLength)throw new Exception("Файл получен не полностью.");}}
    if(File.Exists(destination))File.Replace(temp,destination,null);else File.Move(temp,destination);QaSession.Download(uri.AbsoluteUri,destination);if(downloadProbe!=null)downloadProbe.TrySetResult(true);
   }finally{downloading=false;Text="Motivelium";if(File.Exists(temp))File.Delete(temp);}
  }
  async Task Until(string predicate){var start=DateTime.UtcNow;while((DateTime.UtcNow-start).TotalSeconds<20){if(await web.ExecuteScriptAsync(predicate)=="true")return;await Task.Delay(100);}throw new Exception("Desktop UI wait failed: "+predicate);}
  void Fail(Exception e){Program.ExitCode=1;server.Dispose();Program.RecordError(e);if(!Program.SelfTest){splash.Visible=true;status.Text="Не удалось запустить студию. Подробности в "+Program.DataRoot+"/desktop.log.";}else{finishing=true;Close();}}
  protected override void WndProc(ref Message m){if(m.Msg==activate){if(WindowState==FormWindowState.Minimized)WindowState=FormWindowState.Normal;Show();Activate();}base.WndProc(ref m);}
 }
}
