import { useState, useSyncExternalStore } from "react";
import { GroupCard, GroupNote } from "../components/ui";
import { ActionButton } from "../storage/fields";
import {
  getDeviceSyncStatus,
  pairDevice,
  subscribeDeviceSyncStatus,
  downloadDeviceLibrary,
} from "../../../services/device-sync/runtime";
import { wakeDeviceSync } from "../../../services/device-sync/native";
export function DeviceSyncSection() {
  const status = useSyncExternalStore(subscribeDeviceSyncStatus, getDeviceSyncStatus);
  const [code, setCode] = useState(""),
    [busy, setBusy] = useState(false);
  const pair = async () => {
    setBusy(true);
    try {
      await pairDevice(code);
      setCode("");
    } finally {
      setBusy(false);
    }
  };
  const download = async () => {
    setBusy(true);
    try {
      await downloadDeviceLibrary();
    } finally {
      setBusy(false);
    }
  };
  const text =
    status.phase === "syncing"
      ? "正在同步"
      : status.phase === "synced"
        ? "已自动补齐"
        : status.phase === "offline"
          ? "等待配对电脑回到局域网"
          : status.phase === "error"
            ? "同步暂未完成"
            : "粘贴电脑上的配对信息，建立自动同步";
  return (
    <section className="space-y-3">
      <h3 className="text-tau-body text-ink-1 px-1 font-semibold">局域网设备同步（实验）</h3>
      <GroupCard>
        <div className="space-y-3 p-4">
          <p className="text-tau-body text-ink-2">{text}</p>
          <label htmlFor="mobile-device-pairing" className="text-tau-meta text-ink-3">
            电脑设置 → 同步 → 生成配对信息
          </label>
          <textarea
            id="mobile-device-pairing"
            value={code}
            onChange={event => setCode(event.target.value)}
            rows={3}
            className="bg-page text-ink-1 text-tau-body rounded-tau-sm w-full p-3"
            placeholder="粘贴配对信息"
          />
          <div className="flex gap-2">
            <ActionButton
              label="配对并同步"
              emphasis
              busy={busy}
              disabled={busy || !code.trim()}
              onClick={() => {
                void pair().catch(() => {});
              }}
            />
            <ActionButton
              label="立即补齐"
              emphasis={false}
              disabled={busy}
              onClick={wakeDeviceSync}
            />
          </div>
          <GroupNote>
            下载覆盖会丢弃当前库的本地修改、缓存、草稿和撤销记录，以电脑版本为准。
          </GroupNote>
          <ActionButton
            label="下载电脑版本并覆盖本机"
            emphasis={false}
            busy={busy}
            disabled={busy || status.phase === "idle"}
            onClick={() => {
              void download().catch(() => {});
            }}
          />
          {status.error && (
            <p role="alert" className="text-tau-meta text-danger">
              {status.error}
            </p>
          )}
          {status.preservedCopies > 0 && (
            <p className="text-tau-meta text-warn">
              已保留 {status.preservedCopies}{" "}
              份冲突副本，可在配对电脑的同步设置中查看；同步继续使用当前资料库。
            </p>
          )}
          {status.pendingAssets > 0 && (
            <p className="text-tau-meta text-warn">
              {status.pendingAssets} 个附件等待补齐，正文可以继续编辑。
            </p>
          )}
        </div>
      </GroupCard>
      <GroupNote>
        配对会建立独立资料库副本。手机回到前台、重新联网时自动补齐，不需要手动选择资料库。聊天记录文件与独立
        PDF 原件暂不包含。
      </GroupNote>
    </section>
  );
}
