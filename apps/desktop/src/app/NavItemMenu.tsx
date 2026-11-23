/**
 * 内置侧栏条目的右键菜单：打开、从侧栏隐藏（可撤销）、去设置 › 功能管理全部。
 * 今日等不可关的条目不包菜单。
 */

import type { ReactNode } from "react";
import { ContextMenu, Menu, toast } from "@tau/ui";
import { ALWAYS_ON_FEATURES, featureParent } from "./features";
import { useFeatures } from "./featureQueries";
import { NAV_SECTIONS, type NavItem } from "./navigation";
import { useSettingsStore } from "./settingsStore";

const LABELS = new Map(
  NAV_SECTIONS.flatMap(section => section.items.map(item => [item.key, item.label] as const))
);

function dependentsOf(key: string): string[] {
  return [...LABELS].filter(([id]) => featureParent(id) === key).map(([, label]) => label);
}

export function NavItemMenu({
  item,
  onOpen,
  children,
}: {
  item: NavItem;
  onOpen: () => void;
  children: ReactNode;
}) {
  const { disabled, setDisabled } = useFeatures();
  const openSettings = useSettingsStore(s => s.openSettings);
  if (item.plugin || ALWAYS_ON_FEATURES.has(item.key)) return <>{children}</>;

  const dependents = dependentsOf(item.key);
  const hide = () => {
    const before = [...disabled];
    void setDisabled([...before, item.key]).then(ok => {
      if (!ok) return;
      toast.info(`已隐藏「${item.label}」，内容都还在`, {
        duration: 5000,
        action: { label: "撤销", onClick: () => void setDisabled(before) },
      });
    });
  };

  return (
    <ContextMenu
      content={
        <>
          <Menu.Item onSelect={onOpen}>打开</Menu.Item>
          <Menu.Separator />
          <Menu.Item onSelect={hide}>
            {dependents.length
              ? `从侧栏隐藏「${item.label}」，连同 ${dependents.join("、")}`
              : `从侧栏隐藏「${item.label}」`}
          </Menu.Item>
          <Menu.Item onSelect={() => openSettings("features")}>管理侧栏功能…</Menu.Item>
        </>
      }
    >
      {children}
    </ContextMenu>
  );
}
