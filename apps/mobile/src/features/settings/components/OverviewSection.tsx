// 我的页根视图（v2 模板）：行内直显关键值，数据域入口收敛为两个独立页面——
// 数据库同步（同步中心：状态 + 服务 + 数据库切换）/ 资源与存储（资源同步 + 存储目标）。
// 外观（主题 overlay 路由页）/ 编辑器（打开文档时）/ 关于（版本）。

import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
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
  IconBookOpen,
  IconCircleHelp,
  IconCloud,
  IconFolder,
  IconImage,
  IconMoon,
  IconUsers,
} from "./ui";
import { ActionSheet } from "./ActionSheet";
import { LOCAL_UPLOAD_ID, findUploadProvider } from "../upload/providers";
import { getTheme } from "@tau/themes";
import { useThemeStore } from "@tau/themes/react";
import { useNavigator } from "../../../router";
import * as tauri from "../../../services/tauri";
import { useAppContext } from "../../../app/AppContext";
import {
  normalizeEditorOpenMode,
  withEditorOpenMode,
  type EditorOpenMode,
} from "../../../hooks/useEditorOpenMode";
import type { SettingModule } from "./types";

const APPEARANCE_LABELS = { light: "浅色", dark: "深色", system: "跟随系统" } as const;

const EDITOR_OPEN_MODE_LABELS: Record<EditorOpenMode, string> = { read: "阅读", edit: "编辑" };

const EDITOR_OPEN_MODE_OPTIONS: Array<{ label: string; value: EditorOpenMode }> = [
  { label: "阅读模式（默认）", value: "read" },
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
  const [appVersion, setAppVersion] = useState("");

  // 数据库文件大小（主库 + WAL/SHM）
  const dbSizeQuery = useQuery({
    queryKey: ["settings", "db-size"],
    queryFn: () => tauri.getActiveDatabaseSize(),
    staleTime: 30_000,
  });

  useEffect(() => {
    getVersion()
      .then(version => setAppVersion(version))
      .catch(() => setAppVersion(""));
  }, []);

  const uploadTargetName =
    props.activeResource === LOCAL_UPLOAD_ID
      ? "这台手机"
      : (findUploadProvider(props.activeResource)?.name ?? props.activeResource);
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
        <ListItem
          icon={<IconCircleHelp />}
          label="版本"
          value={appVersion || "0.1.0"}
          onClick={() => props.onOpenModule("about")}
        />
      </div>
    </div>
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
        value={value}
        options={EDITOR_OPEN_MODE_OPTIONS}
        onClose={() => setOpen(false)}
        onSelect={next =>
          app.syncSettings.updateSetting(
            prev => withEditorOpenMode(prev, normalizeEditorOpenMode(next)),
            { persist: true }
          )
        }
      />
    </>
  );
}

function ListItem({
  icon,
  label,
  value,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  value?: string;
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
        {value && <span className="text-ink-3 truncate text-[12.5px]">{value}</span>}
        {onClick && <span className="text-ink-3">›</span>}
      </span>
    </button>
  );
}
