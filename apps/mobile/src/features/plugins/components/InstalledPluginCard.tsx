import { useId, useState } from "react";
import { Button } from "@tau/ui";
import { MobileConfirmDialog } from "../../../components/MobileConfirmDialog";
import { PluginStatusBadge } from "./PluginStatusBadge";
import {
  actionLabel,
  type PluginActionKind,
  type PluginActionView,
  type PluginLifecycleView,
} from "./pluginStatus";

type ConfirmKind = Extract<PluginActionKind, "uninstall" | "clearData" | "restore">;

const CONFIRMS: Record<
  ConfirmKind,
  { title: (name: string) => string; description: string; confirmText: string; danger: boolean }
> = {
  uninstall: {
    title: name => `卸载「${name}」`,
    description: "只移除插件代码。正文里的插件内容和插件数据都会保留，重新安装后可继续使用。",
    confirmText: "卸载",
    danger: false,
  },
  clearData: {
    title: name => `清除「${name}」在此工作区的数据`,
    description: "只清除当前工作区里这个插件的私有数据，无法撤销；其他工作区与正文不受影响。",
    confirmText: "清除",
    danger: true,
  },
  restore: {
    title: () => "恢复上一版代码",
    description: "只回退插件代码，不回退插件数据；新版本写入的数据不一定能被旧版本读取。",
    confirmText: "恢复",
    danger: false,
  },
};

const needsConfirm = (kind: PluginActionKind): kind is ConfirmKind => kind in CONFIRMS;

function statusHint(status: PluginLifecycleView): string | null {
  switch (status.kind) {
    case "pending":
      return status.version
        ? `v${status.version} 将在下次打开应用时生效。`
        : "有新版本等待生效，将在下次打开应用时切换。";
    case "failed":
      return status.message;
    case "revoked":
      return status.reason
        ? `中心已撤回此版本：${status.reason}。插件已停止运行，正文原文保留。`
        : "中心已撤回此版本，插件已停止运行，正文原文保留。";
    default:
      return null;
  }
}

/** 同一原因只说一次（如“已有插件操作正在进行”），避免每个按钮各重复一行。 */
function blockedReasons(actions: readonly PluginActionView[]) {
  const groups = new Map<string, string[]>();
  for (const action of actions)
    if (!action.allowed && action.reason)
      groups.set(action.reason, [...(groups.get(action.reason) ?? []), actionLabel(action)]);
  return [...groups].map(([reason, labels], index) => ({
    reason,
    labels,
    id: (prefix: string) => `${prefix}-reason-${index}`,
  }));
}

function reasonId(prefix: string, reason: string, actions: readonly PluginActionView[]) {
  return blockedReasons(actions)
    .find(group => group.reason === reason)
    ?.id(prefix);
}

/** 已安装插件条目：状态、动作与设置入口；动作允许性由逻辑层给出，这里只呈现与触发。 */
export function InstalledPluginCard({
  name,
  pluginId,
  version,
  status,
  actions,
  settings = [],
  busyAction = null,
  statusStale = false,
  notes = [],
  onAction,
  onOpenSetting,
}: {
  name: string;
  pluginId: string;
  /** 当前运行或已安装的版本；尚未装好时为 null。 */
  version: string | null;
  status: PluginLifecycleView;
  actions: readonly PluginActionView[];
  settings?: readonly { id: string; title: string }[];
  busyAction?: PluginActionKind | null;
  /** 离线时未能刷新发布状态。 */
  statusStale?: boolean;
  /** 启用意图、正文检索限制等补充说明。 */
  notes?: readonly string[];
  onAction: (kind: PluginActionKind) => void;
  onOpenSetting?: (id: string) => void;
}) {
  const [confirming, setConfirming] = useState<ConfirmKind | null>(null);
  const idPrefix = useId();
  const hint = statusHint(status);
  const confirm = confirming ? CONFIRMS[confirming] : null;
  return (
    <article
      aria-labelledby={`${idPrefix}-name`}
      className="bg-surface shadow-card rounded-card flex flex-col gap-3 p-4"
    >
      <header className="flex min-w-0 items-start gap-3">
        <div className="min-w-0 flex-1">
          <h3 id={`${idPrefix}-name`} className="text-ink-1 truncate text-[15px] font-semibold">
            {name}
          </h3>
          <p className="text-ink-3 truncate text-[12px]">
            {pluginId}
            {version && ` · v${version}`}
          </p>
        </div>
        <PluginStatusBadge status={status} />
      </header>
      {hint && (
        <p
          role={status.kind === "failed" || status.kind === "revoked" ? "alert" : undefined}
          className="text-ink-2 break-words text-[13px] leading-relaxed"
        >
          {hint}
        </p>
      )}
      {notes.map(note => (
        <p key={note} className="text-ink-3 text-[12px] leading-relaxed">
          {note}
        </p>
      ))}
      {statusStale && (
        <p className="text-ink-3 text-[12px]">发布状态未刷新；已确认撤回的版本仍保持停用。</p>
      )}
      {actions.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            {actions.map(action => (
              <Button
                key={action.kind}
                className="min-h-11"
                disabled={
                  !action.allowed || (busyAction !== null && action.kind !== "cancelInstall")
                }
                loading={busyAction === action.kind}
                aria-describedby={
                  !action.allowed && action.reason
                    ? reasonId(idPrefix, action.reason, actions)
                    : undefined
                }
                onClick={() =>
                  needsConfirm(action.kind) ? setConfirming(action.kind) : onAction(action.kind)
                }
              >
                {actionLabel(action)}
              </Button>
            ))}
          </div>
          {blockedReasons(actions).map(group => (
            <p key={group.reason} id={group.id(idPrefix)} className="text-ink-3 text-[12px]">
              {group.labels.join("、")}：{group.reason}
            </p>
          ))}
        </div>
      )}
      {settings.length > 0 && onOpenSetting && (
        <ul aria-label="插件设置" className="border-line-1 flex flex-col border-t pt-2">
          {settings.map(setting => (
            <li key={setting.id}>
              <button
                type="button"
                onClick={() => onOpenSetting(setting.id)}
                className="text-ink-1 active:bg-press flex min-h-11 w-full items-center justify-between rounded-xl px-1 text-left text-[14px]"
              >
                {setting.title}
                <span aria-hidden="true" className="text-ink-3">
                  ›
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <MobileConfirmDialog
        open={confirm !== null}
        title={confirm?.title(name) ?? ""}
        description={confirm?.description}
        confirmText={confirm?.confirmText}
        danger={confirm?.danger}
        onCancel={() => setConfirming(null)}
        onConfirm={() => {
          if (confirming) onAction(confirming);
          setConfirming(null);
        }}
      />
    </article>
  );
}
