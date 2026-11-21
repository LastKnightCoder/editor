import { execFile } from "node:child_process";
import { access } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import type { QwenHardwareReport } from "../../../../shared/local-transcription";
import { qwenExecutable, qwenRuntimeReady, qwenSupported } from "./runtime";
import { vulkanDevices, windowsAdapterReport } from "./gpu-inventory";

const execute = promisify(execFile);
export async function probeVulkanDevices(signal?: AbortSignal) {
  const { stdout } = await execute(qwenExecutable("gpu"), ["--list-devices", "--json"], {
    signal,
    windowsHide: true,
    timeout: 20000,
  });
  return vulkanDevices(JSON.parse(stdout));
}

const readControllers = `
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$rows = @(Get-CimInstance -ClassName Win32_VideoController -OperationTimeoutSec 5 | ForEach-Object {
  $vendor = if ($_.PNPDeviceID -match '^PCI\\\\VEN_([0-9A-F]{4})') { $Matches[1] } else { '' }
  [PSCustomObject]@{ Name = $_.Name; Vendor = $vendor; ConfigManagerErrorCode = $_.ConfigManagerErrorCode; InfFilename = $_.InfFilename }
})
ConvertTo-Json -InputObject $rows -Compress
`;

async function systemInventory() {
  const system32 = path.join(process.env.SystemRoot || "C:\\Windows", "System32");
  const [result, loader] = await Promise.all([
    execute(
      path.join(system32, "WindowsPowerShell/v1.0/powershell.exe"),
      ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", readControllers],
      { windowsHide: true, timeout: 8000 }
    ),
    access(path.join(system32, "vulkan-1.dll")).then(
      () => true,
      () => false
    ),
  ]);
  return windowsAdapterReport(JSON.parse(result.stdout.trim()), loader);
}

export async function detectQwenHardware(): Promise<QwenHardwareReport> {
  if (process.platform !== "win32" || !qwenSupported()) return { state: "unknown", names: [] };
  let installedResult: "cpu" | "unknown" | undefined;
  if (await qwenRuntimeReady("gpu")) {
    try {
      const devices = await probeVulkanDevices();
      if (devices.length)
        return { state: "verified", names: devices.map(device => device.description) };
      installedResult = "cpu";
    } catch {
      installedResult = "unknown";
    }
  }
  try {
    const system = await systemInventory();
    return installedResult ? { state: installedResult, names: system.names } : system;
  } catch {
    return { state: installedResult ?? "unknown", names: [] };
  }
}
