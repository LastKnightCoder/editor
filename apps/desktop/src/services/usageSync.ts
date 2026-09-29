/**
 * 模型用量跨设备同步（渲染端：网络走同步服务商，打包 / 导入交主进程）。
 *
 * 远端布局（同步服务商配置的根目录下）：
 *   usage/devices.json                  设备登记表，唯一多方写入的文件，只在注册 / 改名 / 移除时写
 *   usage/<deviceId>/manifest.json      该设备的分段清单，只由该设备写
 *   usage/<deviceId>/<YYYY-MM>.ndjson.gz 该设备该 UTC 月的全部事件
 *
 * 只用 uploadFile / downloadFile / fileExists，不依赖 listFiles：以后接入不支持列目录的
 * 后端也不用改。每个对象只有一个写入者（devices.json 除外），不需要锁与版本号。
 * devices.json 两台设备同时注册可能互相覆盖：每次同步都检查本机在不在表里，不在就重新合并写回，
 * 最坏晚一轮被别的设备看到；分段一直在自己目录里，数据不会丢。
 */
import type { ISyncProvider } from "@/types/sync";
import type {
  UsageDeviceManifest,
  UsageDeviceRegistry,
  UsageLocalSegments,
  UsageSegmentInfo,
} from "@/types/model-usage";

export const USAGE_ROOT = "usage";
export const DEVICES_OBJECT = `${USAGE_ROOT}/devices.json`;
export const manifestObject = (deviceId: string) => `${USAGE_ROOT}/${deviceId}/manifest.json`;
export const segmentObject = (deviceId: string, month: string) =>
  `${USAGE_ROOT}/${deviceId}/${month}.ndjson.gz`;

const DEVICE_ID = /^[0-9A-HJKMNP-TV-Z]{26}$/;
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const HASH = /^[0-9a-f]{64}$/;

/** 主进程侧能力（IPC）；抽成接口方便单测注入 */
export interface UsageSyncBackend {
  localSegments(): Promise<UsageLocalSegments>;
  exportSegment(month: string): Promise<{ data: Uint8Array; info: UsageSegmentInfo }>;
  importSegment(input: {
    deviceId: string;
    month: string;
    hash: string;
    data: Uint8Array;
  }): Promise<{ imported: number; skipped: number }>;
  imported(): Promise<Record<string, Record<string, string>>>;
  drop(deviceId: string, month?: string): Promise<void>;
  setDeviceNames(names: Record<string, string>): Promise<void>;
}

