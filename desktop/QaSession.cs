// Explicit opt-in test session. Ordinary launches never open a debugging port.
using System;using System.IO;using System.Diagnostics;using System.Collections.Generic;using System.Web.Script.Serialization;
namespace MotiveliumDesktop {
 static class QaSession {
  public static bool Enabled;public static string ControlDir,ResultFile;public static int Port;
  public static void Load(string file){var c=new JavaScriptSerializer().Deserialize<Dictionary<string,object>>(File.ReadAllText(file));ControlDir=Path.GetFullPath(Convert.ToString(c["controlDir"]));ResultFile=Path.GetFullPath(Convert.ToString(c["resultFile"]));Port=Convert.ToInt32(c["debugPort"]);if(Port<1024||Port>65535)throw new Exception("Invalid QA port");Directory.CreateDirectory(ControlDir);Enabled=true;}
  public static string BrowserArguments {get{return Enabled?" --remote-debugging-address=127.0.0.1 --remote-debugging-port="+Port:"";}}
  public static void Ready(ServerHost server,string version){if(!Enabled)return;File.WriteAllText(ResultFile,new JavaScriptSerializer().Serialize(new{ready=true,origin=server.Origin,serverPid=server.Pid,desktopPid=Process.GetCurrentProcess().Id,ownsServer=server.OwnsServer,debugPort=Port,root=Program.Root,dataRoot=Program.DataRoot,installed=Program.Installed,webview=version}));}
  public static void Download(string url,string destination){if(!Enabled)return;File.WriteAllText(Path.Combine(ControlDir,"download-last.json"),new JavaScriptSerializer().Serialize(new{url=url,path=destination,bytes=new FileInfo(destination).Length,finishedAt=DateTime.UtcNow.ToString("o")}));}
 }
}
