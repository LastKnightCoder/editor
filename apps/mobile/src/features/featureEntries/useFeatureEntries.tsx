import { useMobileI18n } from "../../services/i18n-react";
import type { MobileMessageKey } from "../../services/i18n";
// 功能入口清单：内置功能在前、插件入口按启用顺序接在后面，再按用户排序。
// 「我的」功能宫格与平板左导航条的自选段都从这里取，两处顺序始终一致。

import type { ReactNode } from "react";
import { Article, Cards, FolderOpen, ListChecks, Timer } from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";
import type { RouteEntry } from "../../router";
import { useNavigator } from "../../router";
import { useAppContext } from "../../app/AppContext";
import { useTodoStore } from "../todo/store/useTodoStore";
import { usePluginFeatureEntries } from "../plugins/usePluginFeatureEntries";
import { sortByFeatureOrder, useFeatureOrder } from "./featureOrder";

export type FeatureEntry = {
  key: string;
  label: string;
  /** 宫格里的 46px 图标块 */
  tile: ReactNode;
  /** 导航条里的单色图标（随文字颜色），插件无图标时为带色首字块 */
  glyph: ReactNode;
  /** 栈里的这一页属于该入口：导航条据此高亮、再点时回到它 */
  owns: (entry: RouteEntry) => boolean;
  open: () => void;
};

type BuiltinSpec = {
  key: string;
  page: string;
  labelKey: MobileMessageKey;
  icon: Icon;
  tone: string;
  soft: string;
};

const BUILTINS: readonly BuiltinSpec[] = [
  {
    key: "todo",
    page: "todo",
    labelKey: "feature.todo",
    icon: ListChecks,
    tone: "var(--tau-tag-4)",
    soft: "var(--tau-tag-4-soft)",
  },
  {
    key: "article",
    page: "articles",
    labelKey: "feature.article",
    icon: Article,
    tone: "var(--tau-accent)",
    soft: "var(--tau-accent-soft)",
  },
  {
    key: "project",
    page: "projects",
    labelKey: "feature.project",
    icon: FolderOpen,
    tone: "var(--tau-tag-3)",
    soft: "var(--tau-tag-3-soft)",
  },
  {
    key: "flashcard",
    page: "flashcardHome",
    labelKey: "feature.flashcard",
    icon: Cards,
    tone: "var(--tau-tag-3)",
    soft: "var(--tau-tag-3-soft)",
  },
  {
    key: "pomodoro",
    page: "pomodoro",
    labelKey: "feature.pomodoro",
    icon: Timer,
    tone: "var(--tau-tag-5)",
    soft: "var(--tau-tag-5-soft)",
  },
];

export function useFeatureEntries(): FeatureEntry[] {
  const { t } = useMobileI18n();
  const navigator = useNavigator();
  const app = useAppContext();
  const plugins = usePluginFeatureEntries();
  const order = useFeatureOrder(state => state.order);

  const builtins = BUILTINS.map((spec): FeatureEntry => {
    const Glyph = spec.icon;
    return {
      key: spec.key,
      label: t(spec.labelKey),
      tile: (
        <span
          className="grid h-[46px] w-[46px] place-items-center rounded-[17px]"
          style={{ background: spec.soft }}
        >
          <Glyph size={26} weight="regular" color={spec.tone} aria-hidden="true" />
        </span>
      ),
      glyph: <Glyph size={22} weight="regular" aria-hidden="true" />,
      owns: entry => entry.key === spec.page,
      open: () => {
        if (spec.key === "todo") {
          const databaseName =
            app.syncSettings.safeSetting?.database?.active ??
            app.bootstrap.databases?.activeDatabase ??
            null;
          void useTodoStore.getState().initialize(databaseName);
        }
        navigator.push(spec.page);
      },
    };
  });

  return sortByFeatureOrder([...builtins, ...plugins], order);
}
