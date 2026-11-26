import { METRIC_VALUE, MetricText } from "./MetricText";
/**
 * 今日视图（原统计页并入）—— 一整张纸：纸顶固定问候与今天的数字（hero，不是面板），
 * 下方按首页布局渲染面板：内置面板见 ../panels.ts，用户经纸顶「调整首页」进入编辑模式
 * （hero 右侧的数字换成提示与「恢复默认 / 完成」），拖动调整顺序与隐藏，布局随笔记库保存。同一份数据全页只出现一次；每一行点击都落到具体项，目标页经页面参数定位。
 *
 * 模块分工：专注 = 番茄钟（pomodoro 页 / pomodoro 命令）；
 * 日程 = calendar 命令 + schedule page。两者独立，勿混用。
 *
 * 纸上的卡片用细描边（Panel variant="outline"），不再叠阴影。
 * 容器查询响应式（@container 在根）：面板内的多列行按 1180/860 两档收列。
 */

import { useState } from "react";
import { useHomeI18n } from "../i18n";
import { minutesToHM } from "../format";
import { LayoutDashboard } from "lucide-react";
import { MotionConfig } from "motion/react";
import { usePage, useOverlayDismiss } from "@/page/PageProvider";
import { Button, IconButton, Loading, FadeScroll } from "@tau/ui";
import { useHomeSnapshot } from "../queries";
import { useHomeLayout } from "../layoutQueries";
import { BUILTIN_HOME_PANELS } from "../panels";
import { useDesktopPlugins } from "@/app/plugins/context";
import { useFeatures } from "@/app/featureQueries";
import { HomePanels, HomeScrollRootContext } from "./HomePanels";
import { pluginHomePanel } from "./PluginHomePanel";
import "../home.css";

export function HomeView() {
  const { t, locale } = useHomeI18n();
  const number = new Intl.NumberFormat(locale);
  const { data, loading } = useHomeSnapshot();
  const { layout, save } = useHomeLayout();
  const { navigator } = usePage();
  const plugins = useDesktopPlugins();
  // 插件面板排在内置面板之后作为默认顺序；包装组件按注册缓存，重渲染不会重新挂载
  const { isEnabled } = useFeatures();
  const panels = [
    ...BUILTIN_HOME_PANELS.filter(panel => !panel.feature || isEnabled(panel.feature)),
    ...(plugins?.listHomePanels() ?? []).map(pluginHomePanel),
  ];
  // 编辑模式：拖动调整面板，Esc 经浮层仲裁退出
  const [editing, setEditing] = useState(false);
  useOverlayDismiss(() => setEditing(false), editing);
  // 纸内滚动容器：回顾段懒加载以它为可见性根（state 而非 ref，挂载后触发回顾段重新接线）
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);

  if (loading || !layout) {
    return <Loading label={t("loading")} />;
  }
  if (!data) return null;

  return (
    // @container：容器查询锚点；编辑模式的让位动画跟随系统「减少动态效果」
    <MotionConfig reducedMotion="user">
      <div className="@container mx-auto flex h-full min-h-0 w-full max-w-[1720px] flex-col px-4 pt-1 pb-4">
        <div className="bg-surface shadow-card rounded-tau-lg flex min-h-0 flex-1 flex-col overflow-hidden">
          {/* hero：只放今天的数字，每项全页仅此一处 */}
          <header className="mt-6 mb-2 flex flex-none items-baseline gap-4 px-8">
            <h1 className="text-tau-title-lg shrink-0 font-semibold tracking-[-0.01em] whitespace-nowrap">
              {t(greeting())}
            </h1>
            <span className="text-tau-sm text-ink-2 shrink-0 whitespace-nowrap">
              {formatToday(locale)}
            </span>
            {/* 右侧一组按首个子元素的基线对齐 hero，按钮与这行文字居中对齐；编辑时数字换成操作 */}
            <div className="ml-auto flex min-w-0 items-center gap-3">
              {editing ? (
                <>
                  <span className="text-tau-meta text-ink-3 ease-tau-out min-w-0 truncate transition-opacity duration-200 starting:opacity-0">
                    {t("layout.instructions")}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="-my-1 shrink-0"
                    onClick={() => save([])}
                  >
                    {t("layout.reset")}
                  </Button>
                  <Button
                    size="sm"
                    variant="primary"
                    className="-my-1 shrink-0"
                    onClick={() => setEditing(false)}
                  >
                    {t("layout.done")}
                  </Button>
                </>
              ) : (
                <>
                  <span className="text-tau-sm text-ink-2 ease-tau-out min-w-0 truncate whitespace-nowrap tabular-nums transition-opacity duration-200 starting:opacity-0">
                    <button
                      type="button"
                      title={t("hero.focusLink")}
                      onClick={() => navigator.push("pomodoro")}
                      className="text-inherit"
                    >
                      <MetricText text={t("hero.focus", { value: METRIC_VALUE })}>
                        {minutesToHM(data.focus.focusMinutes)}
                      </MetricText>
                      {data.focus.sessionCount > 0 &&
                        t("hero.sessions", {
                          count: data.focus.sessionCount,
                          value: number.format(data.focus.sessionCount),
                        })}
                    </button>
                    <span className="text-ink-3 mx-2">·</span>
                    <MetricText
                      text={t("hero.written", {
                        count: data.todayStats.wordsWritten,
                        value: METRIC_VALUE,
                      })}
                    >
                      {number.format(data.todayStats.wordsWritten)}
                    </MetricText>
                    <span className="text-ink-3 mx-2">·</span>
                    <MetricText
                      text={t("hero.created", {
                        count: data.todayStats.cardsCreated + data.todayStats.articlesCreated,
                        value: METRIC_VALUE,
                      })}
                    >
                      {number.format(
                        data.todayStats.cardsCreated + data.todayStats.articlesCreated
                      )}
                    </MetricText>
                    <span className="text-ink-3 mx-2">·</span>
                    <MetricText
                      text={t("hero.streak", { count: data.heatmap.streak, value: METRIC_VALUE })}
                    >
                      {number.format(data.heatmap.streak)}
                    </MetricText>
                  </span>
                  <IconButton
                    aria-label={t("layout.customize")}
                    title={t("layout.customize")}
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
            className="mb-4 flex min-h-0 flex-1 flex-col gap-3 pt-1 pr-[26px] pb-2 pl-8"
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

function formatToday(locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(new Date());
}

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return "greeting.night";
  if (h < 11) return "greeting.morning";
  if (h < 14) return "greeting.noon";
  if (h < 18) return "greeting.afternoon";
  return "greeting.evening";
}
