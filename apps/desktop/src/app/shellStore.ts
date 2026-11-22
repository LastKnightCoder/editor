/**
 * 壳层状态 —— 侧边栏折叠与宽度、右侧辅助栏视图与宽度（zustand + persist，记忆用户偏好）。
 * 唯一可变壳层状态收口在此；导航状态在 page/ 栈机，不混放。
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

import {
  PLUGIN_DOCK_ID,
  hasPluginDockGuards,
  mayLeavePluginDock,
  type PluginDockTarget,
} from "./pluginDock";

const SIDEBAR_MIN_W = 130;
const SIDEBAR_MAX_W = 340;
/** 收起图标列宽度，与 tokens.css 的 --tau-sidebar-w-collapsed 同源 */
export const SIDEBAR_COLLAPSED_W = 58;
/** 拖拽跨阈值切换：拉宽 ≥ 展开阈值即展开（宽度即时跟随鼠标）；拖窄 ≤ 收起阈值收起。中间 20px 迟滞防边界抖动 */
export const SIDEBAR_EXPAND_W = SIDEBAR_MIN_W;
export const SIDEBAR_COLLAPSE_W = SIDEBAR_MIN_W - 20;

/** 右侧辅助栏宽度范围与默认值 */
export const ASSIST_MIN_W = 360;
export const ASSIST_MAX_W = 560;
const ASSIST_DEFAULT_W = 400;

interface ShellState {
  sidebarCollapsed: boolean;
  sidebarWidth: number;
  /** 导航组折叠态（key = 组 label；空对象 = 全展开） */
  navSectionCollapsed: Record<string, boolean>;
  toggleSidebar(): void;
  setSidebarCollapsed(collapsed: boolean): void;
  setSidebarWidth(w: number): void;
  toggleNavSection(label: string): void;
  /** 右侧辅助栏当前视图（assistViews 登记的 id）；null = 收起 */
  assistView: string | null;
  pluginDock: PluginDockTarget | null;
  openPluginDock(target: PluginDockTarget, available: () => boolean): Promise<boolean>;
  releasePluginDock(mountId?: number): void;
  /** 被临时视图盖住的视图：关闭临时视图时回到它，最多记一个 */
  assistCovered: string | null;
  assistWidth: number;
  /** 侧栏是否因辅助栏空间不足被自动收起：关闭辅助栏时据此还原 */
  sidebarAutoCollapsed: boolean;
  /** 开合 AI 对话（Ctrl+J / 标题栏按钮）：辅助栏不是对话时切到对话 */
  toggleAssist(): void;
  /** 让辅助栏显示 id，清掉被盖住的视图 */
  showAssist(id: string): void;
  /** 临时盖住当前视图显示 id；当前已是临时视图时只替换，不再叠一层 */
  showAssistOver(id: string, available?: () => boolean, onShow?: () => void): Promise<boolean>;
  /** 关闭辅助栏当前视图（传 id 时仅当前是它才关）；有被盖住的视图就回到它 */
  closeAssist(id?: string): void;
  /** 收起整个辅助栏，被盖住的视图一并放下 */
  hideAssist(): void;
  /** 当前视图铺满正文区（不换宿主节点，网页不重载）；切换视图或关闭时复位 */
  assistExpanded: boolean;
  setAssistExpanded(expanded: boolean): void;
  setAssistWidth(w: number): void;
  setSidebarAutoCollapsed(auto: boolean): void;
}

