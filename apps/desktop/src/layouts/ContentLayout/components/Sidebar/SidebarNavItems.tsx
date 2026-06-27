import { memo, useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import SidebarItem from "./SidebarItem";
import useSettingStore from "@/stores/useSettingStore.ts";
import { useMemoizedFn } from "ahooks";
import { TabType } from "@/types/tab";
import useTabStore from "@/stores/useTabStore";

import home from "@/assets/icons/home.svg";
import card from "@/assets/icons/card.svg";
import article from "@/assets/icons/article.svg";
import project from "@/assets/icons/project.svg";
import document from "@/assets/icons/document.svg";
import daily from "@/assets/icons/daily.svg";
import whiteBoard from "@/assets/icons/white-board.svg";
import pdf from "@/assets/icons/pdf.svg";
import vecDatabase from "@/assets/icons/vec-database.svg";
import calendar from "@/assets/icons/calendar.svg";
import chat from "@/assets/icons/chat.svg";
import resource from "@/assets/icons/resource.svg";
import task from "@/assets/icons/task.svg";
import question from "@/assets/icons/question.svg";
import pomodoro from "@/assets/icons/pomodoro.svg";
import prompt from "@/assets/icons/prompt.svg";
import weread from "@/assets/icons/weread.svg";
import flashcard from "@/assets/icons/flashcard.svg";
import badge from "@/assets/icons/badge.svg";
import rss from "@/assets/icons/rss.svg";

interface SidebarNavItemsProps {
  isShortWidth: boolean;
}

// 使用单独的NavItemConfig组件，避免大量配置重新创建
const NavItemConfig = memo(
  ({
    type,
    icon,
    desc,
    onClick,
    active,
    isShortWidth,
  }: {
    type: TabType;
    icon: string;
    desc: string;
    onClick: () => void;
    active: boolean;
    isShortWidth: boolean;
  }) => (
    <SidebarItem
      key={type}
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
    type,
    icon,
    desc,
    isShortWidth,
  }: {
    type: TabType;
    icon: string;
    desc: string;
    isShortWidth: boolean;
  }) => {
    const openInNewTab = useTabStore((state) => state.openInNewTab);

    const handleClick = useMemoizedFn(() => {
      openInNewTab(type);
    });

    return (
      <NavItemConfig
        type={type}
        icon={icon}
        desc={desc}
        onClick={handleClick}
        active={false}
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
        type: TabType.Home,
        enable: true,
      },
      {
        key: "chat",
        icon: chat,
        desc: "聊天管理",
        type: TabType.ChatManagement,
        enable: module.chatManagement.enable,
      },
      {
        key: "skill",
        icon: prompt,
        desc: "Skill 管理",
        type: TabType.SkillManagement,
        enable: true,
      },
      {
        key: "whiteBoard",
        icon: whiteBoard,
        desc: "白板",
        type: TabType.WhiteBoardList,
        enable: module.whiteBoard.enable,
      },
      {
        key: "card",
        icon: card,
        desc: "卡片",
        type: TabType.CardList,
        enable: module.card.enable,
      },
      {
        key: "flashcard",
        icon: flashcard,
        desc: "闪卡中心",
        type: TabType.FlashcardCenter,
        enable: module.flashcard?.enable ?? true,
      },
      {
        key: "badge",
        icon: badge,
        desc: "徽章中心",
        type: TabType.BadgeCenter,
        enable: true,
      },
      {
        key: "article",
        icon: article,
        desc: "文章",
        type: TabType.ArticleList,
        enable: module.article.enable,
      },
      {
        key: "project",
        icon: project,
        desc: "项目",
        type: TabType.ProjectList,
        enable: module.project.enable,
      },
      {
        key: "document",
        icon: document,
        desc: "知识库",
        type: TabType.DocumentList,
        enable: module.document.enable,
      },
      {
        key: "calendar",
        icon: calendar,
        desc: "日历",
        type: TabType.Calendar,
        enable: module.calendar.enable,
      },
      {
        key: "task",
        icon: task,
        desc: "任务列表",
        type: TabType.Todo,
        enable: module.todo.enable,
      },
      {
        key: "pomodoro",
        icon: pomodoro,
        desc: "番茄专注",
        type: TabType.Pomodoro,
        enable: module.pomodoro.enable,
      },
      {
        key: "question",
        icon: question,
        desc: "问题管理",
        type: TabType.Questions,
        enable: module.question.enable,
      },
      {
        key: "pdf",
        icon: pdf,
        desc: "PDF",
        type: TabType.PdfList,
        enable: module.pdf.enable,
      },
      {
        key: "vec-documents",
        icon: vecDatabase,
        desc: "索引数据库",
        type: TabType.VecDocument,
        enable: module.vecDocuments.enable,
      },
      {
        key: "daily",
        icon: daily,
        desc: "日记",
        type: TabType.DailyNote,
        enable: module.dailyNote.enable,
      },
      {
        key: "resource",
        icon: resource,
        desc: "资源管理",
        type: TabType.ResourceManagement,
        enable: module.resourceManagement.enable,
      },
      {
        key: "feed",
        icon: rss,
        desc: "信息流",
        type: TabType.Feed,
        enable: module.feed?.enable ?? module.rssSubscription?.enable ?? true,
      },
      {
        key: "weread",
        icon: weread,
        desc: "微信读书",
        type: TabType.WeRead,
        enable: module.weread.enable,
      },
    ].filter((item) => item.enable);
  }, [module]);

  return (
    <>
      {menuItems.map((item) => (
        <NavItem
          key={item.key}
          type={item.type}
          icon={item.icon}
          desc={item.desc}
          isShortWidth={isShortWidth}
        />
      ))}
    </>
  );
});

export default SidebarNavItems;
