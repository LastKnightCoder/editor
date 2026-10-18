// @vitest-environment node
import { expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
vi.mock("electron", () => ({ app: {}, net: {} }));
import { PluginCenterVisitor } from "../plugin-center-visitor";

it("并发只申请一次，重启复用安装级凭证，文件限制为当前用户读取", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "tau-visitor-"));
  try {
    const file = path.join(directory, "visitor.json"),
      origin = "https://plugins.example";
    const token = "a".repeat(72);
    const fetch = vi.fn(async () => Response.json({ data: { visitorId: "v1", token } }));
    const instance = new PluginCenterVisitor(file, origin, fetch);
    expect(await Promise.all([instance.token(), instance.token()])).toEqual([token, token]);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(await new PluginCenterVisitor(file, origin, fetch).token()).toBe(token);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(JSON.parse(await readFile(file, "utf8")).origin).toBe(origin);
    if (process.platform !== "win32") expect((await stat(file)).mode & 0o777).toBe(0o600);
    await expect(
      new PluginCenterVisitor(file, "https://different.example", fetch).token()
    ).rejects.toThrow("无效");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

it("申请失败后可重试，不缓存失败结果", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "tau-visitor-"));
  try {
    const fetch = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(Response.json({ data: { token: "b".repeat(72) } }));
    const instance = new PluginCenterVisitor(
      path.join(directory, "v.json"),
      "https://plugins.example",
      fetch
    );
    await expect(instance.token()).rejects.toThrow("offline");
    expect(await instance.token()).toBe("b".repeat(72));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

it("两个主进程竞争创建时使用同一份已落盘凭证，不覆盖获胜身份", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "tau-visitor-"));
  try {
    const file = path.join(directory, "v.json"),
      origin = "https://plugins.example";
    let count = 0;
    const fetch = vi.fn(async () => Response.json({ data: { token: String(++count).repeat(72) } }));
    const tokens = await Promise.all([
      new PluginCenterVisitor(file, origin, fetch).token(),
      new PluginCenterVisitor(file, origin, fetch).token(),
    ]);
    expect(tokens[0]).toBe(tokens[1]);
    expect(JSON.parse(await readFile(file, "utf8")).token).toBe(tokens[0]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
