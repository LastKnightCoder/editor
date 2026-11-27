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
import { useAppI18n } from "./i18n/react";

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
  const { locale, t } = useAppI18n();
  if (item.plugin || ALWAYS_ON_FEATURES.has(item.key)) return <>{children}</>;

  const dependents = dependentsOf(item.key);
  const dependentsText = dependents.join(locale === "en-US" ? ", " : "、");
  const hide = () => {
    const before = [...disabled];
    void setDisabled([...before, item.key]).then(ok => {
      if (!ok) return;
      toast.info(t("nav.itemHideToast", { name: item.label }), {
        duration: 5000,
        action: { label: t("nav.itemUndo"), onClick: () => void setDisabled(before) },
      });
    });
  };

  return (
    <ContextMenu
      content={
        <>
          <Menu.Item onSelect={onOpen}>{t("nav.itemOpen")}</Menu.Item>
          <Menu.Separator />
          <Menu.Item onSelect={hide}>
            {dependents.length
              ? t("nav.itemHideWith", { name: item.label, dependents: dependentsText })
              : t("nav.itemHide", { name: item.label })}
          </Menu.Item>
          <Menu.Item onSelect={() => openSettings("features")}>
            {t("nav.itemManageFeatures")}
          </Menu.Item>
        </>
      }
    >
      {children}
    </ContextMenu>
  );
}
