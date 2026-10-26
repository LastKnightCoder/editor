// 我的页根视图（v2 模板）：行内直显关键值，数据域入口收敛为两个独立页面——
// 数据库同步（同步中心：状态 + 服务 + 数据库切换）/ 资源与存储（资源同步 + 存储目标）。
// 外观（主题 / 图片渲染 / 正文字体 overlay 路由页）/ 编辑器（打开文档时）/ 关于与更新（版本、新版本提示）。

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  type ImageBorderRadiusPreset,
  type ImageShadowPreset,
} from "@tau/editor/extensions/media/types";
import {
  IMAGE_BORDER_RADIUS_OPTIONS,
  IMAGE_SHADOW_OPTIONS,
  normalizeImageShadowPreset,
} from "@tau/editor/extensions/media/appearance";
import {
  IconAudioLines,
  IconBookOpen,
  IconCircleHelp,
  IconCloud,
  IconFolder,
  IconImage,
  IconMic,
  IconMoon,
  IconType,
  IconUsers,
} from "./ui";
import { useAppVersion } from "../about/useAppVersion";
import { useAppUpdate, useAutoUpdateCheck } from "../about/appUpdate";
import { LOCAL_UPLOAD_ID, useUploadProviders } from "../upload/providers";
import { useSpeechInputProviders } from "../speech/providers";
import { getTheme } from "@tau/themes";
import { useThemeStore } from "@tau/themes/react";
import { useNavigator } from "../../../router";
import * as tauri from "../../../services/tauri";
import { useAppContext } from "../../../app/AppContext";
import { ActionSheet } from "../../../components/ActionSheet";
import {
  normalizeEditorOpenMode,
  withEditorOpenMode,
  type EditorOpenMode,
} from "../../../hooks/useEditorOpenMode";
import { normalizeReadingFontId, readingFontOption } from "../readingFont/fonts";
import { useInstalledReadingFonts } from "../readingFont/queries";
import type { SettingModule } from "./types";

const APPEARANCE_LABELS = { light: "浅色", dark: "深色", system: "跟随系统" } as const;

const EDITOR_OPEN_MODE_LABELS: Record<EditorOpenMode, string> = { read: "阅读", edit: "编辑" };

const EDITOR_OPEN_MODE_OPTIONS: Array<{ label: string; value: EditorOpenMode }> = [
  { label: "阅读模式", value: "read" },
  { label: "直接编辑", value: "edit" },
];

function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 MB";
  const mb = bytes / 1024 / 1024;
  if (mb >= 1024) return `${(mb / 1024).toFixed(2)} GB`;
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

type OverviewSectionProps = {
  activeResource: string;
  activeDatabase?: string;
  imageAppearance?: {
    borderRadius?: ImageBorderRadiusPreset;
    shadow?: ImageShadowPreset | boolean;
  };
  onOpenModule: (module: Exclude<SettingModule, null>) => void;
};

function findPresetLabel(
  options: Array<{ value: string; label: string }>,
  value: string | undefined
): string {
  return options.find(option => option.value === value)?.label ?? options[0].label;
}

export function OverviewSection(props: OverviewSectionProps) {
  const themeName = useThemeStore(state => getTheme(state.theme)?.name ?? "");
  const appearance = useThemeStore(state => state.appearance);
  const navigator = useNavigator();
  const providers = useUploadProviders();
  const { syncSettings } = useAppContext();

  // 数据库文件大小（主库 + WAL/SHM）
  const dbSizeQuery = useQuery({
    queryKey: ["settings", "db-size"],
    queryFn: () => tauri.getActiveDatabaseSize(),
    staleTime: 30_000,
  });

  const uploadTargetName =
    props.activeResource === LOCAL_UPLOAD_ID
      ? "这台手机"
      : (providers.find(item => item.id === syncSettings.safeSetting?.imageBed.plugin?.id)?.name ??
        props.activeResource);
  const ttsUsage = syncSettings.safeSetting?.ttsUsageSettings?.default;
  const ttsAccountName = syncSettings.safeSetting?.ttsProviders?.find(
    account => account.id === ttsUsage?.providerId
  )?.name;
  const speechProviders = useSpeechInputProviders();
  const speech = syncSettings.safeSetting?.speechInput;
  const speechInputName =
    speech?.active === "plugin"
      ? (speechProviders.find(item => item.id === speech.plugin.id)?.name ?? "插件已停用")
      : "系统识别";
  // 桌面端旧设置 shadow 为布尔（true 视作中阴影），展示前归一为 preset
  const imageAppearanceValue = `${findPresetLabel(
    IMAGE_BORDER_RADIUS_OPTIONS,
    props.imageAppearance?.borderRadius
  )} · ${findPresetLabel(
    IMAGE_SHADOW_OPTIONS,
    normalizeImageShadowPreset(props.imageAppearance?.shadow)
  )}`;

  return (
    <div className="space-y-4">
      <div className="space-y-3 px-1">
        <h2 className="text-ink-1 text-[16.5px] font-extrabold">数据</h2>
      </div>
      <div className="list-group">
        <ListItem
          icon={<IconCloud />}
          label="同步"
          value={
            dbSizeQuery.data != null
              ? `${props.activeDatabase ?? "本地"} · ${formatBytes(dbSizeQuery.data)}`
              : props.activeDatabase
          }
          onClick={() => props.onOpenModule("database")}
        />
        <ListItem
          icon={<IconFolder />}
          label="图片与附件"
          value={uploadTargetName}
          onClick={() => props.onOpenModule("resource")}
        />
      </div>

      <div className="space-y-3 px-1">
        <h2 className="text-ink-1 text-[16.5px] font-extrabold">协作</h2>
      </div>
      <div className="list-group">
        <ListItem
          icon={<IconUsers />}
          label="实时协作"
          onClick={() => props.onOpenModule("collaboration")}
        />
      </div>

      <div className="space-y-3 px-1">
        <h2 className="text-ink-1 text-[16.5px] font-extrabold">语音</h2>
      </div>
      <div className="list-group">
        <ListItem
          icon={<IconAudioLines />}
          label="语音合成"
          value={ttsAccountName ?? "未设置"}
          onClick={() => props.onOpenModule("voice")}
        />
        <ListItem
          icon={<IconMic />}
          label="语音输入"
          value={speechInputName}
          onClick={() => props.onOpenModule("speech-input")}
        />
      </div>

      <div className="space-y-3 px-1">
        <h2 className="text-ink-1 text-[16.5px] font-extrabold">外观</h2>
      </div>
      <div className="list-group">
        <ListItem
          icon={<IconMoon />}
          label="主题"
          value={`${themeName} · ${APPEARANCE_LABELS[appearance]}`}
          onClick={() => navigator.push("settings-theme")}
        />
        <ListItem
          icon={<IconImage />}
          label="图片渲染"
          value={imageAppearanceValue}
          onClick={() => navigator.push("settings-image-appearance")}
        />
        <ReadingFontItem />
      </div>

      <div className="space-y-3 px-1">
        <h2 className="text-ink-1 text-[16.5px] font-extrabold">编辑器</h2>
      </div>
      <div className="list-group">
        <EditorOpenModeItem />
      </div>

      <div className="space-y-3 px-1">
        <h2 className="text-ink-1 text-[16.5px] font-extrabold">关于</h2>
      </div>
      <div className="list-group">
        <AboutUpdateItem onOpen={() => props.onOpenModule("about")} />
      </div>
    </div>
  );
}

