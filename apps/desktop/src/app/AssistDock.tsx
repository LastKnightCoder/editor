/**
 * 右侧辅助栏：位于标题栏之下、正文右侧，承载 assistViews 登记的视图（对话、网页……），
 * 同一时刻只显示一个；shellStore.assistView 是当前视图，assistCovered 是被临时视图盖住的那个。
 *
 * 空间裁决见 assistLayout.ts：并排 → 正文不足时自动收起侧栏（关闭时还原）→
 * 仍不足则覆盖在正文之上（Esc 退场）。视图可声明在某些页面让位（对话页上不再显示对话栏）。
 * keepAlive 视图首次显示才挂载、之后保活（滚动位置与流式中的回答不丢）；其余视图关闭即卸载。
 * 开合从右缘滑入滑出；放大（assistExpanded）时同一个节点盖住正文区，内容不重挂载，
 * 正文页只隐藏不卸载（滚动位置保留）。
 */

import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { ResizeHandle, cn } from "@tau/ui";
import { usePage, useOverlayDismiss } from "@/page/PageProvider";
import { ASSIST_MAX_W, ASSIST_MIN_W, useShellStore } from "./shellStore";
import { resolveAssistLayout } from "./assistLayout";
import { ASSIST_MORPH_CLASS } from "./assistMorph";
import type { AssistViewDefinition } from "./assistViews";
import { useShownOnPage, useVisibleAssist } from "./useVisibleAssist";
import { ErrorState, RecoverableBoundary } from "@/components/ErrorState";
import "../assist-views";

/** 滑入滑出时长，与侧栏宽度过渡同档 */
const SLIDE_MS = 220;

export function AssistDock() {
  const { state } = usePage();
  const topId = state.back[state.back.length - 1]?.id;
  const { view, expanded } = useVisibleAssist();
  const shownOnPage = useShownOnPage();
  const visible = !!view;
  const width = useShellStore(s => s.assistWidth);
  const sidebarWidth = useShellStore(s => s.sidebarWidth);
  const sidebarCollapsed = useShellStore(s => s.sidebarCollapsed);
  const coveredId = useShellStore(s => s.assistCovered);
  const closeAssist = useShellStore(s => s.closeAssist);

  const windowWidth = useWindowWidth();
  const layout = resolveAssistLayout({
    windowWidth,
    sidebarWidth,
    sidebarCollapsed,
    assistWidth: width,
  });

  // 自动收起 / 还原侧栏只在「打开、关闭、窗口或栏宽变化」时裁决：
  // 不随侧栏状态重跑——用户打开辅助栏后手动展开侧栏，尊重用户选择
  useEffect(() => {
    const shell = useShellStore.getState();
    if (visible) {
      const next = resolveAssistLayout({
        windowWidth,
        sidebarWidth: shell.sidebarWidth,
        sidebarCollapsed: shell.sidebarCollapsed,
        assistWidth: width,
      });
      if (next.collapseSidebar)
        useShellStore.setState({
          sidebarCollapsed: true,
          sidebarAutoCollapsed: true,
        });
    } else if (shell.sidebarAutoCollapsed) {
      useShellStore.setState({
        sidebarCollapsed: false,
        sidebarAutoCollapsed: false,
      });
    }
  }, [visible, windowWidth, width]);

  // 放大只覆盖当前页：换页即收回右栏
  useEffect(() => {
    if (useShellStore.getState().assistExpanded) useShellStore.getState().setAssistExpanded(false);
  }, [topId]);

  // 定位按布局模式、Esc 按可见：退场滑动期间保持原定位，不在覆盖 / 并排间跳变
  const overlay = layout.mode === "overlay" && !expanded;
  useOverlayDismiss(() => closeAssist(), visible && overlay);

  // 渲染期派生而非 effect：形变过渡在 flushSync 内一次提交就要拿到停靠栏。
  // shown 在退场滑动期间仍指向刚关闭的视图，内容不闪空
  const [shown, setShown] = useState<AssistViewDefinition | undefined>(view);
  const [alive, setAlive] = useState<readonly AssistViewDefinition[]>(() =>
    view?.keepAlive ? [view] : []
  );
  if (view && shown !== view) setShown(view);
  if (view?.keepAlive && !alive.includes(view)) setAlive([...alive, view]);
  useEffect(() => {
    if (visible) return;
    const timer = setTimeout(() => setShown(undefined), SLIDE_MS);
    return () => clearTimeout(timer);
  }, [visible]);
  if (!shown && alive.length === 0) return null;

  const covered = shownOnPage(coveredId);
  const mountedViews = shown && !alive.includes(shown) ? [...alive, shown] : alive;

  return (
    <aside
      aria-label={shown?.label ?? "辅助栏"}
      aria-hidden={!visible}
      inert={!visible}
      style={
        (expanded ? undefined : { width, ["--assist-w" as string]: `${width}px` }) as CSSProperties
      }
      className={cn(
        "bg-surface rounded-tau-lg flex min-h-0 flex-col",
        "ease-tau-out transition-[margin,opacity,visibility] duration-[220ms]",
        // 首帧从收起态起滑；形变过渡期间一步到位
        "starting:mr-[calc(var(--assist-w)*-1)] starting:opacity-0",
        "[[data-morph]_&]:transition-none",
        expanded
          ? "shadow-card absolute inset-x-4 top-0 bottom-4 z-30"
          : overlay
            ? "shadow-float absolute right-[18px] bottom-[18px] top-0 z-30 mr-0 flex-none"
            : "shadow-card relative mr-[18px] mb-[18px] flex-none",
        // 收起：右外边距抵掉自身宽度，并排时不再占位，整体滑出右缘
        visible
          ? shown?.id === "chat" && ASSIST_MORPH_CLASS
          : "invisible mr-[calc(var(--assist-w)*-1)] opacity-0"
      )}
    >
      {!expanded && <AssistResizer />}
      {mountedViews.map(item => {
        const active = item === shown;
        const Component = item.component;
        return (
          <div key={item.id} className={active ? "flex min-h-0 flex-1 flex-col" : "hidden"}>
            {/* 视图崩溃只替换栏内，不连带正文页 */}
            <RecoverableBoundary
              fallback={({ error, reset }) => (
                <ErrorState
                  error={error}
                  title={`${item.label}出错了`}
                  description="右栏渲染时发生了意外错误，你的数据没有丢失。"
                  actions={[
                    { label: "重试", onClick: reset },
                    { label: "关闭", onClick: () => closeAssist(item.id) },
                  ]}
                />
              )}
            >
              <Component
                open={active && visible}
                onClose={() => closeAssist(item.id)}
                covered={
                  active && covered
                    ? {
                        label: covered.label,
                        restore: () => closeAssist(item.id),
                      }
                    : undefined
                }
              />
            </RecoverableBoundary>
          </div>
        );
      })}
    </aside>
  );
}

/** 左缘拖宽热区（停靠栏在热区右边：向左拖变宽） */
function AssistResizer() {
  const width = useShellStore(s => s.assistWidth);
  const setWidth = useShellStore(s => s.setAssistWidth);
  return (
    <ResizeHandle
      value={width}
      min={ASSIST_MIN_W}
      max={ASSIST_MAX_W}
      onChange={setWidth}
      side="right"
      label="右栏宽度"
      className="absolute top-4 bottom-4 -left-2 z-10"
    />
  );
}

function useWindowWidth() {
  const [width, setWidth] = useState(() => window.innerWidth);
  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return width;
}
