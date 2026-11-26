import { useSettingsShellI18n, type SettingsShellKey } from "../shell.i18n";
import { useMobileI18n } from "../../../services/i18n-react";
import { APP_LANGUAGES, normalizeLanguagePreference } from "@tau/shared/language";
// 我的页根视图（v2 模板）：行内直显关键值，数据域入口收敛为两个独立页面——
// 数据库同步（同步中心：状态 + 服务 + 数据库切换）/ 资源与存储（资源同步 + 存储目标）。
// 外观（主题 / 图片渲染 / 背景高亮 / 正文字体 overlay 路由页）/ 编辑器（打开文档时）/ 关于与更新（版本、新版本提示）。

import { useState, type ReactNode } from "react";
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
  IconBell,
  IconBookOpen,
  IconCircleHelp,
  IconCloud,
  IconFolder,
  IconHighlighter,
  IconImage,
  IconMessageSquare,
  IconMic,
  IconMoon,
  IconPlug,
  IconSparkles,
  IconWandSparkles,
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
import { normalizeHighlightStyle } from "./highlightStyle";
import { useInstalledReadingFonts } from "../readingFont/queries";
import type { SettingModule } from "./types";
import { findAssignedModel, modelLabel } from "../../../services/ai-settings";
import { useSkillCatalog, useToolSources } from "../../aiCapabilities/data";
import { useSourceEnabled } from "../../aiCapabilities/sources";
import { skillModeOf, useLibraryPreferences } from "../../../services/aiChat/capabilityPreferences";

export const APPEARANCE_LABELS = { light: "浅色", dark: "深色", system: "跟随系统" } as const;

const EDITOR_OPEN_MODES: EditorOpenMode[] = ["read", "edit"];

function formatBytes(bytes: number, locale: string): string {
  const number = (value: number, digits: number) =>
    value.toLocaleString(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits });
  if (bytes <= 0) return "0 MB";
  const mb = bytes / 1024 / 1024;
  if (mb >= 1024) return `${number(mb / 1024, 2)} GB`;
  if (mb >= 1) return `${number(mb, 1)} MB`;
  return `${number(Math.max(1, Math.round(bytes / 1024)), 0)} KB`;
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

function findPresetValue(
  options: Array<{ value: string; label: string }>,
  value: string | undefined
): string {
  return options.find(option => option.value === value)?.value ?? options[0].value;
}

export function OverviewSection(props: OverviewSectionProps) {
  const { t, locale } = useSettingsShellI18n();
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
      ? t("localPhone")
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
      ? (speechProviders.find(item => item.id === speech.plugin.id)?.name ?? t("pluginDisabled"))
      : t("notSelected");
  // 桌面端旧设置 shadow 为布尔（true 视作中阴影），展示前归一为 preset
  const radius = findPresetValue(IMAGE_BORDER_RADIUS_OPTIONS, props.imageAppearance?.borderRadius);
  const shadow = findPresetValue(
    IMAGE_SHADOW_OPTIONS,
    normalizeImageShadowPreset(props.imageAppearance?.shadow)
  );
  const imageAppearanceValue = `${t(`image.radius.${radius}` as SettingsShellKey)} · ${t(`image.shadow.${shadow}` as SettingsShellKey)}`;

  return (
    <div className="space-y-4">
      <SettingsGroup title={t("group.data")}>
        <ListItem
          icon={<IconCloud />}
          label={t("module.database")}
          value={
            dbSizeQuery.data != null
              ? `${props.activeDatabase ?? t("local")} · ${formatBytes(dbSizeQuery.data, locale)}`
              : props.activeDatabase
          }
          onClick={() => props.onOpenModule("database")}
        />
        <ListItem
          icon={<IconFolder />}
          label={t("module.resource")}
          value={uploadTargetName}
          onClick={() => props.onOpenModule("resource")}
        />
      </SettingsGroup>

      <SettingsGroup title={t("group.collaboration")}>
        <ListItem
          icon={<IconUsers />}
          label={t("module.collaboration")}
          onClick={() => props.onOpenModule("collaboration")}
        />
      </SettingsGroup>

      <SettingsGroup title={t("group.ai")}>
        <AiModelsItem onOpen={() => props.onOpenModule("ai-models")} />
        <ListItem
          icon={<IconImage />}
          label={t("module.image-generation")}
          value={
            syncSettings.safeSetting?.imageGeneration?.providers.find(
              account => account.id === syncSettings.safeSetting?.imageGeneration?.currentProviderId
            )?.name ?? t("notConfigured")
          }
          onClick={() => props.onOpenModule("image-generation")}
        />
        <SkillsItem />
        <McpItem />
      </SettingsGroup>

      <SettingsGroup title={t("group.voice")}>
        <ListItem
          icon={<IconAudioLines />}
          label={t("module.voice")}
          value={ttsAccountName ?? t("notConfigured")}
          onClick={() => props.onOpenModule("voice")}
        />
        <ListItem
          icon={<IconMic />}
          label={t("module.speech-input")}
          value={speechInputName}
          onClick={() => props.onOpenModule("speech-input")}
        />
      </SettingsGroup>

      <SettingsGroup title={t("group.reminders")}>
        <ListItem
          icon={<IconBell />}
          label={t("module.notifications")}
          onClick={() => props.onOpenModule("notifications")}
        />
      </SettingsGroup>

      <SettingsGroup title={t("group.appearance")}>
        <LanguageItem />
        <ListItem
          icon={<IconMoon />}
          label={t("theme")}
          value={`${themeName} · ${t(`appearance.${appearance}`)}`}
          onClick={() => navigator.push("settings-theme")}
        />
        <ListItem
          icon={<IconImage />}
          label={t("imageAppearance")}
          value={imageAppearanceValue}
          onClick={() => navigator.push("settings-image-appearance")}
        />
        <HighlightStyleItem />
        <ReadingFontItem />
      </SettingsGroup>

      <SettingsGroup title={t("group.editor")}>
        <EditorOpenModeItem />
      </SettingsGroup>

      <SettingsGroup title={t("group.about")}>
        <ListItem
          icon={<IconMessageSquare />}
          label={t("module.feedback")}
          onClick={() => props.onOpenModule("feedback")}
        />
        <AboutUpdateItem onOpen={() => props.onOpenModule("about")} />
      </SettingsGroup>
    </div>
  );
}

function SettingsGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-4">
      <h2 className="text-ink-1 px-1 text-[16.5px] font-extrabold">{title}</h2>
      <div className="list-group">{children}</div>
    </section>
  );
}

/** 「Skill」：行尾显示可用（未停用）的数量 */
function SkillsItem() {
  const { t, locale } = useSettingsShellI18n();
  const navigator = useNavigator();
  const { databaseName, items, query } = useSkillCatalog();
  const preferences = useLibraryPreferences(databaseName);
  const available = items.filter(item => skillModeOf(preferences, item.skill) !== "off").length;
  return (
    <ListItem
      icon={<IconWandSparkles />}
      label="Skill"
      value={query.isSuccess ? t("count", { amount: available.toLocaleString(locale) }) : undefined}
      onClick={() => navigator.push("aiSkills", {})}
    />
  );
}

/** 「MCP 服务器」：正常显示来源数，有连接失败时换成红色提示 */
function McpItem() {
  const { t, locale } = useSettingsShellI18n();
  const navigator = useNavigator();
  const { databaseName, all } = useToolSources({ passive: true });
  const { isEnabled } = useSourceEnabled(databaseName);
  const failed = all.filter(source => isEnabled(source) && source.status === "error").length;
  const enabled = all.filter(source => isEnabled(source) && source.status !== "unavailable").length;
  return (
    <ListItem
      icon={<IconPlug />}
      label={t("mcp")}
      value={
        failed
          ? t("mcp.failed", { count: failed, amount: failed.toLocaleString(locale) })
          : t("count", { amount: enabled.toLocaleString(locale) })
      }
      valueTone={failed ? "danger" : "muted"}
      onClick={() => navigator.push("aiMcp", {})}
    />
  );
}

/** 「AI 模型」：行尾显示对话所用模型，未分配时提示去设置 */
function AiModelsItem(props: { onOpen: () => void }) {
  const { t } = useSettingsShellI18n();
  const setting = useAppContext().syncSettings.safeSetting;
  const chat = findAssignedModel(setting, "chat");
  const value = chat
    ? modelLabel(chat.model)
    : setting?.llmProviders?.length
      ? t("notAssigned")
      : t("notConfigured");
  return (
    <ListItem
      icon={<IconSparkles />}
      label={t("module.ai-models")}
      value={value}
      onClick={props.onOpen}
    />
  );
}

/** 「背景高亮」：行尾显示当前笔触，未设置为平涂 */
function HighlightStyleItem() {
  const { t } = useSettingsShellI18n();
  const app = useAppContext();
  const navigator = useNavigator();
  const style = normalizeHighlightStyle(app.syncSettings.safeSetting?.appearance?.highlight?.style);
  return (
    <ListItem
      icon={<IconHighlighter />}
      label={t("highlight")}
      value={t(`highlight.${style}`)}
      onClick={() => navigator.push("settings-highlight-style")}
    />
  );
}

