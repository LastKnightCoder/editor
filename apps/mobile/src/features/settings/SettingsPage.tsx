import { useSettingsShellI18n } from "./shell.i18n";
// 设置根页（我的 Tab）：功能宫格 + 总览入口。
// 二级模块由 settingsModule 路由页承载（独立栈级，返回/滚动由 router 管理）。

import type { ReactNode } from "react";
import { useRef } from "react";
import { Search } from "lucide-react";
import { useEdgeFade } from "../../hooks/useScrollState";
import { OverviewSection } from "./components/OverviewSection";
import type { SettingModuleKey, SettingsPageProps } from "./components/types";
import { FeatureGrid } from "./components/FeatureGrid";
import type { FeatureEntry } from "../featureEntries/useFeatureEntries";

type SettingsScreenProps = SettingsPageProps & {
  pluginEntries?: ReactNode;
  /** 功能宫格：内置功能与插件入口，已按用户排序 */
  features: readonly FeatureEntry[];
  /** 打开二级模块（压入 settingsModule 路由页） */
  onOpenModule: (module: SettingModuleKey) => void;
  /** 页头：全局搜索 */
  onOpenSearch?: () => void;
};

export function SettingsPage(props: SettingsScreenProps) {
  const { t } = useSettingsShellI18n();
  const scrollRef = useRef<HTMLDivElement>(null);
  useEdgeFade(scrollRef);
  return (
    <div className="mobile-kb-screen bg-page fixed inset-0 z-50 flex flex-col">
      <header className="mx-auto flex w-full max-w-[1120px] items-center justify-between px-[18px] pt-[calc(20px+var(--mobile-safe-top))]">
        <h1 className="text-ink-1 text-2xl font-extrabold tracking-tight">{t("me")}</h1>
        <button
          type="button"
          onClick={props.onOpenSearch ?? (() => {})}
          aria-label={t("search")}
          // 中等与宽档由左导航条底部的搜索承担
          className="medium:hidden bg-surface text-ink-2 shadow-card grid h-[42px] w-[42px] place-items-center rounded-[15px] transition-transform duration-200 active:scale-88"
        >
          <Search size={20} strokeWidth={1.9} aria-hidden="true" />
        </button>
      </header>

      <div ref={scrollRef} className="edge-fade-scroll dock-pad flex-1 overflow-y-auto px-4">
        <div className="mx-auto w-full max-w-[1088px]">
          <div className="mt-4">
            <FeatureGrid items={props.features} />
          </div>
          {props.pluginEntries}
          <div className="mt-4">
            <OverviewSection
              activeResource={props.safeSetting?.imageBed.active ?? "local"}
              activeDatabase={props.databases?.activeDatabase}
              imageAppearance={props.safeSetting?.appearance?.image}
              onOpenModule={props.onOpenModule}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