export const useShellStore = create<ShellState>()(
  persist(
    (set, get) => {
      type DockChange = Pick<ShellState, "assistView" | "assistCovered" | "assistExpanded"> & {
        pluginDock?: PluginDockTarget | null;
      };
      let revision = 0;
      const change = async (next: DockChange, available = () => true, onShow?: () => void) => {
        const request = ++revision;
        const previous = get();
        const target = next.pluginDock === undefined ? previous.pluginDock : next.pluginDock;
        const same =
          previous.pluginDock?.mountId === target?.mountId &&
          previous.pluginDock?.instanceId === target?.instanceId;
        const leaving =
          previous.assistView === PLUGIN_DOCK_ID && (next.assistView !== PLUGIN_DOCK_ID || !same);
        if (leaving && hasPluginDockGuards() && !(await mayLeavePluginDock())) return false;
        if (request !== revision || !available()) return false;
        const retain = next.assistView === PLUGIN_DOCK_ID || next.assistCovered === PLUGIN_DOCK_ID;
        onShow?.();
        set({ ...next, pluginDock: retain ? target : null });
        return true;
      };
      const fromUi = (next: DockChange) => {
        void change(next).catch(error => console.error("右栏离开守卫失败", error));
      };
      return {
        sidebarCollapsed: false,
        sidebarWidth: 218,
        navSectionCollapsed: {},
        pluginDock: null,
        assistView: null,
        assistCovered: null,
        assistExpanded: false,
        assistWidth: ASSIST_DEFAULT_W,
        sidebarAutoCollapsed: false,
        // 手动切换侧栏即接管：不再在关闭辅助栏时自动还原
        toggleSidebar: () =>
          set(s => ({
            sidebarCollapsed: !s.sidebarCollapsed,
            sidebarAutoCollapsed: false,
          })),
        setSidebarCollapsed: collapsed =>
          set({ sidebarCollapsed: collapsed, sidebarAutoCollapsed: false }),
        setSidebarWidth: w =>
          set({
            sidebarWidth: Math.min(SIDEBAR_MAX_W, Math.max(SIDEBAR_MIN_W, Math.round(w))),
          }),
        toggleNavSection: label =>
          set(s => ({
            navSectionCollapsed: {
              ...s.navSectionCollapsed,
              [label]: !(s.navSectionCollapsed[label] ?? false),
            },
          })),
        toggleAssist: () =>
          get().assistView === "chat" ? get().hideAssist() : get().showAssist("chat"),
        showAssist: id =>
          fromUi({
            assistView: id,
            assistCovered: null,
            assistExpanded: get().assistView === id && get().assistExpanded,
          }),
        showAssistOver: (id, available, onShow) => {
          const { assistView, assistCovered, assistExpanded } = get();
          return change(
            {
              assistView: id,
              assistCovered: assistView === id ? assistCovered : (assistCovered ?? assistView),
              assistExpanded: assistView === id && assistExpanded,
            },
            available,
            onShow
          );
        },
        openPluginDock: (target, available) =>
          change(
            {
              pluginDock: target,
              assistView: PLUGIN_DOCK_ID,
              assistCovered: null,
              assistExpanded: get().assistView === PLUGIN_DOCK_ID && get().assistExpanded,
            },
            available
          ),
        releasePluginDock: mountId => {
          const { pluginDock, assistView, assistCovered } = get();
          if (mountId !== undefined && pluginDock?.mountId !== mountId) return;
          ++revision;
          if (!pluginDock) return;
          if (assistView === PLUGIN_DOCK_ID)
            set({ assistView: null, assistCovered: null, assistExpanded: false, pluginDock: null });
          else
            set({
              assistCovered: assistCovered === PLUGIN_DOCK_ID ? null : assistCovered,
              pluginDock: null,
            });
        },
        closeAssist: id => {
          const { assistView, assistCovered } = get();
          if (id === undefined || assistView === id)
            fromUi({ assistView: assistCovered, assistCovered: null, assistExpanded: false });
        },
        hideAssist: () => fromUi({ assistView: null, assistCovered: null, assistExpanded: false }),
        setAssistExpanded: expanded => set({ assistExpanded: expanded }),
        setAssistWidth: w =>
          set({
            assistWidth: Math.min(ASSIST_MAX_W, Math.max(ASSIST_MIN_W, Math.round(w))),
          }),
        setSidebarAutoCollapsed: auto => set({ sidebarAutoCollapsed: auto }),
      };
    },
    {
      name: "tau-shell",
      version: 1,
      // 临时视图（网页等）不跨重启：只记住对话是否开着
      partialize: state => ({
        sidebarCollapsed: state.sidebarCollapsed,
        sidebarWidth: state.sidebarWidth,
        navSectionCollapsed: state.navSectionCollapsed,
        sidebarAutoCollapsed: state.sidebarAutoCollapsed,
        assistWidth: state.assistWidth,
        assistView: state.assistView === "chat" || state.assistCovered === "chat" ? "chat" : null,
      }),
      migrate: (persisted, version) => {
        const state = (persisted ?? {}) as Record<string, unknown>;
        if (version < 1) {
          const { assistOpen, ...rest } = state;
          return { ...rest, assistView: assistOpen ? "chat" : null };
        }
        return state;
      },
    }
  )
);
