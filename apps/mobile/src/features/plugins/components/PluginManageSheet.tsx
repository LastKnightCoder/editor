import { pluginTranslator, usePluginI18n, pluginActionReason } from "../i18n";
import { useState } from "react";
import { CircleX, Eraser, Trash2, Undo2 } from "lucide-react";
import { ActionSheet, type ActionSheetItem } from "../../../components/ActionSheet";
import { MobileConfirmDialog } from "../../../components/MobileConfirmDialog";
import { toast } from "../../../components/toast";
import type { ManagedPluginItem, PluginManagerAction } from "../data/usePluginManager";
const t = pluginTranslator.t;

type ConfirmKind = Extract<PluginManagerAction, "uninstall" | "clearData" | "restore">;

const CONFIRMS: Record<
  ConfirmKind,
  { title: (name: string) => string; description: string; confirmText: string; danger: boolean }
> = {
  uninstall: {
    title: name => t("manage.uninstallTitle", { name }),
    get description() {
      return t("manage.uninstallHint");
    },
    get confirmText() {
      return t("common.uninstall");
    },
    danger: false,
  },
  clearData: {
    title: name => t("manage.clearTitle", { name }),
    get description() {
      return t("manage.clearHint");
    },
    get confirmText() {
      return t("manage.clear");
    },
    danger: true,
  },
  restore: {
    title: () => t("manage.restoreCode"),
    get description() {
      return t("manage.restoreHint");
    },
    get confirmText() {
      return t("manage.restore");
    },
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
  usePluginI18n();
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
      desc: availability.allowed
        ? desc
        : (pluginActionReason(availability) ?? t("manage.unavailable")),
      onClick: () => {
        if (!availability.allowed) {
          toast({
            type: "info",
            text: pluginActionReason(availability) ?? t("manage.unavailable"),
          });
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
        ? [entry("cancelPending", t("manage.cancelPending"), <CircleX />, t("manage.keepRunning"))]
        : []),
      ...(item.hasBackup
        ? [entry("restore", t("manage.restoreCode"), <Undo2 />, t("manage.keepData"))]
        : []),
    ],
    [
      entry("clearData", t("manage.clearWorkspace"), <Eraser />, t("manage.irreversible"), true),
      entry("uninstall", t("common.uninstall"), <Trash2 />, t("manage.preserveContent"), true),
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