/** 「正文字体」：行尾显示所选字体；所选字体未下载（被清理）时提示需重新下载 */
export function ReadingFontItem() {
  const { t } = useSettingsShellI18n();
  const app = useAppContext();
  const navigator = useNavigator();
  const id = normalizeReadingFontId(app.syncSettings.safeSetting?.appearance?.readingFont);
  const installed = useInstalledReadingFonts().data;
  const missing =
    id !== "system" && installed !== undefined && !installed.some(font => font.id === id);
  return (
    <ListItem
      icon={<IconType />}
      label={t("font")}
      value={
        missing
          ? t("font.downloadAgain")
          : id === "system"
            ? t("font.system")
            : readingFontOption(id).label
      }
      onClick={() => navigator.push("settings-reading-font")}
    />
  );
}

/** 「打开文档时」：已有文档默认阅读态或直接编辑，点选即时写入 editor.openMode 并落盘 */
export function EditorOpenModeItem() {
  const { t } = useSettingsShellI18n();
  const app = useAppContext();
  const [open, setOpen] = useState(false);
  const value = normalizeEditorOpenMode(app.syncSettings.safeSetting?.editor?.openMode);
  return (
    <>
      <ListItem
        icon={<IconBookOpen />}
        label={t("openMode")}
        value={t(`openMode.${value}`)}
        onClick={() => setOpen(true)}
      />
      <ActionSheet
        open={open}
        title={t("openMode")}
        items={EDITOR_OPEN_MODES.map(mode => ({
          key: mode,
          label: t(`openMode.option.${mode}`),
          selected: mode === value,
          onClick: () =>
            app.syncSettings.updateSetting(prev => withEditorOpenMode(prev, mode), {
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
  const { t } = useSettingsShellI18n();
  const appVersion = useAppVersion();
  const latestVersion = useAppUpdate(state =>
    state.check?.available ? state.check.latest.version : null
  );
  useAutoUpdateCheck();
  return (
    <ListItem
      icon={<IconCircleHelp />}
      label={t("module.about")}
      value={latestVersion ? undefined : (appVersion ?? "")}
      badge={latestVersion ? <UpdateBadge version={latestVersion} /> : undefined}
      onClick={props.onOpen}
    />
  );
}

/** 「关于与更新」行尾的新版本提示：红点 + 版本号 */
function UpdateBadge({ version }: { version: string }) {
  const { t } = useSettingsShellI18n();
  return (
    <span
      className="bg-danger-soft text-danger flex items-center gap-1.5 rounded-full py-0.5 pr-2 pl-1.5 text-[11.5px] font-semibold tabular-nums"
      aria-label={t("update.available", { version })}
    >
      <span className="bg-danger h-1.5 w-1.5 rounded-full" aria-hidden="true" />
      {t("update.badge", { version })}
    </span>
  );
}

function ListItem({
  icon,
  label,
  value,
  valueTone = "muted",
  badge,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  value?: string;
  /** danger 用于提示异常（如 MCP 连接失败） */
  valueTone?: "muted" | "danger";
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
        {value && (
          <span
            className={`truncate text-[12.5px] ${valueTone === "danger" ? "text-danger" : "text-ink-3"}`}
          >
            {value}
          </span>
        )}
        {onClick && <span className="text-ink-3">›</span>}
      </span>
    </button>
  );
}

function LanguageItem() {
  const { syncSettings } = useAppContext();
  const { t } = useMobileI18n();
  const [open, setOpen] = useState(false);
  const value = normalizeLanguagePreference(syncSettings.safeSetting?.language);
  const options = [
    { value: "system", label: t("system") },
    ...APP_LANGUAGES.map(item => ({ value: item.locale, label: item.label })),
  ];
  return (
    <>
      <ListItem
        icon={<IconType />}
        label={t("language")}
        value={options.find(item => item.value === value)?.label}
        onClick={() => setOpen(true)}
      />
      <ActionSheet
        open={open}
        title={t("language")}
        items={options.map(option => ({
          key: option.value,
          label: option.label,
          selected: option.value === value,
          onClick: () =>
            syncSettings.updateSetting(
              previous => ({ ...previous, language: normalizeLanguagePreference(option.value) }),
              { persist: true }
            ),
        }))}
        onClose={() => setOpen(false)}
      />
      <p className="text-ink-3 px-4 text-xs">{t("description")}</p>
    </>
  );
}