export interface UsageSyncReport {
  uploaded: number;
  downloaded: number;
  dropped: number;
  devices: number;
  /** 单个远端设备 / 分段失败不中断整轮，记在这里 */
  warnings: string[];
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const toJson = (value: unknown) => encoder.encode(`${JSON.stringify(value, null, 2)}\n`);

async function readJson(provider: ISyncProvider, objectName: string): Promise<unknown | null> {
  if (!(await provider.fileExists(objectName))) return null;
  const data = await provider.downloadFile(objectName);
  return JSON.parse(decoder.decode(data));
}

async function upload(provider: ISyncProvider, objectName: string, data: Uint8Array) {
  if (!(await provider.uploadFile(objectName, data))) {
    throw new Error(`上传 ${objectName} 失败`);
  }
}

/** 远端登记表按不可信输入解析：格式不对的条目丢弃，整个文件坏了当作空表 */
export function parseRegistry(raw: unknown): UsageDeviceRegistry {
  const devices: UsageDeviceRegistry["devices"] = [];
  const list = (raw as { devices?: unknown })?.devices;
  if (Array.isArray(list)) {
    const seen = new Set<string>();
    for (const item of list) {
      const { deviceId, name, registeredAt } = (item ?? {}) as Record<string, unknown>;
      if (typeof deviceId !== "string" || !DEVICE_ID.test(deviceId) || seen.has(deviceId)) continue;
      seen.add(deviceId);
      devices.push({
        deviceId,
        name: typeof name === "string" && name.trim() ? name.slice(0, 128) : "未命名设备",
        registeredAt: typeof registeredAt === "number" ? registeredAt : 0,
      });
    }
  }
  return { version: 1, devices };
}

export function parseManifest(raw: unknown, deviceId: string): UsageDeviceManifest | null {
  const r = (raw ?? {}) as Record<string, unknown>;
  if (r.deviceId !== deviceId) return null;
  const segments: UsageSegmentInfo[] = [];
  if (Array.isArray(r.segments)) {
    for (const item of r.segments) {
      const { month, count, hash } = (item ?? {}) as Record<string, unknown>;
      if (typeof month !== "string" || !MONTH.test(month)) continue;
      if (typeof hash !== "string" || !HASH.test(hash)) continue;
      segments.push({ month, hash, count: typeof count === "number" && count >= 0 ? count : 0 });
    }
  }
  return {
    version: 1,
    deviceId,
    name: typeof r.name === "string" && r.name.trim() ? r.name.slice(0, 128) : "未命名设备",
    updatedAt: typeof r.updatedAt === "number" ? r.updatedAt : 0,
    removed: r.removed === true,
    segments,
  };
}

/**
 * 登记表写回：本机不在表里、或名字变了才写。先重新读一次再合并，缩小与其它设备并发注册的窗口。
 */
async function ensureRegistered(
  provider: ISyncProvider,
  self: { deviceId: string; name: string },
  registry: UsageDeviceRegistry
): Promise<UsageDeviceRegistry> {
  const entry = registry.devices.find(device => device.deviceId === self.deviceId);
  if (entry && entry.name === self.name) return registry;
  const latest = parseRegistry(await readJson(provider, DEVICES_OBJECT));
  const others = latest.devices.filter(device => device.deviceId !== self.deviceId);
  const next: UsageDeviceRegistry = {
    version: 1,
    devices: [
      ...others,
      {
        deviceId: self.deviceId,
        name: self.name,
        registeredAt: entry?.registeredAt ?? Date.now(),
      },
    ],
  };
  await upload(provider, DEVICES_OBJECT, toJson(next));
  return next;
}

/** 一轮完整同步：先推本机，再拉其它设备 */
export async function syncUsage(
  provider: ISyncProvider,
  backend: UsageSyncBackend
): Promise<UsageSyncReport> {
  const report: UsageSyncReport = {
    uploaded: 0,
    downloaded: 0,
    dropped: 0,
    devices: 0,
    warnings: [],
  };
  const local = await backend.localSegments();
  const self = { deviceId: local.deviceId, name: local.deviceName };

  /* ── 推本机：只传哈希变了的分段，最后写清单（清单是分段存在的唯一依据） ── */
  const remoteSelf = parseManifest(
    await readJson(provider, manifestObject(self.deviceId)),
    self.deviceId
  );
  const remoteHashes = new Map(remoteSelf?.segments.map(s => [s.month, s.hash]) ?? []);
  for (const segment of local.segments) {
    if (remoteHashes.get(segment.month) === segment.hash) continue;
    const { data } = await backend.exportSegment(segment.month);
    await upload(provider, segmentObject(self.deviceId, segment.month), data);
    report.uploaded += 1;
  }
  const manifestChanged =
    !remoteSelf ||
    remoteSelf.removed ||
    remoteSelf.name !== self.name ||
    remoteSelf.segments.length !== local.segments.length ||
    report.uploaded > 0;
  if (manifestChanged) {
    const manifest: UsageDeviceManifest = {
      version: 1,
      deviceId: self.deviceId,
      name: self.name,
      updatedAt: Date.now(),
      segments: local.segments,
    };
    await upload(provider, manifestObject(self.deviceId), toJson(manifest));
  }

  /* ── 登记：本机不在表里就补上 ── */
  const registry = await ensureRegistered(
    provider,
    self,
    parseRegistry(await readJson(provider, DEVICES_OBJECT))
  );

  /* ── 拉其它设备 ── */
  const imported = await backend.imported();
  const listed = new Set<string>();
  const names: Record<string, string> = {};
  for (const device of registry.devices) {
    if (device.deviceId === self.deviceId) continue;
    listed.add(device.deviceId);
    try {
      const manifest = parseManifest(
        await readJson(provider, manifestObject(device.deviceId)),
        device.deviceId
      );
      // 登记了但还没写清单（对方首轮同步中途失败）：跳过，下轮再看
      if (!manifest) continue;
      if (manifest.removed) {
        if (imported[device.deviceId]) {
          await backend.drop(device.deviceId);
          report.dropped += 1;
        }
        continue;
      }
      names[device.deviceId] = manifest.name || device.name;
      report.devices += 1;
      const have = imported[device.deviceId] ?? {};
      const remoteMonths = new Set(manifest.segments.map(s => s.month));
      for (const segment of manifest.segments) {
        if (have[segment.month] === segment.hash) continue;
        try {
          const data = await provider.downloadFile(segmentObject(device.deviceId, segment.month));
          await backend.importSegment({
            deviceId: device.deviceId,
            month: segment.month,
            hash: segment.hash,
            data,
          });
          report.downloaded += 1;
        } catch (error) {
          report.warnings.push(`${manifest.name} ${segment.month}：${errorText(error)}`);
        }
      }
      // 对方清单里已经没有的月份：本地副本跟着删
      for (const month of Object.keys(have)) {
        if (!remoteMonths.has(month)) {
          await backend.drop(device.deviceId, month);
          report.dropped += 1;
        }
      }
    } catch (error) {
      report.warnings.push(`${device.name}：${errorText(error)}`);
    }
  }
  await backend.setDeviceNames(names);

  // 本地导入过、但已不在登记表里的设备（被别的设备移除）：清掉
  for (const deviceId of Object.keys(imported)) {
    if (deviceId !== self.deviceId && !listed.has(deviceId)) {
      await backend.drop(deviceId);
      report.dropped += 1;
    }
  }
  return report;
}

/**
 * 移除一台设备（换机 / 重装后留下的旧设备）：清单改写成墓碑、从登记表去掉。
 * 分段文件不删——不少同步服务商不支持删除，墓碑足以让所有设备忽略并清掉本地副本。
 */
export async function removeUsageDevice(
  provider: ISyncProvider,
  backend: UsageSyncBackend,
  target: { deviceId: string; selfDeviceId: string }
): Promise<void> {
  if (!DEVICE_ID.test(target.deviceId)) throw new Error("无效的设备 id");
  if (target.deviceId === target.selfDeviceId) throw new Error("不能移除本机");
  const tombstone: UsageDeviceManifest = {
    version: 1,
    deviceId: target.deviceId,
    name: "",
    updatedAt: Date.now(),
    removed: true,
    segments: [],
  };
  await upload(provider, manifestObject(target.deviceId), toJson(tombstone));
  const registry = parseRegistry(await readJson(provider, DEVICES_OBJECT));
  if (registry.devices.some(device => device.deviceId === target.deviceId)) {
    await upload(
      provider,
      DEVICES_OBJECT,
      toJson({
        version: 1,
        devices: registry.devices.filter(device => device.deviceId !== target.deviceId),
      })
    );
  }
  await backend.drop(target.deviceId);
}

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));
