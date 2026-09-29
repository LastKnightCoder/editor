/**
 * 用量同步引擎：内存版同步服务商（不支持 list / delete，模拟最弱的后端）+ 内存版主进程侧，
 * 覆盖两台设备互拉、增量、移除设备、登记表被覆盖后自愈、远端损坏不中断整轮。
 */
import { describe, expect, it } from "vitest";
import type { IRemoteFileInfo, ISyncProvider } from "@/types/sync";
import type { UsageSegmentInfo } from "@/types/model-usage";
import {
  DEVICES_OBJECT,
  manifestObject,
  parseManifest,
  parseRegistry,
  removeUsageDevice,
  segmentObject,
  syncUsage,
  type UsageSyncBackend,
} from "../usageSync";

class MemoryProvider implements ISyncProvider {
  files = new Map<string, Uint8Array>();
  uploads: string[] = [];
  getProviderName() {
    return "memory";
  }
  async uploadFile(name: string, content: Uint8Array) {
    this.uploads.push(name);
    this.files.set(name, content);
    return true;
  }
  async createFileIfAbsent(name: string, content: Uint8Array) {
    if (this.files.has(name)) return false;
    return this.uploadFile(name, content);
  }
  async downloadFile(name: string) {
    const file = this.files.get(name);
    if (!file) throw new Error(`404 ${name}`);
    return file;
  }
  async fileExists(name: string) {
    return this.files.has(name);
  }
  async listFiles(): Promise<IRemoteFileInfo[]> {
    throw new Error("不应调用 listFiles");
  }
  async deleteFile(): Promise<boolean> {
    throw new Error("不应调用 deleteFile");
  }
  json(name: string) {
    return JSON.parse(new TextDecoder().decode(this.files.get(name)!));
  }
}

/** 主进程侧的内存替身：分段内容就是 "设备:月份:版本" 文本，哈希用它本身 */
class MemoryBackend implements UsageSyncBackend {
  own = new Map<string, string>();
  remote = new Map<string, Map<string, string>>();
  names: Record<string, string> = {};
  constructor(
    public deviceId: string,
    public deviceName: string
  ) {}
  setOwn(month: string, version: string) {
    this.own.set(month, `${this.deviceId}:${month}:${version}`);
  }
  hash(content: string) {
    return content
      .padEnd(64, "0")
      .slice(0, 64)
      .replace(/[^0-9a-f]/g, "a");
  }
  async localSegments() {
    const segments: UsageSegmentInfo[] = [...this.own.entries()]
      .sort()
      .map(([month, content]) => ({ month, count: 1, hash: this.hash(content) }));
    return { deviceId: this.deviceId, deviceName: this.deviceName, segments };
  }
  async exportSegment(month: string) {
    const content = this.own.get(month)!;
    return {
      data: new TextEncoder().encode(content),
      info: { month, count: 1, hash: this.hash(content) },
    };
  }
  async importSegment(input: { deviceId: string; month: string; hash: string; data: Uint8Array }) {
    const content = new TextDecoder().decode(input.data);
    if (this.hash(content) !== input.hash) throw new Error("哈希不一致");
    let device = this.remote.get(input.deviceId);
    if (!device) this.remote.set(input.deviceId, (device = new Map()));
    device.set(input.month, content);
    return { imported: 1, skipped: 0 };
  }
  async imported() {
    const result: Record<string, Record<string, string>> = {};
    for (const [deviceId, months] of this.remote) {
      result[deviceId] = Object.fromEntries(
        [...months.entries()].map(([month, content]) => [month, this.hash(content)])
      );
    }
    return result;
  }
  async drop(deviceId: string, month?: string) {
    if (month) this.remote.get(deviceId)?.delete(month);
    else this.remote.delete(deviceId);
  }
  async setDeviceNames(names: Record<string, string>) {
    Object.assign(this.names, names);
  }
}

const ID_A = "01K0000000000000000000000A";
const ID_B = "01K0000000000000000000000B";
const ID_C = "01K0000000000000000000000C";

