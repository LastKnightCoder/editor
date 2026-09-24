/**
 * 功能模块 —— 按分类分组的模块开关（mockups/settings/index.html 第三版「功能模块」）。
 *
 * 移植 legacy ModuleSetting：每类一个分组面板（说明 = 已启用 x / y），面板内两列网格，
 * 每项 = 图标 + 模块名 + 开关；开关写 module.<key>.enable（与 legacy 同为 produce 整体替换，
 * 无其他副作用）。legacy MODULE_CONFIG 缺失的模块（闪卡中心 / Skill 管理 / RSS 订阅 / 稍后读 /
 * 网页浏览）按 mockup 归类；未知模块兜底进「其他」。
 * 修 legacy bug：「设置」模块（key settings）可以被关掉——这里不渲染它的开关。
 */

import clsx from "clsx";
import { produce } from "immer";
import {
  Bookmark,
  BookOpen,
  Calendar,
  CircleHelp,
  Database,
  File as FileIcon,
  FileText,
  FolderKanban,
  Globe,
  Layers3,
  ListTodo,
  MessagesSquare,
  Newspaper,
  NotebookPen,
  Presentation,
  Radio,
  Rss,
  Timer,
  Users,
  Wand2,
  type LucideIcon,
} from "lucide-react";
import { Switch } from "@tau/ui";
import useSettingStore, { type ISetting } from "@/stores/useSettingStore";
import { SettingsGroup } from "../components/SettingsGroup";

type ModuleKey = keyof ISetting["module"];

/** 系统模块：始终启用，不提供开关 */
const SYSTEM_MODULE_KEY = "settings";

const CATEGORIES: Array<{ label: string; modules: Array<[key: string, icon: LucideIcon]> }> = [
  {
    label: "内容创作",
    modules: [
      ["card", FileText],
      ["article", Newspaper],
      ["whiteBoard", Presentation],
      ["project", FolderKanban],
    ],
  },
  {
    label: "知识管理",
    modules: [
      ["pdf", FileIcon],
      ["weread", BookOpen],
      ["feed", Rss],
      ["vecDocuments", Database],
      ["rssSubscription", Radio],
      ["readLater", Bookmark],
      ["webview", Globe],
    ],
  },
  {
    label: "个人管理",
    modules: [
      ["dailyNote", NotebookPen],
      ["pomodoro", Timer],
      ["todo", ListTodo],
      ["question", CircleHelp],
      ["calendar", Calendar],
      ["chatManagement", MessagesSquare],
    ],
  },
  {
    label: "学习与工具",
    modules: [
      ["flashcard", Layers3],
      ["skillManagement", Wand2],
      ["collaboration", Users],
    ],
  },
];

const KNOWN_KEYS = new Set(CATEGORIES.flatMap(c => c.modules.map(([key]) => key)));

interface ModuleItem {
  key: ModuleKey;
  name: string;
  enable: boolean;
  icon: LucideIcon;
}

export function ModuleSection() {
  const modules = useSettingStore(s => s.setting.module);

  const toItem = (key: string, icon: LucideIcon): ModuleItem | null => {
    const mod = modules[key as ModuleKey];
    if (!mod) return null;
    return { key: key as ModuleKey, name: mod.name, enable: mod.enable, icon };
  };

  const groups = CATEGORIES.map(category => ({
    label: category.label,
    items: category.modules
      .map(([key, icon]) => toItem(key, icon))
      .filter((item): item is ModuleItem => item !== null),
  }));
  const others = Object.keys(modules)
    .filter(key => key !== SYSTEM_MODULE_KEY && !KNOWN_KEYS.has(key))
    .map(key => toItem(key, FileText))
    .filter((item): item is ModuleItem => item !== null);
  if (others.length > 0) groups.push({ label: "其他", items: others });

  const setEnable = (key: ModuleKey, enable: boolean) => {
    useSettingStore.setState(s => ({
      setting: produce(s.setting, draft => {
        draft.module[key].enable = enable;
      }),
    }));
  };

  return (
    <>
      {groups
        .filter(group => group.items.length > 0)
        .map(group => (
          <SettingsGroup
            key={group.label}
            title={group.label}
            description={`已启用 ${group.items.filter(item => item.enable).length} / ${group.items.length}`}
          >
            <div className="grid grid-cols-2 gap-x-2">
              {group.items.map(({ key, name, enable, icon: Icon }) => (
                <div key={key} className="rounded-tau-sm flex items-center gap-3 px-3 py-[9px]">
                  <Icon
                    size={16}
                    strokeWidth={1.75}
                    className={clsx("flex-none", enable ? "text-ink-2" : "text-ink-3")}
                  />
                  <span
                    className={clsx(
                      "text-tau-body min-w-0 flex-1 truncate font-medium",
                      enable ? "text-ink-1" : "text-ink-3"
                    )}
                  >
                    {name}
                  </span>
                  <Switch
                    aria-label={name}
                    checked={enable}
                    onCheckedChange={checked => setEnable(key, checked)}
                  />
                </div>
              ))}
            </div>
          </SettingsGroup>
        ))}
    </>
  );
}
