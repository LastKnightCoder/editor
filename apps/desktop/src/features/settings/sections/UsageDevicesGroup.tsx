/**
 * 用量统计 · 跨设备同步 —— 各设备的调用记录经同步服务商互相汇总，统计里看到的是所有设备的合计。
 * 每台设备只上传自己的记录；换机 / 重装留下的旧设备可以在这里移除。
 */

import { useCallback, useEffect, useState } from "react";
import { Check, Pencil, RefreshCw, Trash2, X } from "lucide-react";
import { Button, ConfirmDialog, IconButton, Input, toast } from "@tau/ui";
import { getUsageSyncStatus, setUsageDeviceName } from "@/commands";
import type { UsageDeviceInfo, UsageSyncStatus } from "@/types/model-usage";
import useSettingStore from "@/stores/useSettingStore";
import { isSyncConfigured } from "@/utils/sync";
import { removeDeviceFromUsageSync, runUsageSync } from "@/services/usageSyncRunner";
import { SettingsGroup } from "../components/SettingsGroup";
import { StatusChip } from "../components/StatusChip";
import { ROW_DIVIDER } from "../components/rowDivider";
import { formatEventTime } from "./modelUsageData";

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

export function UsageDevicesGroup({ refreshToken }: { refreshToken: number }) {
  const sync = useSettingStore(state => state.setting.sync);
  const integration = useSettingStore(state => state.setting.integration);
  const configured = isSyncConfigured(sync.active, sync, integration);
  const [status, setStatus] = useState<UsageSyncStatus | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [removing, setRemoving] = useState<UsageDeviceInfo | null>(null);

  const refresh = useCallback(async () => {
    try {
      setStatus(await getUsageSyncStatus());
    } catch (error) {
      toast.error(`读取设备列表失败：${errorText(error)}`);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh, refreshToken]);

  const syncNow = async () => {
    setSyncing(true);
    try {
      const report = await runUsageSync();
      if (!report) {
        toast.error("同步失败，详情见下方状态");
      } else if (report.warnings.length > 0) {
        toast.warning(`部分设备同步失败：${report.warnings[0]}`);
      } else {
        toast.success(
          report.downloaded > 0
            ? `已同步，拉取 ${report.downloaded} 个分段`
            : "已同步，没有新的记录"
        );
      }
    } finally {
      setSyncing(false);
      void refresh();
    }
  };

  const self = status?.devices.find(device => device.isSelf) ?? null;
  const selfId = self?.deviceId ?? "";

  const description = !configured
    ? "在「同步」中配置同步服务后，多台设备的调用记录会汇总到一起"
    : status?.lastError
      ? `上次同步失败：${status.lastError}`
      : status?.lastSyncedAt
        ? `上次同步 ${formatEventTime(status.lastSyncedAt)} · 随数据库同步与启动时自动进行`
        : "尚未同步 · 随数据库同步与启动时自动进行";

  return (
    <SettingsGroup
      title="设备"
      description={description}
      action={
        configured ? (
          <Button
            size="sm"
            variant="ghost"
            icon={RefreshCw}
            loading={syncing}
            onClick={() => void syncNow()}
          >
            立即同步
          </Button>
        ) : undefined
      }
    >
      {!status ? (
        <p className="text-tau-meta text-ink-3 px-3 py-6 text-center">正在读取…</p>
      ) : (
        status.devices.map(device => (
          <DeviceRow
            key={device.deviceId}
            device={device}
            onRenamed={() => void refresh()}
            onRemove={configured && !device.isSelf ? () => setRemoving(device) : undefined}
          />
        ))
      )}
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={open => !open && setRemoving(null)}
        title="移除设备"
        context={removing?.name}
        danger
        description="该设备的调用记录会从所有设备的统计中移除。适用于换机或重装后留下的旧设备。"
        impact={
          removing
            ? `${removing.events.toLocaleString("en-US")} 条调用记录将不再计入统计`
            : undefined
        }
        confirmText="移除"
        onConfirm={async () => {
          if (!removing) return;
          try {
            await removeDeviceFromUsageSync(removing.deviceId, selfId);
            toast.success(`已移除「${removing.name}」`);
            setRemoving(null);
          } catch (error) {
            toast.error(`移除失败：${errorText(error)}`);
          } finally {
            void refresh();
          }
        }}
      />
    </SettingsGroup>
  );
}

function DeviceRow({
  device,
  onRenamed,
  onRemove,
}: {
  device: UsageDeviceInfo;
  onRenamed: () => void;
  onRemove?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(device.name);

  const save = async () => {
    const name = draft.trim();
    if (!name) {
      toast.warning("设备名不能为空");
      return;
    }
    try {
      await setUsageDeviceName(name);
      setEditing(false);
      onRenamed();
    } catch (error) {
      toast.error(`改名失败：${errorText(error)}`);
    }
  };

  return (
    <div className={`rounded-tau-sm flex min-h-14 items-center gap-3 px-3 py-2.5 ${ROW_DIVIDER}`}>
      <div className="min-w-0 flex-1">
        {editing ? (
          <div className="flex items-center gap-1.5">
            <Input
              size="sm"
              className="w-56"
              aria-label="本机设备名"
              value={draft}
              maxLength={64}
              autoFocus
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter") void save();
                if (e.key === "Escape") setEditing(false);
              }}
            />
            <IconButton aria-label="保存设备名" onClick={() => void save()}>
              <Check size={14} strokeWidth={1.75} />
            </IconButton>
            <IconButton aria-label="取消改名" onClick={() => setEditing(false)}>
              <X size={14} strokeWidth={1.75} />
            </IconButton>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-tau-body-lg text-ink-1 truncate font-medium">{device.name}</span>
            {device.isSelf && <StatusChip tone="accent">本机</StatusChip>}
          </div>
        )}
        <div className="text-tau-meta text-ink-2 mt-0.5 tabular-nums">
          {device.events.toLocaleString("en-US")} 次调用
          {device.lastTs ? ` · 最近 ${formatEventTime(device.lastTs)}` : ""}
        </div>
      </div>
      {device.isSelf && !editing && (
        <IconButton
          aria-label="修改本机设备名"
          onClick={() => {
            setDraft(device.name);
            setEditing(true);
          }}
        >
          <Pencil size={14} strokeWidth={1.75} />
        </IconButton>
      )}
      {onRemove && (
        <IconButton aria-label={`移除设备 ${device.name}`} onClick={onRemove}>
          <Trash2 size={14} strokeWidth={1.75} />
        </IconButton>
      )}
    </div>
  );
}
