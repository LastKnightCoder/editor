/**
 * 命令执行环境的选定（M3-g）：设置里填的 shell 优先，但坏路径必须让位给自动检测——
 * 否则 pi 拿着不存在的路径起 bash，用户只看到一个没有说明的失败。
 */
import { describe, expect, it } from "vitest";
import { resolveAgentShellPath } from "../pi-session-host-core";

const exists = (present: string[]) => (path: string) => present.includes(path);

describe("AI 执行命令用的 shell", () => {
  it("用户填的路径存在时优先于自动检测", () => {
    expect(
      resolveAgentShellPath({
        configured: "D:\\tools\\Git\\bin\\bash.exe",
        detected: "C:\\Program Files\\Git\\bin\\bash.exe",
        exists: exists(["D:\\tools\\Git\\bin\\bash.exe"]),
      })
    ).toEqual({ path: "D:\\tools\\Git\\bin\\bash.exe" });
  });

  it("填的路径不存在时退回自动检测，并报出被忽略的值（用于日志/界面提示）", () => {
    expect(
      resolveAgentShellPath({
        configured: "D:\\moved\\bash.exe",
        detected: "C:\\Program Files\\Git\\bin\\bash.exe",
        exists: exists([]),
      })
    ).toEqual({
      path: "C:\\Program Files\\Git\\bin\\bash.exe",
      ignoredConfigured: "D:\\moved\\bash.exe",
    });
  });

  it("留空即自动检测；两者都没有则不给路径（pi 走 PowerShell 兜底）", () => {
    expect(resolveAgentShellPath({ detected: "C:\\git\\bash.exe", exists: exists([]) })).toEqual({
      path: "C:\\git\\bash.exe",
    });
    expect(resolveAgentShellPath({ exists: exists([]) })).toEqual({});
    expect(resolveAgentShellPath({ configured: "   ", exists: exists([]) })).toEqual({});
  });

  it("前后空格不影响判定（手工粘贴路径常带空格）", () => {
    expect(
      resolveAgentShellPath({
        configured: "  C:\\git\\bash.exe  ",
        exists: exists(["C:\\git\\bash.exe"]),
      })
    ).toEqual({ path: "C:\\git\\bash.exe" });
  });
});
