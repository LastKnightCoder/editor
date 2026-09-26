/**
 * 侧栏条目扩展槽注册表 —— navigation.ts 只声明 key（badge / children），渲染组件在此
 * 集中注册，Sidebar 查表渲染、不感知具体域。新增域附属 = 域内写组件 + navigation.ts
 * 声明 + 此处注册，Sidebar / Titlebar 不再改动。
 */

import type { ComponentType } from "react";
import { PomodoroNavBadge } from "@/features/pomodoro/components/PomodoroNavBadge";
import {
  CollaborationNavBadge,
  CollaborationNavSessions,
} from "@/features/collaboration/components/CollaborationNav";
import { ReviewDueBadge } from "@/features/flashcards/components/ReviewDueBadge";
import { QuestionsNavBadge } from "@/features/questions/components/QuestionsNavBadge";
import { QuestionsNavGroups } from "@/features/questions/components/QuestionsNav";
import { TodosNavGroups } from "@/features/todos/components/TodosNav";
import { useTodoSnapshot } from "@/features/todos/queries";
import { McpNavBadge } from "@/features/mcp/components/McpNavBadge";
import { useQuestionsSnapshot } from "@/features/questions/queries";
import { DiaryNavTags } from "@/features/diary/components/DiaryNav";
import { useDiaryNavHasContent } from "@/features/diary/queries";
import { WhiteboardNavTags } from "@/features/whiteboards/components/WhiteboardNav";
import { useWhiteboardNavHasContent } from "@/features/whiteboards/queries";
import { ChatNavSessions, useChatNavHasContent } from "@/features/chat/components/ChatNav";
import useCollaborationStore from "@/stores/useCollaborationStore";
import type { NavItemBadge, NavItemChildren } from "./navigation";

/** 徽标槽：条目右侧实时角标，组件内部无数据时自行返回 null；null = 已声明未实现 */
export const NAV_BADGE_SLOTS: Record<NavItemBadge, ComponentType<{ collapsed: boolean }> | null> = {
  "pomodoro-live": PomodoroNavBadge,
  "collab-requests": CollaborationNavBadge,
  "review-due": ReviewDueBadge,
  "questions-active": QuestionsNavBadge,
  "mcp-errors": McpNavBadge,
};

export interface NavChildrenSlotProps {
  /** 当前选中的子项 id（缺省时组件按自身规则落到第一项） */
  selectedId?: string;
  onSelect: (id: string) => void;
}

export interface NavChildrenSlot {
  Component: ComponentType<NavChildrenSlotProps>;
  /**
   * 选中态是否落在子项上（由页面参数判定）：true 时父项降为「所在区」样式；
   * false 时父项保持常规选中（子项是可选的收窄视图，如日记的标签频道——「全部」无子项）。
   */
  selected: (params: Record<string, unknown>) => boolean;
  /** 已在该页时再点父项：true = 清空子项参数回到总览；缺省 = 沿用已有参数（停在上次的子项） */
  parentResets?: boolean;
}

/** 子项槽：所属页在栈顶时于条目下方展开的子项列表 */
export const NAV_CHILDREN_SLOTS: Record<NavItemChildren, NavChildrenSlot> = {
  // 协作：当前内容缺省时落到第一份，恒有子项选中
  "collaboration-sessions": { Component: CollaborationNavSessions, selected: () => true },
  // 待办：项目是收窄视图，参数 id 为空 = 全部
  "todo-groups": {
    Component: TodosNavGroups,
    selected: params => Boolean(params.id),
    parentResets: true,
  },
  // 日记：标签频道是收窄视图，参数 id 为空 = 全部（D-044）
  "diary-tags": {
    Component: DiaryNavTags,
    selected: params => Boolean(params.id),
    parentResets: true,
  },
  // 白板：标签是收窄视图，参数 id 为空 = 全部（D-047）
  "whiteboard-tags": {
    Component: WhiteboardNavTags,
    selected: params => Boolean(params.id),
    parentResets: true,
  },
  // 问题：分组是收窄视图，参数 id 为空 = 全部
  "question-groups": {
    Component: QuestionsNavGroups,
    selected: params => Boolean(params.id),
    parentResets: true,
  },
  // AI 对话：id 为空 = 新对话空态；已在对话页再点父项回到新对话（D-047）
  "chat-sessions": {
    Component: ChatNavSessions,
    selected: params => Boolean(params.id),
    parentResets: true,
  },
};

/** 各子项槽是否有内容可展开（空内容不展开，父项保持常规选中态） */
export function useNavChildrenContent(): Record<NavItemChildren, boolean> {
  const hasSessions = useCollaborationStore(s => s.sessions.length > 0);
  const hasDiary = useDiaryNavHasContent();
  const hasWhiteboardTags = useWhiteboardNavHasContent();
  const hasChats = useChatNavHasContent();
  // 恒有默认分组；快照到位即展开（含「新建分组」入口）
  const hasQuestionGroups = Boolean(useQuestionsSnapshot().snapshot);
  const hasTodoGroups = Boolean(useTodoSnapshot().snapshot);
  return {
    "collaboration-sessions": hasSessions,
    "todo-groups": hasTodoGroups,
    "diary-tags": hasDiary,
    "whiteboard-tags": hasWhiteboardTags,
    "question-groups": hasQuestionGroups,
    "chat-sessions": hasChats,
  };
}
