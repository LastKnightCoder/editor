/**
 * 用量统计 · 跨设备同步 —— 各设备的调用记录经同步服务商互相汇总，统计里看到的是所有设备的合计。
 * 每台设备只上传自己的记录；换机 / 重装留下的旧设备可以在这里移除。
 */

import { llmText, llmValue, llmFormat, useLlmSettingsI18n } from "./llm.i18n";
import { useCallback, useEffect, useState } from "react";
import { Check, Pencil, RefreshCw, Trash2, X } from "lucide-react";
import { ROW_DIVIDER, Button, ConfirmDialog, IconButton, Input, toast } from "@tau/ui";
import { getUsageSyncStatus, setUsageDeviceName } from "@/commands";
import type { UsageDeviceInfo, UsageSyncStatus } from "@/types/model-usage";
import useSettingStore from "@/stores/useSettingStore";
import { isSyncConfigured } from "@/utils/sync";
import { removeDeviceFromUsageSync, runUsageSync } from "@/services/usageSyncRunner";
import { SettingsGroup } from "../components/SettingsGroup";
import { StatusChip } from "../components/StatusChip";

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

export function UsageDevicesGroup({ refreshToken }: { refreshToken: number }) {
  useLlmSettingsI18n();

  const sync = useSettingStore(state => state.setting.sync);
  const configured = isSyncConfigured(sync.active, sync);
  const [status, setStatus] = useState<UsageSyncStatus | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [removing, setRemoving] = useState<UsageDeviceInfo | null>(null);

  const refresh = useCallback(async () => {
    try {
      setStatus(await getUsageSyncStatus());
    } catch (error) {
      toast.error(llmText("message.couldNotLoadDevices", { error: llmValue(errorText(error)) }));
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
        toast.error(llmText("ui.syncFailedSeeTheStatusBelowFor"));
      } else if (report.warnings.length > 0) {
        toast.warning(
          llmText("message.someDevicesFailedToSync", { error: llmValue(report.warnings[0]) })
        );
      } else {
        toast.success(
          report.downloaded > 0
            ? llmText("message.syncedDownloadedSegments", { count: llmValue(report.downloaded) })
            : llmText("ui.syncedNoNewRecords")
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
    ? llmText("ui.configureASyncServiceToCombineUsage")
    : status?.lastError
      ? llmText("message.lastSyncFailed", { error: llmValue(status.lastError) })
      : status?.lastSyncedAt
        ? llmText("message.lastSyncedRunsWithDatabaseSyncAnd", {
            date: llmValue(llmFormat.formatEventTime(status.lastSyncedAt)),
          })
        : llmText("ui.notSyncedYetRunsWithDatabaseSync");

  return (
    <SettingsGroup
      title={llmText("ui.devices")}
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
            {llmText("ui.syncNow")}
          </Button>
        ) : undefined
      }
    >
      {!status ? (
        <p className="text-tau-meta text-ink-3 px-3 py-6 text-center">{llmText("ui.loading2")}</p>
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
        title={llmText("ui.removeDevice")}
        context={removing?.name}
        danger
        description={llmText("ui.removeThisDeviceSCallRecordsFrom")}
        impact={
          removing
            ? llmText("message.theseCallRecordsWillNoLongerCount", {
                count: llmValue(removing.events.toLocaleString("en-US")),
              })
            : undefined
        }
        confirmText={llmText("ui.remove")}
        onConfirm={async () => {
          if (!removing) return;
          try {
            await removeDeviceFromUsageSync(removing.deviceId, selfId);
            toast.success(llmText("message.removed2", { name: llmValue(removing.name) }));
            setRemoving(null);
          } catch (error) {
            toast.error(llmText("message.couldNotRemove", { error: llmValue(errorText(error)) }));
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
  useLlmSettingsI18n();

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(device.name);

  const save = async () => {
    const name = draft.trim();
    if (!name) {
      toast.warning(llmText("ui.deviceNameCannotBeEmpty"));
      return;
    }
    try {
      await setUsageDeviceName(name);
      setEditing(false);
      onRenamed();
    } catch (error) {
      toast.error(llmText("message.couldNotRename", { error: llmValue(errorText(error)) }));
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
              aria-label={llmText("ui.thisDeviceSName")}
              value={draft}
              maxLength={64}
              autoFocus
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter") void save();
                if (e.key === "Escape") setEditing(false);
              }}
            />
            <IconButton aria-label={llmText("ui.saveDeviceName")} onClick={() => void save()}>
              <Check size={14} strokeWidth={1.75} />
            </IconButton>
            <IconButton aria-label={llmText("ui.cancelRename")} onClick={() => setEditing(false)}>
              <X size={14} strokeWidth={1.75} />
            </IconButton>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-tau-body-lg text-ink-1 truncate font-medium">{device.name}</span>
            {device.isSelf && <StatusChip tone="accent">{llmText("ui.thisDevice")}</StatusChip>}
          </div>
        )}
        <div className="text-tau-meta text-ink-2 mt-0.5 tabular-nums">
          {device.events.toLocaleString("en-US")} {llmText("ui.calls3")}
          {device.lastTs
            ? llmText("message.lastUsed", {
                date: llmValue(llmFormat.formatEventTime(device.lastTs)),
              })
            : ""}
        </div>
      </div>
      {device.isSelf && !editing && (
        <IconButton
          aria-label={llmText("ui.renameThisDevice")}
          onClick={() => {
            setDraft(device.name);
            setEditing(true);
          }}
        >
          <Pencil size={14} strokeWidth={1.75} />
        </IconButton>
      )}
      {onRemove && (
        <IconButton
          aria-label={llmText("message.removeDevice", { name: llmValue(device.name) })}
          onClick={onRemove}
        >
          <Trash2 size={14} strokeWidth={1.75} />
        </IconButton>
      )}
    </div>
  );
}
