using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Sockets;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading.Tasks;
using System.Web.Script.Serialization;

namespace MotiveliumDesktop {
 sealed class ServerHost : IDisposable {
  public readonly string Root;
  public string Origin { get; private set; }
  public bool OwnsServer { get; private set; }
  public int Pid { get; private set; }
  public readonly JavaScriptSerializer Json = new JavaScriptSerializer { MaxJsonLength=1024*1024 };
  Process child; StreamWriter log; IntPtr job;DateTime startedAt;
  public ServerHost(string root) { Root=Path.GetFullPath(root).TrimEnd(Path.DirectorySeparatorChar); }
  public static string Quote(string s) { return "\""+s.Replace("\"","\\\"")+"\""; }
  public async Task<Dictionary<string,object>> Get(string route) {
   var req=(HttpWebRequest)WebRequest.Create(Origin+route); req.Proxy=null;req.Timeout=1500;req.ReadWriteTimeout=1500;
   var pending=req.GetResponseAsync();if(await Task.WhenAny(pending,Task.Delay(2000))!=pending){req.Abort();throw new TimeoutException("Local health timed out");}
   using(var response=await pending) using(var reader=new StreamReader(response.GetResponseStream(),Encoding.UTF8)) return Json.Deserialize<Dictionary<string,object>>(await reader.ReadToEndAsync());
  }
  public async Task<bool> Ready() {
   try { var h=await Get("/api/health");var root=Path.GetFullPath(Convert.ToString(h["root"])).TrimEnd(Path.DirectorySeparatorChar);
    if(!h.ContainsKey("dataRoot")||!String.Equals(Path.GetFullPath(Convert.ToString(h["dataRoot"])),Program.DataRoot,StringComparison.OrdinalIgnoreCase)||!String.Equals(root,Root,StringComparison.OrdinalIgnoreCase)||!h.ContainsKey("studioReady")||!Convert.ToBoolean(h["studioReady"])||Convert.ToString(h["application"])!="workshop-live-lab")return false;
    var api=await Get("/api/v1/health");if(Convert.ToString(api["application"])!="motivelium-studio")return false;
    Pid=Convert.ToInt32(h["pid"]);return true;
   } catch { return false; }
  }
  public async Task Start() {
   Directory.CreateDirectory(Program.DataRoot);
   var test=Path.Combine(Program.DataRoot,"write-"+Guid.NewGuid().ToString("N"));File.WriteAllText(test,"");File.Delete(test);
   string node=Path.Combine(Program.Root,"runtime","node","node.exe");if(!File.Exists(node))throw new Exception("В комплекте нет runtime/node/node.exe. Распакуйте всю папку приложения.");
   Origin="http://127.0.0.1:8676";if(await Ready())return;
   // Reuse a server previously started by this copy, even when 8676 belongs to another copy.
   var state=Path.Combine(Program.DataRoot,"desktop-server.json");int preferred=8676;
   try { var saved=Json.Deserialize<Dictionary<string,object>>(File.ReadAllText(state));int port=Convert.ToInt32(saved["port"]);if(port>0&&port<65536){preferred=port;Origin="http://127.0.0.1:"+port;if(await Ready())return;} } catch {}
   // Keep the origin (and browser preferences) stable when this copy's old port is free.
   // If another process owns it, choose a free port without touching that process.
   int selected=preferred;var listener=new TcpListener(IPAddress.Loopback,selected);try{listener.Start();}catch(SocketException){listener=new TcpListener(IPAddress.Loopback,0);listener.Start();selected=((IPEndPoint)listener.LocalEndpoint).Port;}listener.Stop();Origin="http://127.0.0.1:"+selected;
   job=CreateJobObject(IntPtr.Zero,null);if(job==IntPtr.Zero)throw new Exception("Не удалось создать контейнер локального процесса.");
   var info=new JobExtended();info.Basic.LimitFlags=0x2000;
   int size=Marshal.SizeOf(info);IntPtr ptr=Marshal.AllocHGlobal(size);try{Marshal.StructureToPtr(info,ptr,false);if(!SetInformationJobObject(job,9,ptr,(uint)size))throw new Exception("Не удалось настроить завершение локального процесса.");}finally{Marshal.FreeHGlobal(ptr);}
   log=new StreamWriter(Path.Combine(Program.DataRoot,"desktop-server.log"),true,new UTF8Encoding(false)){AutoFlush=true};
   var start=new ProcessStartInfo(node,Quote(Path.Combine(Root,"server.mjs"))){WorkingDirectory=Root,UseShellExecute=false,CreateNoWindow=true,RedirectStandardOutput=true,RedirectStandardError=true};
   start.EnvironmentVariables["PORT"]=selected.ToString();start.EnvironmentVariables["MOTIVELIUM_DATA_DIR"]=Program.DataRoot;start.EnvironmentVariables.Remove("NODE_PATH");start.EnvironmentVariables.Remove("NODE_OPTIONS");
   child=new Process {StartInfo=start,EnableRaisingEvents=true};
   child.OutputDataReceived+=(s,e)=>WriteLog(e.Data);child.ErrorDataReceived+=(s,e)=>WriteLog(e.Data);
   startedAt=DateTime.UtcNow;child.Start();OwnsServer=true;Pid=child.Id;
   if(!AssignProcessToJobObject(job,child.Handle)){child.Kill();throw new Exception("Не удалось изолировать локальный сервер. Он остановлен.");}
   child.BeginOutputReadLine();child.BeginErrorReadLine();
   for(int i=0;i<100;i++){if(child.HasExited)throw new Exception("Локальный сервер завершился при запуске. Подробности: .local/desktop-server.log");if(await Ready()){
     if(Pid!=child.Id)throw new Exception("Порт успела занять другая программа. Повторите запуск.");
     File.WriteAllText(state,Json.Serialize(new {port=selected,pid=Pid,root=Root}),Encoding.UTF8);return;
    }await Task.Delay(100);}
   throw new Exception("Локальный сервер не подтвердил готовность. Подробности: .local/desktop-server.log");
  }
  void WriteLog(string s){if(s==null)return;lock(this){if(log!=null)try{log.WriteLine(s);}catch(ObjectDisposedException){}}}
  public bool HasRunningJobs() {
   foreach(var category in new[]{"video-exports","ai-edits"}){string dir=Path.Combine(Program.DataRoot,category);if(!Directory.Exists(dir))continue;
    foreach(var file in Directory.EnumerateFiles(dir,"job.json",SearchOption.AllDirectories).Take(1024))try{if(File.GetLastWriteTimeUtc(file)<startedAt)continue;var data=Json.Deserialize<Dictionary<string,object>>(File.ReadAllText(file));string status=Convert.ToString(data["status"]);if(new[]{"preparing","rendering","mixing","verifying","running","cancelling"}.Contains(status))return true;}catch{}
   }return false;
  }
  public void Dispose(){if(job!=IntPtr.Zero){CloseHandle(job);job=IntPtr.Zero;}if(child!=null){try{if(!child.HasExited)child.Kill();}catch{}child.Dispose();child=null;}lock(this){if(log!=null){log.Dispose();log=null;}}}
  [StructLayout(LayoutKind.Sequential)] struct JobBasic {public long PerProcessUserTimeLimit,PerJobUserTimeLimit;public uint LimitFlags;public UIntPtr MinimumWorkingSetSize,MaximumWorkingSetSize;public uint ActiveProcessLimit;public UIntPtr Affinity;public uint PriorityClass,SchedulingClass;}
  [StructLayout(LayoutKind.Sequential)]struct IoCounters{public ulong ReadOperationCount,WriteOperationCount,OtherOperationCount,ReadTransferCount,WriteTransferCount,OtherTransferCount;}
  [StructLayout(LayoutKind.Sequential)]struct JobExtended{public JobBasic Basic;public IoCounters Io;public UIntPtr ProcessMemoryLimit,JobMemoryLimit,PeakProcessMemoryUsed,PeakJobMemoryUsed;}
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode)]static extern IntPtr CreateJobObject(IntPtr attributes,string name);
  [DllImport("kernel32.dll")]static extern bool SetInformationJobObject(IntPtr job,int kind,IntPtr value,uint size);
  [DllImport("kernel32.dll")]static extern bool AssignProcessToJobObject(IntPtr job,IntPtr process);
  [DllImport("kernel32.dll")]static extern bool CloseHandle(IntPtr handle);
 }
}
