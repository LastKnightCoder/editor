/**
 * 今日视图（原统计页并入）—— 一整张纸：纸顶固定问候与今天的数字（hero，不是面板），
 * 下方按首页布局渲染面板（D-182）：内置面板见 ../panels.ts，用户经纸顶「调整首页」进入编辑模式
 * （hero 右侧的数字换成提示与「恢复默认 / 完成」），拖动调整顺序与隐藏，布局随笔记库保存。同一份数据全页只出现一次；每一行点击都落到具体项，目标页经页面参数定位。
 *
 * 模块分工：专注 = 番茄钟（pomodoro 页 / pomodoro 命令）；
 * 日程 = calendar 命令 + schedule page。两者独立，勿混用。
 *
 * 纸上的卡片用细描边（Panel variant="outline"），不再叠阴影。
 * 容器查询响应式（@container 在根）：面板内的多列行按 1180/860 两档收列。
 */

import { useState } from "react";
import { LayoutDashboard } from "lucide-react";
import { MotionConfig } from "motion/react";
import { usePage, useOverlayDismiss } from "@/page/PageProvider";
import { Button, IconButton, Loading, FadeScroll } from "@tau/ui";
import { useHomeSnapshot, minutesToHM } from "../queries";
import { useHomeLayout } from "../layoutQueries";
import { BUILTIN_HOME_PANELS } from "../panels";
import { useDesktopPlugins } from "@/app/plugins/context";
import { HomePanels, HomeScrollRootContext } from "./HomePanels";
import { pluginHomePanel } from "./PluginHomePanel";
import "../home.css";

export function HomeView() {
  const { data, loading } = useHomeSnapshot();
  const { layout, save } = useHomeLayout();
  const { navigator } = usePage();
  const plugins = useDesktopPlugins();
  // 插件面板排在内置面板之后作为默认顺序；包装组件按注册缓存，重渲染不会重新挂载
  const panels = [
    ...BUILTIN_HOME_PANELS,
    ...(plugins?.listHomePanels() ?? []).map(pluginHomePanel),
  ];
  // 编辑模式：拖动调整面板，Esc 经浮层仲裁退出（D-003）
  const [editing, setEditing] = useState(false);
  useOverlayDismiss(() => setEditing(false), editing);
  // 纸内滚动容器：回顾段懒加载以它为可见性根（state 而非 ref，挂载后触发回顾段重新接线）
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);

  if (loading || !layout) {
    return <Loading />;
  }
  if (!data) return null;

  return (
    // @container：容器查询锚点；编辑模式的让位动画跟随系统「减少动态效果」
    <MotionConfig reducedMotion="user">
      <div className="@container mx-auto flex h-full min-h-0 w-full max-w-[1720px] flex-col px-4 pb-4 pt-1">
        <div className="bg-surface shadow-card rounded-tau-lg flex min-h-0 flex-1 flex-col overflow-hidden">
          {/* hero：只放今天的数字，每项全页仅此一处 */}
          <header className="mb-2 mt-6 flex flex-none items-baseline gap-4 px-8">
            <h1 className="text-tau-title-lg shrink-0 whitespace-nowrap font-semibold tracking-[-0.01em]">
              {greeting()}
            </h1>
            <span className="text-tau-sm text-ink-2 shrink-0 whitespace-nowrap">
              {formatToday()}
            </span>
            {/* 右侧一组按首个子元素的基线对齐 hero，按钮与这行文字居中对齐；编辑时数字换成操作 */}
            <div className="ml-auto flex min-w-0 items-center gap-3">
              {editing ? (
                <>
                  <span className="text-tau-meta text-ink-3 ease-tau-out starting:opacity-0 min-w-0 truncate transition-opacity duration-200">
                    拖动面板调整顺序，拖到底部「已隐藏」即隐藏 · Esc 取消
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="-my-1 shrink-0"
                    onClick={() => save([])}
                  >
                    恢复默认
                  </Button>
                  <Button
                    size="sm"
                    variant="primary"
                    className="-my-1 shrink-0"
                    onClick={() => setEditing(false)}
                  >
                    完成
                  </Button>
                </>
              ) : (
                <>
                  <span className="text-tau-sm text-ink-2 ease-tau-out starting:opacity-0 min-w-0 truncate whitespace-nowrap tabular-nums transition-opacity duration-200">
                    <button
                      type="button"
                      title="前往番茄专注"
                      onClick={() => navigator.push("pomodoro")}
                      className="text-inherit"
                    >
                      已专注{" "}
                      <b className="text-accent-text font-semibold">
                        {minutesToHM(data.focus.focusMinutes)}
                      </b>
                      {data.focus.sessionCount > 0 && ` · ${data.focus.sessionCount} 番茄`}
                    </button>
                    <span className="text-ink-3 mx-2">·</span>写下{" "}
                    <b className="text-accent-text font-semibold">{data.todayStats.wordsWritten}</b>{" "}
                    字<span className="text-ink-3 mx-2">·</span>新建{" "}
                    <b className="text-accent-text font-semibold">
                      {data.todayStats.cardsCreated + data.todayStats.articlesCreated}
                    </b>{" "}
                    条<span className="text-ink-3 mx-2">·</span>连续活跃{" "}
                    <b className="text-accent-text font-semibold">{data.heatmap.streak}</b> 天
                  </span>
                  <IconButton
                    aria-label="调整首页"
                    title="调整首页"
                    onClick={() => setEditing(true)}
                    className="-my-1 size-7 shrink-0"
                  >
                    <LayoutDashboard className="size-[15px]" strokeWidth={1.75} />
                  </IconButton>
                </>
              )}
            </div>
          </header>

          {/* 滚动区：FadeScroll（右侧 6px 透明边 + pr-[26px] = 左侧 pl-8），离纸底 16px */}
          <FadeScroll
            layoutScroll
            scrollRef={setScrollEl}
            className="mb-4 flex min-h-0 flex-1 flex-col gap-3 pb-2 pl-8 pr-[26px] pt-1"
          >
            <HomeScrollRootContext.Provider value={scrollEl}>
              <HomePanels panels={panels} layout={layout} editing={editing} onChange={save} />
            </HomeScrollRootContext.Provider>
          </FadeScroll>
        </div>
      </div>
    </MotionConfig>
  );
}

function formatToday(): string {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(new Date());
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return "夜深了";
  if (h < 11) return "早上好";
  if (h < 14) return "中午好";
  if (h < 18) return "下午好";
  return "晚上好";
}
