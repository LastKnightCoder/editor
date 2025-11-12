import { memo, useMemo, useState, useEffect } from "react";
import { Dropdown, MenuProps } from "antd";
import { useMemoizedFn } from "ahooks";
import SidebarItem from "./SidebarItem";
import useShortcutStore from "@/stores/useShortcutStore";
import useTabStore from "@/stores/useTabStore";
import { ShortcutResourceType } from "@/types";
import { TabType } from "@/types/tab";
import shortcut from "@/assets/icons/shortcut.svg";
import useDatabaseConnected from "@/hooks/useDatabaseConnected";

interface ShortcutDropdownProps {
  isShortWidth: boolean;
}

const typeLabels: Record<ShortcutResourceType, string> = {
  card: "卡片",
  article: "文章",
  document: "知识库",
  project: "项目",
};

const ShortcutDropdown = memo(({ isShortWidth }: ShortcutDropdownProps) => {
  const [open, setOpen] = useState(false);
  const navigateTo = useTabStore((state) => state.navigateTo);

  const { items, loaded, loadShortcuts } = useShortcutStore();
  const isConnected = useDatabaseConnected();

  useEffect(() => {
    if (!loaded && isConnected) {
      loadShortcuts();
    }
  }, [loaded, loadShortcuts, isConnected]);

  // 按类型分组快捷方式
  const groupedShortcuts = useMemo(() => {
    const groups: Record<ShortcutResourceType, typeof items> = {
      card: [],
      article: [],
      document: [],
      project: [],
    };

    items.forEach((item) => {
      groups[item.resourceType].push(item);
    });

    return groups;
  }, [items]);

  // 构建快捷方式菜单
  const menuItems: MenuProps["items"] = useMemo(() => {
    const result: MenuProps["items"] = [];

    (Object.keys(typeLabels) as ShortcutResourceType[]).forEach((type) => {
      const shortcuts = groupedShortcuts[type];
      if (shortcuts.length > 0) {
        result.push({
          key: type,
          label: typeLabels[type],
          children: shortcuts.map((shortcut) => ({
            key: `${type}-${shortcut.id}`,
            label: shortcut.title,
          })),
        });
      }
    });

    return result;
  }, [groupedShortcuts]);

  const handleMenuClick: MenuProps["onClick"] = useMemoizedFn(({ key }) => {
    // 解析 key: "type-id"
    const [, idStr] = key.split("-");
    const id = Number(idStr);

    const shortcut = items.find((item) => item.id === id);
    if (!shortcut) return;

    // 跳转逻辑
    if (shortcut.scope === "module") {
      switch (shortcut.resourceType) {
        case "card":
          navigateTo(TabType.CardList);
          break;
        case "article":
          navigateTo(TabType.ArticleList);
          break;
        case "document":
          navigateTo(TabType.DocumentList);
          break;
        case "project":
          navigateTo(TabType.ProjectList);
          break;
      }
    } else {
      switch (shortcut.resourceType) {
        case "card":
          navigateTo(TabType.CardDetail, { id: shortcut.resourceId! });
          break;
        case "article":
          navigateTo(TabType.ArticleDetail, { id: shortcut.resourceId! });
          break;
        case "document":
          // 知识库快捷方式 - 导航到知识库详情
          navigateTo(TabType.DocumentDetail, {
            id: shortcut.resourceId!,
            itemId: shortcut.documentItemId!,
          });
          break;
        case "project":
          // 项目快捷方式 - 导航到项目详情
          navigateTo(TabType.ProjectDetail, {
            id: shortcut.resourceId!,
            itemId: shortcut.projectItemId!,
          });
          break;
      }
    }

    setOpen(false);
  });

  const handleClick = useMemoizedFn(() => {
    setOpen(!open);
  });

  return (
    <Dropdown
      open={open}
      onOpenChange={setOpen}
      menu={{
        items: menuItems,
        onClick: handleMenuClick,
      }}
      trigger={["click"]}
      placement="topRight"
    >
      <div>
        <SidebarItem
          icon={shortcut}
          label="快捷方式"
          active={false}
          onClick={handleClick}
          isShortWidth={isShortWidth}
        />
      </div>
    </Dropdown>
  );
});

export default ShortcutDropdown;