/** 「正文字体」：行尾显示所选字体；所选字体未下载（被清理）时提示需重新下载 */
export function ReadingFontItem() {
  const app = useAppContext();
  const navigator = useNavigator();
  const id = normalizeReadingFontId(app.syncSettings.safeSetting?.appearance?.readingFont);
  const installed = useInstalledReadingFonts().data;
  const missing =
    id !== "system" && installed !== undefined && !installed.some(font => font.id === id);
  return (
    <ListItem
      icon={<IconType />}
      label="正文字体"
      value={missing ? "需重新下载" : readingFontOption(id).label}
      onClick={() => navigator.push("settings-reading-font")}
    />
  );
}

/** 「打开文档时」：已有文档默认阅读态或直接编辑，点选即时写入 editor.openMode 并落盘 */
export function EditorOpenModeItem() {
  const app = useAppContext();
  const [open, setOpen] = useState(false);
  const value = normalizeEditorOpenMode(app.syncSettings.safeSetting?.editor?.openMode);
  return (
    <>
      <ListItem
        icon={<IconBookOpen />}
        label="打开文档时"
        value={EDITOR_OPEN_MODE_LABELS[value]}
        onClick={() => setOpen(true)}
      />
      <ActionSheet
        open={open}
        title="打开文档时"
        items={EDITOR_OPEN_MODE_OPTIONS.map(option => ({
          label: option.label,
          selected: option.value === value,
          onClick: () =>
            app.syncSettings.updateSetting(prev => withEditorOpenMode(prev, option.value), {
              persist: true,
            }),
        }))}
        onClose={() => setOpen(false)}
      />
    </>
  );
}

/** 「关于与更新」：进入「我的」即按需检查更新（仅 Android），有新版本时行尾换成提示 */
export function AboutUpdateItem(props: { onOpen: () => void }) {
  const appVersion = useAppVersion();
  const latestVersion = useAppUpdate(state =>
    state.check?.available ? state.check.latest.version : null
  );
  useAutoUpdateCheck();
  return (
    <ListItem
      icon={<IconCircleHelp />}
      label="关于与更新"
      value={latestVersion ? undefined : (appVersion ?? "")}
      badge={latestVersion ? <UpdateBadge version={latestVersion} /> : undefined}
      onClick={props.onOpen}
    />
  );
}

/** 「关于与更新」行尾的新版本提示：红点 + 版本号 */
function UpdateBadge({ version }: { version: string }) {
  return (
    <span
      className="bg-danger-soft text-danger flex items-center gap-1.5 rounded-full py-0.5 pr-2 pl-1.5 text-[11.5px] font-semibold tabular-nums"
      aria-label={`有新版本 ${version}`}
    >
      <span className="bg-danger h-1.5 w-1.5 rounded-full" aria-hidden="true" />
      新版本 {version}
    </span>
  );
}

function ListItem({
  icon,
  label,
  value,
  badge,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  value?: string;
  badge?: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="list-item w-full gap-3 text-left"
      disabled={!onClick}
    >
      {icon}
      <span className="text-ink-1 flex-1 text-[14px] font-medium">{label}</span>
      <span className="flex max-w-[55%] items-center gap-1.5">
        {badge}
        {value && <span className="text-ink-3 truncate text-[12.5px]">{value}</span>}
        {onClick && <span className="text-ink-3">›</span>}
      </span>
    </button>
  );
}
