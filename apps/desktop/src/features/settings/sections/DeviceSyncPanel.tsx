import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@tau/ui";
import { invoke } from "@/electron";
import { withModule } from "@/commands/module-init";
import useSettingStore from "@/stores/useSettingStore";
import { SettingsGroup } from "../components/SettingsGroup";

interface Status {
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
  const action = useMutation({
    mutationFn: async (kind: "enable" | "pause" | "pairing") => {
      if (kind === "pairing") {
        setPairing(await call("pairing"));
        return;
      }
      await call(kind);
      setPairing(undefined);
    },
    onSuccess: () => client.invalidateQueries({ queryKey: key }),
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
    action.error ??
    revoke.error ??
    exportCopy.error ??
    copies.error ??
    status.error ??
    status.data?.error;
  return (
    <SettingsGroup
      title="局域网设备同步（实验）"
      description="配对后自动同步正文、数据库修改与图片；手机重新打开后自动补齐。"
    >
      <div className="space-y-3 p-3">
        <p className="text-tau-meta text-ink-3">
          当前同步笔记、主库数据和笔记内附件；聊天记录文件与独立 PDF
          原件暂不包含，云端共享正文不能同时启用。
        </p>
        <p className="text-tau-body text-ink-2">
          {status.data?.enabled
            ? `正在等待已配对设备连接 · ${status.data.peers.length} 台设备`
            : "开启当前资料库的设备同步，然后在手机上粘贴配对信息。首次配对会在手机建立独立副本。"}
        </p>
        <div className="flex flex-wrap gap-2">
          {status.data?.enabled ? (
            <>
              <Button loading={action.isPending} onClick={() => action.mutate("pairing")}>
                生成配对信息
              </Button>
              <Button variant="ghost" onClick={() => action.mutate("pause")}>
                暂停局域网连接
              </Button>
            </>
          ) : (
            <Button loading={action.isPending} onClick={() => action.mutate("enable")}>
              开启设备同步
            </Button>
          )}
        </div>
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
