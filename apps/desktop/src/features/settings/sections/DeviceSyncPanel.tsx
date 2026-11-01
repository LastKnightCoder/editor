import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, ConfirmDialog, toast } from "@tau/ui";
import { produce } from "immer";
import { invoke } from "@/electron";
import { withModule } from "@/commands/module-init";
import useSettingStore from "@/stores/useSettingStore";
import { SettingsGroup } from "../components/SettingsGroup";

interface Status {
  role: "coordinator" | "replica" | "unpaired";
  phase?: "idle" | "syncing" | "synced" | "offline" | "error";
  pendingAssets: number;
  enabled: boolean;
  database: string;
  peers: { id: string; name: string }[];
  lastSync?: number;
  error?: string;
  branches: number;
  noteCopies: number;
}
const call = <T,>(method: string, ...args: unknown[]) =>
  withModule("device-sync", () => invoke<T>(`device-sync:${method}`, ...args));
export function DeviceSyncPanel() {
  const name = useSettingStore(state => state.setting.database.active);
  const client = useQueryClient(),
    key = ["device-sync", name];
  const status = useQuery({
    queryKey: key,
    queryFn: () => call<Status>("status"),
    refetchOnWindowFocus: true,
    refetchInterval: 3000,
  });
  const [pairing, setPairing] = useState<{ code: string; expires: number }>();
  const [code, setCode] = useState("");
  const [downloadOpen, setDownloadOpen] = useState(false);
  const isReplica = status.data?.role === "replica";
  const action = useMutation({
    mutationFn: async (kind: "enable" | "pause" | "pairing" | "sync" | "download") => {
      if (kind === "pairing") {
        setPairing(await call("pairing"));
        return;
      }
      await call(kind);
      setPairing(undefined);
    },
    onSuccess: () => client.invalidateQueries({ queryKey: key }),
  });
  const pair = useMutation({
    mutationFn: () => call<{ database: string }>("pair", code),
    onSuccess: result => {
      setCode("");
      useSettingStore.setState(state => ({
        setting: produce(state.setting, draft => {
          if (!draft.database.databases.some(db => db.name === result.database))
            draft.database.databases.push({ name: result.database, version: 1 });
          if (draft.database.active === name) draft.database.active = result.database;
        }),
      }));
      void client.invalidateQueries({ queryKey: ["device-sync"] });
      toast.success("已配对，设备将自动补齐");
    },
  });
  const revoke = useMutation({
    mutationFn: (id: string) => call("revoke", id),
    onSuccess: () => client.invalidateQueries({ queryKey: key }),
  });
  const copies = useQuery({
    queryKey: [...key, "copies"],
    queryFn: () => call<{ id: string; reason: string; kind: string }[]>("copies"),
    enabled: Boolean(status.data?.branches || status.data?.noteCopies),
    refetchOnWindowFocus: true,
  });
  const exportCopy = useMutation({
    mutationFn: (copy: { id: string; kind: string }) => call("export-copy", copy.id, copy.kind),
  });
  const failure =
    pair.error ??
    action.error ??
    revoke.error ??
    exportCopy.error ??
    copies.error ??
    status.error ??
    status.data?.error;
  return (
    <SettingsGroup
      title="局域网设备同步（实验）"
      description="一台电脑协调，其他电脑和手机配对后自动同步正文、数据库修改与图片。"
    >
      <div className="space-y-3 p-3">
        <p className="text-tau-meta text-ink-3">
          当前同步笔记、主库数据和笔记内附件；聊天记录文件与独立 PDF
          原件暂不包含，云端共享正文不能同时启用。
        </p>
        <p className="text-tau-body text-ink-2">
          {isReplica
            ? status.data?.phase === "synced"
              ? "已自动补齐"
              : status.data?.phase === "syncing"
                ? "正在同步"
                : status.data?.phase === "offline"
                  ? "等待协调电脑回到局域网，本机仍可编辑"
                  : status.data?.enabled
                    ? "将自动连接协调电脑并补齐"
                    : "已暂停自动连接，本机仍可编辑"
            : status.data?.enabled
              ? `正在等待已配对设备连接 · ${status.data.peers.length} 台设备`
              : "将本机设为协调电脑，或粘贴另一台电脑的配对信息建立独立本机副本。"}
        </p>
        <div className="flex flex-wrap gap-2">
          {status.data?.enabled ? (
            <>
              <Button
                loading={action.isPending}
                onClick={() => action.mutate(isReplica ? "sync" : "pairing")}
              >
                {isReplica ? "立即补齐" : "生成配对信息"}
              </Button>
              <Button variant="ghost" onClick={() => action.mutate("pause")}>
                暂停局域网连接
              </Button>
            </>
          ) : (
            <Button loading={action.isPending} onClick={() => action.mutate("enable")}>
              {isReplica ? "恢复自动连接" : "作为协调电脑开启同步"}
            </Button>
          )}
        </div>
        {!status.data?.enabled && (
          <div className="space-y-2">
            <label htmlFor="desktop-device-pairing" className="text-tau-meta text-ink-2">
              连接协调电脑
            </label>
            <textarea
              id="desktop-device-pairing"
              value={code}
              onChange={event => setCode(event.target.value)}
              rows={3}
              placeholder="粘贴协调电脑生成的配对信息"
              className="bg-page text-ink-1 text-tau-meta rounded-tau-sm w-full p-2"
            />
            <Button
              variant="secondary"
              loading={pair.isPending}
              disabled={!code.trim() || action.isPending}
              onClick={() => pair.mutate()}
            >
              配对并建立本机副本
            </Button>
          </div>
        )}
        {isReplica && (
          <>
            <Button
              variant="ghost"
              disabled={!status.data?.enabled || action.isPending}
              onClick={() => setDownloadOpen(true)}
            >
              下载协调电脑版本并覆盖本机
            </Button>
            <ConfirmDialog
              open={downloadOpen}
              onOpenChange={setDownloadOpen}
              title="下载并覆盖当前资料库"
              context={name}
              danger
              description="以协调电脑版本为准，丢弃当前库的本地修改、待同步任务、缓存、草稿和撤销记录。账号、配对信息及其他资料库不受影响。"
              confirmText="下载并覆盖"
              onConfirm={async () => {
                await action.mutateAsync("download");
                setDownloadOpen(false);
              }}
            />
          </>
        )}
        {Boolean(status.data?.pendingAssets) && (
          <p className="text-tau-meta text-warn">
            {status.data?.pendingAssets} 个附件等待补齐，正文可以继续编辑。
          </p>
        )}
        {pairing && (
          <div className="space-y-2">
            <label className="text-tau-meta text-ink-2" htmlFor="device-pairing">
              配对信息，{new Date(pairing.expires).toLocaleTimeString()} 过期；只发给自己的设备
            </label>
            <textarea
              id="device-pairing"
              readOnly
              value={pairing.code}
              className="bg-page text-ink-2 text-tau-meta rounded-tau-sm w-full p-2"
              rows={3}
            />
            <Button
              variant="secondary"
              onClick={() => void navigator.clipboard.writeText(pairing.code)}
            >
              复制配对信息
            </Button>
          </div>
        )}
        {status.data?.peers.map(peer => (
          <div key={peer.id} className="flex items-center justify-between gap-2">
            <span className="text-tau-body text-ink-1">{peer.name}</span>
            <Button
              variant="ghost"
              disabled={revoke.isPending}
              onClick={() => revoke.mutate(peer.id)}
            >
              解除配对
            </Button>
          </div>
        ))}
        {Boolean(status.data?.branches || status.data?.noteCopies) && (
          <p className="text-tau-meta text-warn">
            已保留 {status.data?.branches ?? 0} 份资料库分支、{status.data?.noteCopies ?? 0}{" "}
            份笔记副本；日常同步继续使用当前资料库。
          </p>
        )}
        {copies.data?.map(copy => (
          <div key={copy.id} className="flex items-center justify-between gap-2">
            <span className="text-tau-meta text-ink-2">{copy.reason}</span>
            <Button
              variant="ghost"
              loading={exportCopy.isPending}
              onClick={() => exportCopy.mutate(copy)}
            >
              保存副本供查看
            </Button>
          </div>
        ))}
        {failure && (
          <p role="alert" className="text-tau-meta text-danger">
            {String(failure)}
          </p>
        )}
      </div>
    </SettingsGroup>
  );
}
