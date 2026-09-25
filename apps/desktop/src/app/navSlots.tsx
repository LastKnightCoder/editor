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
import useCollaborationStore from "@/stores/useCollaborationStore";
import type { NavItemBadge, NavItemChildren } from "./navigation";

/** 徽标槽：条目右侧实时角标，组件内部无数据时自行返回 null；null = 已声明未实现 */
export const NAV_BADGE_SLOTS: Record<NavItemBadge, ComponentType<{ collapsed: boolean }> | null> = {
  "pomodoro-live": PomodoroNavBadge,
  "collab-requests": CollaborationNavBadge,
  "review-due": ReviewDueBadge,
};

export interface NavChildrenSlotProps {
  /** 当前选中的子项 id（缺省时组件按自身规则落到第一项） */
  selectedId?: string;
  onSelect: (id: string) => void;
}

/** 子项槽：所属页在栈顶时于条目下方展开的子项列表 */
export const NAV_CHILDREN_SLOTS: Record<NavItemChildren, ComponentType<NavChildrenSlotProps>> = {
  "collaboration-sessions": CollaborationNavSessions,
};

/** 各子项槽是否有内容可展开（空内容不展开，父项保持常规选中态） */
export function useNavChildrenContent(): Record<NavItemChildren, boolean> {
  const hasSessions = useCollaborationStore(s => s.sessions.length > 0);
  return { "collaboration-sessions": hasSessions };
}
