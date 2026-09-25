import { memo } from "react";
import { Users } from "lucide-react";
import SidebarItem from "./SidebarItem";
import { useMemoizedFn } from "ahooks";
import { TabType } from "@/types/tab";
import useTabStore from "@/stores/useTabStore";

import home from "@/assets/icons/home.svg";
import card from "@/assets/icons/card.svg";
import article from "@/assets/icons/article.svg";
import project from "@/assets/icons/project.svg";
import daily from "@/assets/icons/daily.svg";
import whiteBoard from "@/assets/icons/white-board.svg";
import pdf from "@/assets/icons/pdf.svg";
import vecDatabase from "@/assets/icons/vec-database.svg";
import calendar from "@/assets/icons/calendar.svg";
import chat from "@/assets/icons/chat.svg";
import task from "@/assets/icons/task.svg";
import question from "@/assets/icons/question.svg";
import pomodoro from "@/assets/icons/pomodoro.svg";
import prompt from "@/assets/icons/prompt.svg";
import weread from "@/assets/icons/weread.svg";
import flashcard from "@/assets/icons/flashcard.svg";

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
    icon: React.ReactNode;
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
  )
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
    icon: React.ReactNode;
    desc: string;
    isShortWidth: boolean;
  }) => {
    const openInNewTab = useTabStore(state => state.openInNewTab);

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
  }
);

const MENU_ITEMS = [
  {
    key: "home",
    icon: home as React.ReactNode,
    desc: "首页",
    type: TabType.Home,
  },
  {
    key: "chat",
    icon: chat as React.ReactNode,
    desc: "聊天管理",
    type: TabType.ChatManagement,
  },
  {
    key: "skill",
    icon: prompt as React.ReactNode,
    desc: "Skill 管理",
    type: TabType.SkillManagement,
  },
  {
    key: "whiteBoard",
    icon: whiteBoard as React.ReactNode,
    desc: "白板",
    type: TabType.WhiteBoardList,
  },
  {
    key: "card",
    icon: card as React.ReactNode,
    desc: "卡片",
    type: TabType.CardList,
  },
  {
    key: "flashcard",
    icon: flashcard as React.ReactNode,
    desc: "闪卡中心",
    type: TabType.FlashcardCenter,
  },
  {
    key: "article",
    icon: article as React.ReactNode,
    desc: "文章",
    type: TabType.ArticleList,
  },
  {
    key: "project",
    icon: project as React.ReactNode,
    desc: "项目",
    type: TabType.ProjectList,
  },
  {
    key: "calendar",
    icon: calendar as React.ReactNode,
    desc: "日历",
    type: TabType.Calendar,
  },
  {
    key: "task",
    icon: task as React.ReactNode,
    desc: "任务列表",
    type: TabType.Todo,
  },
  {
    key: "pomodoro",
    icon: pomodoro as React.ReactNode,
    desc: "番茄专注",
    type: TabType.Pomodoro,
  },
  {
    key: "question",
    icon: question as React.ReactNode,
    desc: "问题管理",
    type: TabType.Questions,
  },
  {
    key: "pdf",
    icon: pdf as React.ReactNode,
    desc: "PDF",
    type: TabType.PdfList,
  },
  {
    key: "vec-documents",
    icon: vecDatabase as React.ReactNode,
    desc: "索引数据库",
    type: TabType.VecDocument,
  },
  {
    key: "daily",
    icon: daily as React.ReactNode,
    desc: "日记",
    type: TabType.DailyNote,
  },
  {
    key: "collaboration",
    icon: <Users size={18} />,
    desc: "协作",
    type: TabType.Collaboration,
  },
  {
    key: "weread",
    icon: weread as React.ReactNode,
    desc: "微信读书",
    type: TabType.WeRead,
  },
];

const SidebarNavItems = memo((props: SidebarNavItemsProps) => {
  const { isShortWidth } = props;

  return (
    <>
      {MENU_ITEMS.map(item => (
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
