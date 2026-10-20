/** 宿主固定启动器：新进程创建时即加入 Job，宿主或启动器退出时整组结束。 */
export const WINDOWS_JOB_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
$toolConfig = $(if ($env:TAU_PLUGIN_TOOL_CONFIG) { $env:TAU_PLUGIN_TOOL_CONFIG } else { [Console]::In.ReadToEnd() }) | ConvertFrom-Json
Remove-Item Env:TAU_PLUGIN_TOOL_CONFIG -ErrorAction SilentlyContinue
Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Runtime.InteropServices;
using System.ComponentModel;
public static class TauPluginJob {
  [StructLayout(LayoutKind.Sequential)] struct BasicLimits {
    public long ProcessTime, JobTime;
    public uint Flags;
    public UIntPtr Minimum, Maximum;
    public uint Active;
    public UIntPtr Affinity;
    public uint Priority, Scheduling;
  }
  [StructLayout(LayoutKind.Sequential)] struct Counters { public ulong A, B, C, D, E, F; }
  [StructLayout(LayoutKind.Sequential)] struct Limits {
    public BasicLimits Basic; public Counters Io;
    public UIntPtr ProcessMemory, JobMemory, PeakProcess, PeakJob;
  }
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)] struct Startup {
    public uint Size; public string Reserved, Desktop, Title;
    public uint X, Y, XSize, YSize, XCount, YCount, Fill, Flags;
    public ushort Show, ReservedSize; public IntPtr ReservedBytes, Stdin, Stdout, Stderr;
  }
  [StructLayout(LayoutKind.Sequential)] struct StartupEx { public Startup Info; public IntPtr Attributes; }
  [StructLayout(LayoutKind.Sequential)] struct ProcessInfo { public IntPtr Process, Thread; public uint Id, ThreadId; }
  [DllImport("kernel32.dll", SetLastError = true)] static extern IntPtr CreateJobObject(IntPtr security, string name);
  [DllImport("kernel32.dll", SetLastError = true)] static extern bool SetInformationJobObject(IntPtr job, int kind, ref Limits info, uint size);
  [DllImport("kernel32.dll", SetLastError = true)] static extern bool InitializeProcThreadAttributeList(IntPtr list, int count, int flags, ref IntPtr size);
  [DllImport("kernel32.dll", SetLastError = true)] static extern bool UpdateProcThreadAttribute(IntPtr list, uint flags, IntPtr attribute, IntPtr value, IntPtr size, IntPtr previous, IntPtr returned);
  [DllImport("kernel32.dll")] static extern void DeleteProcThreadAttributeList(IntPtr list);
  [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)] static extern bool CreateProcess(string application, StringBuilder command, IntPtr processSecurity, IntPtr threadSecurity, bool inherit, uint flags, IntPtr environment, string cwd, ref StartupEx startup, out ProcessInfo process);
  [DllImport("kernel32.dll")] static extern IntPtr GetStdHandle(int value);
  [DllImport("kernel32.dll", SetLastError = true)] static extern bool SetHandleInformation(IntPtr handle, uint mask, uint flags);
  [DllImport("kernel32.dll", SetLastError = true)] static extern IntPtr OpenProcess(uint access, bool inherit, uint id);
  [DllImport("kernel32.dll", SetLastError = true)] static extern uint WaitForMultipleObjects(uint count, IntPtr[] handles, bool all, uint timeout);
  [DllImport("kernel32.dll", SetLastError = true)] static extern bool GetExitCodeProcess(IntPtr process, out uint code);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
  static void Check(bool ok) { if (!ok) throw new Win32Exception(Marshal.GetLastWin32Error()); }
  static string Quote(string value) {
    var result = new StringBuilder("\""); int slashes = 0;
    foreach (char c in value) {
      if (c == '\\') { slashes++; continue; }
      if (c == '"') result.Append('\\', slashes * 2 + 1);
      else result.Append('\\', slashes);
      result.Append(c); slashes = 0;
    }
    return result.Append('\\', slashes * 2).Append('"').ToString();
  }
  public static int Run(string executable, string[] args, string cwd, uint parentId) {
    IntPtr job = IntPtr.Zero, parent = IntPtr.Zero, list = IntPtr.Zero, jobValue = IntPtr.Zero;
    ProcessInfo process = new ProcessInfo(); bool initialized = false;
    try {
      job = CreateJobObject(IntPtr.Zero, null); Check(job != IntPtr.Zero);
      var limits = new Limits(); limits.Basic.Flags = 0x2000;
      Check(SetInformationJobObject(job, 9, ref limits, (uint)Marshal.SizeOf(limits)));
      parent = OpenProcess(0x100000, false, parentId); Check(parent != IntPtr.Zero);
      IntPtr size = IntPtr.Zero;
      InitializeProcThreadAttributeList(IntPtr.Zero, 1, 0, ref size);
      list = Marshal.AllocHGlobal(size);
      Check(InitializeProcThreadAttributeList(list, 1, 0, ref size)); initialized = true;
      jobValue = Marshal.AllocHGlobal(IntPtr.Size); Marshal.WriteIntPtr(jobValue, job);
      Check(UpdateProcThreadAttribute(list, 0, new IntPtr(0x2000D), jobValue, new IntPtr(IntPtr.Size), IntPtr.Zero, IntPtr.Zero));
      var startup = new StartupEx(); startup.Info.Size = (uint)Marshal.SizeOf(startup);
      startup.Info.Flags = 0x100; startup.Attributes = list;
      startup.Info.Stdin = GetStdHandle(-10); startup.Info.Stdout = GetStdHandle(-11); startup.Info.Stderr = GetStdHandle(-12);
      foreach (var handle in new [] { startup.Info.Stdin, startup.Info.Stdout, startup.Info.Stderr }) Check(SetHandleInformation(handle, 1, 1));
      var command = new StringBuilder(Quote(executable));
      foreach (var arg in args) command.Append(' ').Append(Quote(arg));
      Check(CreateProcess(executable, command, IntPtr.Zero, IntPtr.Zero, true, 0x08080000, IntPtr.Zero, cwd, ref startup, out process));
      uint finished = WaitForMultipleObjects(2, new [] { process.Process, parent }, false, 0xffffffff);
      if (finished != 0) return 1;
      uint code; Check(GetExitCodeProcess(process.Process, out code)); return unchecked((int)code);
    } finally {
      if (job != IntPtr.Zero) CloseHandle(job);
      if (process.Thread != IntPtr.Zero) CloseHandle(process.Thread);
      if (process.Process != IntPtr.Zero) CloseHandle(process.Process);
      if (parent != IntPtr.Zero) CloseHandle(parent);
      if (initialized) DeleteProcThreadAttributeList(list);
      if (list != IntPtr.Zero) Marshal.FreeHGlobal(list);
      if (jobValue != IntPtr.Zero) Marshal.FreeHGlobal(jobValue);
    }
  }
}
'@
if ($toolConfig.env) { foreach ($property in $toolConfig.env.PSObject.Properties) { [Environment]::SetEnvironmentVariable($property.Name, [string]$property.Value, 'Process') } }
$toolExecutable = @(Get-Command -Name $toolConfig.command -CommandType Application -ErrorAction Stop)
if ($toolExecutable.Count -ne 1 -or [IO.Path]::GetExtension($toolExecutable[0].Source) -ine '.exe') { throw '外部工具必须解析到唯一的 EXE 文件' }
$toolArguments = [string[]]@($toolConfig.args)
exit [TauPluginJob]::Run($toolExecutable[0].Source, $toolArguments, $toolConfig.cwd, [uint32]$toolConfig.parentId)
`;