describe("syncUsage", () => {
  it("两台设备各推各的、互相拉取，只用 upload / download / exists", async () => {
    const provider = new MemoryProvider();
    const a = new MemoryBackend(ID_A, "家里");
    const b = new MemoryBackend(ID_B, "公司");
    a.setOwn("2026-01", "v1");
    b.setOwn("2026-02", "v1");

    await syncUsage(provider, a);
    const reportB = await syncUsage(provider, b);
    expect(reportB.downloaded).toBe(1);
    expect(b.remote.get(ID_A)?.get("2026-01")).toBe(`${ID_A}:2026-01:v1`);
    expect(b.names[ID_A]).toBe("家里");

    const reportA = await syncUsage(provider, a);
    expect(reportA.downloaded).toBe(1);
    expect(a.remote.get(ID_B)?.get("2026-02")).toBe(`${ID_B}:2026-02:v1`);
    expect(
      parseRegistry(provider.json(DEVICES_OBJECT))
        .devices.map(d => d.deviceId)
        .sort()
    ).toEqual([ID_A, ID_B]);
  });

  it("没有变化时不上传、不下载；只有改动的月份会重传", async () => {
    const provider = new MemoryProvider();
    const a = new MemoryBackend(ID_A, "家里");
    a.setOwn("2026-01", "v1");
    a.setOwn("2026-02", "v1");
    await syncUsage(provider, a);

    provider.uploads = [];
    const idle = await syncUsage(provider, a);
    expect(idle.uploaded).toBe(0);
    expect(provider.uploads).toEqual([]);

    a.setOwn("2026-02", "v2");
    const changed = await syncUsage(provider, a);
    expect(changed.uploaded).toBe(1);
    expect(provider.uploads).toEqual([segmentObject(ID_A, "2026-02"), manifestObject(ID_A)]);
  });

  it("对方删掉某个月份后，本地副本跟着删", async () => {
    const provider = new MemoryProvider();
    const a = new MemoryBackend(ID_A, "家里");
    const b = new MemoryBackend(ID_B, "公司");
    a.setOwn("2026-01", "v1");
    a.setOwn("2026-02", "v1");
    await syncUsage(provider, a);
    await syncUsage(provider, b);
    a.own.delete("2026-01");
    await syncUsage(provider, a);
    const report = await syncUsage(provider, b);
    expect(report.dropped).toBe(1);
    expect([...b.remote.get(ID_A)!.keys()]).toEqual(["2026-02"]);
  });

  it("登记表被并发覆盖丢了本机：下一轮自动补回", async () => {
    const provider = new MemoryProvider();
    const a = new MemoryBackend(ID_A, "家里");
    const b = new MemoryBackend(ID_B, "公司");
    await syncUsage(provider, a);
    // 模拟 B 用旧表覆盖：表里只剩 B
    await provider.uploadFile(
      DEVICES_OBJECT,
      new TextEncoder().encode(
        JSON.stringify({ version: 1, devices: [{ deviceId: ID_B, name: "公司" }] })
      )
    );
    await syncUsage(provider, a);
    const ids = parseRegistry(provider.json(DEVICES_OBJECT))
      .devices.map(d => d.deviceId)
      .sort();
    expect(ids).toEqual([ID_A, ID_B]);
    void b;
  });

  it("移除设备：写墓碑、出登记表，其它设备同步时清掉它的记录", async () => {
    const provider = new MemoryProvider();
    const a = new MemoryBackend(ID_A, "家里");
    const b = new MemoryBackend(ID_B, "公司");
    const c = new MemoryBackend(ID_C, "旧电脑");
    c.setOwn("2026-01", "v1");
    await syncUsage(provider, c);
    await syncUsage(provider, a);
    await syncUsage(provider, b);
    expect(a.remote.has(ID_C)).toBe(true);

    await removeUsageDevice(provider, a, { deviceId: ID_C, selfDeviceId: ID_A });
    expect(a.remote.has(ID_C)).toBe(false);
    expect(parseManifest(provider.json(manifestObject(ID_C)), ID_C)?.removed).toBe(true);
    expect(
      parseRegistry(provider.json(DEVICES_OBJECT)).devices.some(d => d.deviceId === ID_C)
    ).toBe(false);

    const report = await syncUsage(provider, b);
    expect(report.dropped).toBe(1);
    expect(b.remote.has(ID_C)).toBe(false);
    await expect(
      removeUsageDevice(provider, a, { deviceId: ID_A, selfDeviceId: ID_A })
    ).rejects.toThrow("不能移除本机");
  });

  it("远端分段损坏：记为警告、其它设备照常同步，下轮重试", async () => {
    const provider = new MemoryProvider();
    const a = new MemoryBackend(ID_A, "家里");
    const b = new MemoryBackend(ID_B, "公司");
    const c = new MemoryBackend(ID_C, "笔记本");
    a.setOwn("2026-01", "v1");
    c.setOwn("2026-01", "v1");
    await syncUsage(provider, a);
    await syncUsage(provider, c);
    provider.files.set(segmentObject(ID_A, "2026-01"), new TextEncoder().encode("tampered"));

    const report = await syncUsage(provider, b);
    expect(report.warnings).toHaveLength(1);
    expect(report.downloaded).toBe(1);
    expect(b.remote.has(ID_A)).toBe(false);
    expect(b.remote.has(ID_C)).toBe(true);
  });

  it("远端登记表 / 清单里的非法条目被丢弃，不会拼进对象路径", () => {
    const registry = parseRegistry({
      devices: [{ deviceId: "../../etc" }, { deviceId: ID_A, name: 3 }, { deviceId: ID_A }, null],
    });
    expect(registry.devices).toEqual([{ deviceId: ID_A, name: "未命名设备", registeredAt: 0 }]);
    expect(parseManifest({ deviceId: ID_B }, ID_A)).toBeNull();
    expect(
      parseManifest(
        {
          deviceId: ID_A,
          segments: [
            { month: "../x", hash: "a".repeat(64) },
            { month: "2026-01", hash: "zz" },
          ],
        },
        ID_A
      )?.segments
    ).toEqual([]);
  });
});
