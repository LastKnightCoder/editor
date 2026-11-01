/**
 * 项目详情文档树的收起态（zustand + persist）：全局一份，跨项目、跨重启保持。
 * 切换入口在标题栏面包屑（ProjectDetailView），文档树（ProjectList）只读。
 *
 * 条目放不下时（如视频笔记的「左看右记」两栏）可临时请求自动收起：不写入持久化的偏好，
 * 请求撤销即恢复；自动收起期间用户点展开以用户为准，直到这次请求结束。
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

interface ProjectTreeState {
  /** 用户偏好（持久化） */
  collapsed: boolean;
  /** 条目临时请求收起（不持久化） */
  autoCollapse: boolean;
  /** 自动收起期间用户手动展开过（不持久化） */
  userExpanded: boolean;
  toggle(): void;
  setAutoCollapse(value: boolean): void;
}

export const useProjectTreeStore = create<ProjectTreeState>()(
  persist(
    set => ({
      collapsed: false,
      autoCollapse: false,
      userExpanded: false,
      toggle: () =>
        set(s => {
          if (s.collapsed) return { collapsed: false, userExpanded: s.autoCollapse };
          if (s.autoCollapse && !s.userExpanded) return { userExpanded: true };
          return { collapsed: true, userExpanded: false };
        }),
      setAutoCollapse: value =>
        set(s => (s.autoCollapse === value ? s : { autoCollapse: value, userExpanded: false })),
    }),
    { name: "tau-project-tree", partialize: s => ({ collapsed: s.collapsed }) }
  )
);

/** 文档树实际是否收起 */
export const selectTreeCollapsed = (s: ProjectTreeState) =>
  s.collapsed || (s.autoCollapse && !s.userExpanded);
