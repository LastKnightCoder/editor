/** 局域网设备同步的数据层：状态查询、动作 mutation 与覆盖后的重载提示；视图见 DeviceSyncPanel */

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { produce } from "immer";
import { toast } from "@tau/ui";
import { describeDeviceSyncError } from "@tau/collaboration/src/device-sync/messages";
import { invoke } from "@/electron";
import { withModule } from "@/commands/module-init";
import useSettingStore from "@/stores/useSettingStore";

export interface DeviceSyncStatus {
  role: "coordinator" | "replica" | "unpaired";
  /** 只有连接端有 */
  phase?: "idle" | "syncing" | "synced" | "offline" | "error";
  pendingAssets: number;
  enabled: boolean;
  database: string;
  /** 已授权设备，不代表在线 */
  peers: { id: string; name: string }[];
  lastSync?: number;
  error?: string;
  branches: number;
  noteCopies: number;
}
export interface DeviceSyncCopy {
  id: string;
  reason: string;
  kind: "library" | "note";
}
export interface DevicePairing {
  code: string;
  expires: number;
}

export const SCOPE_TEXT =
  "同步笔记、标签、数据库修改和正文里的图片；聊天记录、独立 PDF 原件、插件与账号设置不在其中。";
export const NOT_ALL_ONLINE = "设备不必同时在线，每台连上协调电脑时各自补齐。";

export function formatSince(time: number | undefined, now = Date.now()) {
  if (!time) return undefined;
  const diff = Math.max(0, now - time);
  if (diff < 60_000) return "刚刚";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  const date = new Date(time);
  const hhmm = `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  return date.toDateString() === new Date(now).toDateString()
    ? `今天 ${hhmm}`
    : `${date.getMonth() + 1} 月 ${date.getDate()} 日 ${hhmm}`;
}

export const callDeviceSync = <T>(method: string, ...args: unknown[]) =>
  withModule("device-sync", () => invoke<T>(`device-sync:${method}`, ...args));

export function useDeviceSyncModel() {
  const name = useSettingStore(state => state.setting.database.active);
  const client = useQueryClient();
  const key = ["device-sync", name];
  const refresh = () => client.invalidateQueries({ queryKey: key });
  const status = useQuery({
    queryKey: key,
    queryFn: () => callDeviceSync<DeviceSyncStatus>("status"),
    refetchOnWindowFocus: true,
    refetchInterval: 3000,
  });
  const [pairing, setPairing] = useState<DevicePairing>();
  const generate = useMutation({
    mutationFn: () => callDeviceSync<DevicePairing>("pairing"),
    onSuccess: setPairing,
  });
  const enable = useMutation({
    mutationFn: () => callDeviceSync("enable"),
    onSuccess: async () => {
      await refresh();
      // 协调端刚开启时直接给出第一份配对信息
      if (status.data?.role !== "replica") generate.mutate();
    },
  });
  const pause = useMutation({
    mutationFn: () => callDeviceSync("pause"),
    onSuccess: () => {
      setPairing(undefined);
      return refresh();
    },
  });
  const sync = useMutation({ mutationFn: () => callDeviceSync("sync"), onSettled: refresh });
  const pair = useMutation({
    mutationFn: (code: string) => callDeviceSync<{ database: string }>("pair", code.trim()),
    onSuccess: result => {
      useSettingStore.setState(state => ({
        setting: produce(state.setting, draft => {
          if (!draft.database.databases.some(db => db.name === result.database))
            draft.database.databases.push({ name: result.database, version: 1 });
          if (draft.database.active === name) draft.database.active = result.database;
        }),
      }));
      void client.invalidateQueries({ queryKey: ["device-sync"] });
    },
  });
  const revoke = useMutation({
    mutationFn: (id: string) => callDeviceSync("revoke", id),
    onSuccess: refresh,
  });
  const download = useMutation({
    mutationFn: async () => {
      markDeviceDownload(name, status.data?.error);
      try {
        await callDeviceSync("download");
      } finally {
        clearDeviceDownload();
      }
    },
    onSettled: refresh,
  });
  return {
    name,
    status,
    pairing,
    setPairing,
    generate,
    enable,
    pause,
    sync,
    pair,
    revoke,
    download,
  };
}
export type DeviceSyncModel = ReturnType<typeof useDeviceSyncModel>;

export function useDeviceSyncCopies(enabled: boolean) {
  const name = useSettingStore(state => state.setting.database.active);
  const copies = useQuery({
    queryKey: ["device-sync", name, "copies"],
    queryFn: () => callDeviceSync<DeviceSyncCopy[]>("copies"),
    enabled,
    refetchOnWindowFocus: true,
  });
  const exportCopy = useMutation({
    mutationFn: (copy: DeviceSyncCopy) => callDeviceSync<string>("export-copy", copy.id, copy.kind),
    onSuccess: () => toast.success("已在文件管理器中显示"),
  });
  return { copies, exportCopy };
}

/** 配对信息剩余有效期，每秒刷新；过期后返回 0 */
export function useRemaining(expires?: number) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!expires) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [expires]);
  return expires ? Math.max(0, expires - now) : 0;
}

/** 已配对数增加时回调新设备名：对方粘贴成功后，协调端据此收起配对引导 */
export function usePeerJoined(
  peers: DeviceSyncStatus["peers"] | undefined,
  onJoin: (name: string) => void
) {
  const known = useRef<Set<string>>(undefined);
  useEffect(() => {
    if (!peers) return;
    const previous = known.current;
    known.current = new Set(peers.map(peer => peer.id));
    if (!previous) return;
    const joined = peers.find(peer => !previous.has(peer.id));
    if (joined) onJoin(joined.name);
  }, [peers, onJoin]);
}

// 覆盖成功时主进程会重载持有该库的窗口，渲染端拿不到 IPC 返回；用会话存储把结果带过重载
const DOWNLOAD_MARK = "tau:device-sync:download";
function markDeviceDownload(database: string, previousError?: string) {
  sessionStorage.setItem(
    DOWNLOAD_MARK,
    JSON.stringify({ database, previousError, at: Date.now() })
  );
}
function clearDeviceDownload() {
  sessionStorage.removeItem(DOWNLOAD_MARK);
}

/** 壳层挂载一次：覆盖导致的窗口重载后，告诉用户结果 */
export function useDeviceDownloadNotice() {
  useEffect(() => {
    const raw = sessionStorage.getItem(DOWNLOAD_MARK);
    if (!raw) return;
    clearDeviceDownload();
    let mark: { database?: string; previousError?: string; at?: number };
    try {
      mark = JSON.parse(raw);
    } catch {
      return;
    }
    if (!mark.at || Date.now() - mark.at > 10 * 60_000) return;
    let disposed = false;
    // 等新窗口连上资料库后再读结果
    const timer = setTimeout(() => {
      void callDeviceSync<DeviceSyncStatus>("status")
        .then(status => {
          if (disposed) return;
          if (status.error && status.error !== mark.previousError)
            toast.error(
              `下载没有完成，资料库已恢复原样：${describeDeviceSyncError(status.error).title}`
            );
          else toast.success("已换成协调电脑的版本，原资料库已备份到 backup 文件夹");
        })
        .catch(() => undefined);
    }, 1500);
    return () => {
      disposed = true;
      clearTimeout(timer);
    };
  }, []);
}
