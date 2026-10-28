import { useState } from "react";
import { CircleX, Eraser, Trash2, Undo2 } from "lucide-react";
import { ActionSheet, type ActionSheetItem } from "../../../components/ActionSheet";
import { MobileConfirmDialog } from "../../../components/MobileConfirmDialog";
import { toast } from "../../../components/toast";
import type { ManagedPluginItem, PluginManagerAction } from "../data/usePluginManager";

type ConfirmKind = Extract<PluginManagerAction, "uninstall" | "clearData" | "restore">;

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
    description:
      "清除当前工作区里这个插件的键值存储及已选择内容的标题访问授权，无法撤销；插件内容、结构化记录、正文和其他工作区保留。",
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

/**
 * 详情页 ⋯ 管理菜单：启停由头部开关承担，这里只放低频与危险动作。
 * 动作允许性来自 usePluginManager；不允许的动作保留入口并说明原因，点按只提示不执行。
 */
export function PluginManageSheet({
  open,
  item,
  onClose,
  onAction,
}: {
  open: boolean;
  item: ManagedPluginItem;
  onClose: () => void;
  onAction: (kind: PluginManagerAction) => void;
}) {
  const [confirming, setConfirming] = useState<ConfirmKind | null>(null);
  const entry = (
    kind: PluginManagerAction,
    label: string,
    icon: ActionSheetItem["icon"],
    desc: string,
    danger = false
  ): ActionSheetItem => {
    const availability = item.actions[kind];
    return {
      label,
      icon,
      danger,
      desc: availability.allowed ? desc : (availability.reason ?? "暂不可用"),
      onClick: () => {
        if (!availability.allowed) {
          toast({ type: "info", text: availability.reason ?? "暂不可用" });
          return;
        }
        if (kind in CONFIRMS) setConfirming(kind as ConfirmKind);
        else onAction(kind);
      },
    };
  };
  const groups: ActionSheetItem[][] = [
    [
      ...(item.pending
        ? [entry("cancelPending", "取消待生效更新", <CircleX />, "保留当前运行的版本")]
        : []),
      ...(item.hasBackup ? [entry("restore", "恢复上一版代码", <Undo2 />, "插件数据不回退")] : []),
    ],
    [
      entry("clearData", "清除此工作区数据", <Eraser />, "无法撤销，正文不受影响", true),
      entry("uninstall", "卸载", <Trash2 />, "正文里的插件内容与数据保留", true),
    ],
  ];
  const confirm = confirming ? CONFIRMS[confirming] : null;
  return (
    <>
      <ActionSheet open={open} title={item.name} groups={groups} onClose={onClose} />
      <MobileConfirmDialog
        open={confirm !== null}
        title={confirm?.title(item.name) ?? ""}
        description={confirm?.description}
        confirmText={confirm?.confirmText}
        danger={confirm?.danger}
        onCancel={() => setConfirming(null)}
        onConfirm={() => {
          if (confirming) onAction(confirming);
          setConfirming(null);
        }}
      />
    </>
  );
}
