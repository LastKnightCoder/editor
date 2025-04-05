import { memo, useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import { useNavigate, useLocation, matchPath } from "react-router-dom";
import SidebarItem from "./SidebarItem";
import useSettingStore from "@/stores/useSettingStore.ts";
import { useMemoizedFn } from "ahooks";

// 导入图标
import home from "@/assets/icons/home.svg";
import card from "@/assets/icons/card.svg";
import article from "@/assets/icons/article.svg";
import project from "@/assets/icons/project.svg";
import document from "@/assets/icons/document.svg";
import daily from "@/assets/icons/daily.svg";
import timeRecord from "@/assets/icons/time-record.svg";
import whiteBoard from "@/assets/icons/white-board.svg";
import pdf from "@/assets/icons/pdf.svg";
import vecDatabase from "@/assets/icons/vec-database.svg";

interface SidebarNavItemsProps {
  isShortWidth: boolean;
}

// 使用单独的NavItemConfig组件，避免大量配置重新创建
const NavItemConfig = memo(
  ({
    path,
    icon,
    desc,
    onClick,
    active,
    isShortWidth,
  }: {
    path: string;
    icon: string;
    desc: string;
    onClick: () => void;
    active: boolean;
    isShortWidth: boolean;
  }) => (
    <SidebarItem
      key={path}
      icon={icon}
      label={desc}
      active={active}
      onClick={onClick}
      isShortWidth={isShortWidth}
    />
  ),
);

// 使用单独的NavItem组件优化每个导航项
const NavItem = memo(
  ({
    routePath,
    icon,
    desc,
    isShortWidth,
  }: {
    routePath: string;
    icon: string;
    desc: string;
    isShortWidth: boolean;
  }) => {
    const navigate = useNavigate();
    const { pathname } = useLocation();

    const handleClick = useMemoizedFn(() => {
      navigate(routePath);
    });

    // 匹配当前路径，确定是否激活
    const isActive = useMemo(() => {
      if (routePath === "/" && pathname === "/") {
        return true;
      }
      return (
        matchPath(routePath === "/" ? "/" : `${routePath}/*`, pathname) !== null
      );
    }, [pathname, routePath]);

    return (
      <NavItemConfig
        path={routePath}
        icon={icon}
        desc={desc}
        onClick={handleClick}
        active={isActive}
        isShortWidth={isShortWidth}
      />
    );
  },
);

const SidebarNavItems = memo((props: SidebarNavItemsProps) => {
  const { isShortWidth } = props;

  const { module } = useSettingStore(
    useShallow((state) => ({
      module: state.setting.module,
    })),
  );

  // 配置菜单项，避免在每次渲染时重新创建
  const menuItems = useMemo(() => {
    return [
      {
        key: "home",
        icon: home,
        desc: "首页",
        path: "/",
        enable: true,
      },
      {
        key: "whiteBoard",
        icon: whiteBoard,
        desc: "白板",
        path: "/white-board/list",
        enable: module.whiteBoard.enable,
      },
      {
        key: "card",
        icon: card,
        desc: "卡片",
        path: "/cards/list",
        enable: module.card.enable,
      },
      {
        key: "article",
        icon: article,
        desc: "文章",
        path: "/articles/list",
        enable: module.article.enable,
      },
      {
        key: "project",
        icon: project,
        desc: "项目",
        path: "/projects/list",
        enable: module.project.enable,
      },
      {
        key: "document",
        icon: document,
        desc: "知识库",
        path: "/documents/list",
        enable: module.document.enable,
      },
      {
        key: "pdf",
        icon: pdf,
        desc: "PDF",
        path: "/pdfs/list",
        enable: module.pdf.enable,
      },
      {
        key: "vec-documents",
        icon: vecDatabase,
        desc: "索引数据库",
        path: "/vec-documents",
        enable: module.vecDocuments.enable,
      },
      {
        key: "daily",
        icon: daily,
        desc: "日记",
        path: "/dailies",
        enable: module.dailyNote.enable,
      },
      {
        key: "timeRecord",
        icon: timeRecord,
        desc: "时间统计",
        path: "/time-records",
        enable: module.timeRecord.enable,
      },
    ].filter((item) => item.enable);
  }, [module]);

  return (
    <>
      {menuItems.map((item) => (
        <NavItem
          key={item.key}
          routePath={item.path}
          icon={item.icon}
          desc={item.desc}
          isShortWidth={isShortWidth}
        />
      ))}
    </>
  );
});

export default SidebarNavItems;
