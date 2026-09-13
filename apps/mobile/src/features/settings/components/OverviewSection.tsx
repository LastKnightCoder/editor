// 我的页根视图（v2 模板）：行内直显关键值，数据域入口收敛为两个独立页面——
// 数据库与同步（库切换 + 库同步 + 同步服务）/ 资源与存储（资源同步 + 存储目标）。
// 外观（主题 overlay 路由页）/ 关于（版本）。

import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { useQuery } from "@tanstack/react-query";
import type { ImageBorderRadiusPreset, ImageShadowPreset } from "@tau/editor/src";
import {
  IMAGE_BORDER_RADIUS_OPTIONS,
  IMAGE_SHADOW_OPTIONS,
  normalizeImageShadowPreset,
} from "@tau/editor/src/extensions/image/utils/appearance";
import { IconCircleHelp, IconCloud, IconDatabase, IconImage, IconMoon, LetterTile } from "./ui";
import { getResourceSyncSummary } from "./SyncStatusSections";
import { useThemeStore } from "../../../theme/themeStore";
import { useNavigator } from "../../../router";
import * as tauri from "../../../services/tauri";
import type { SettingModule, SettingsPageProps } from "./types";

const THEME_LABELS: Record<string, string> = {
  apricot: "杏子",
  midnight: "玄夜",
  mint: "薄荷",
  ocean: "海盐",
  system: "跟随系统",
};

const RESOURCE_LABELS: Record<string, string> = {
  local: "本地",
  github: "Github",
  aliOSS: "AliOSS",
  s3: "S3",
  webdav: "WebDAV",
};

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
  /** 协作服务器地址（已配置时以域名展示），未配置则显示默认服务器 */
  collaborationServerUrl?: string;
  imageAppearance?: {
    borderRadius?: ImageBorderRadiusPreset;
    shadow?: ImageShadowPreset | boolean;
  };
  onOpenModule: (module: Exclude<SettingModule, null>) => void;
  resourceSyncProgress: SettingsPageProps["resourceSyncProgress"];
};

function findPresetLabel(
  options: Array<{ value: string; label: string }>,
  value: string | undefined
): string {
  return options.find(option => option.value === value)?.label ?? options[0].label;
}

export function OverviewSection(props: OverviewSectionProps) {
  const themeMode = useThemeStore(state => state.mode);
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

  const resourceSummary = props.resourceSyncProgress
    ? getResourceSyncSummary(props.resourceSyncProgress)
    : "未开始";
  const resourceValue = `${
    RESOURCE_LABELS[props.activeResource] ?? props.activeResource
  } · ${resourceSummary}`;
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
        <h2 className="text-ink text-[16.5px] font-extrabold">数据</h2>
      </div>
      <div className="list-group">
        <ListItem
          icon={<IconDatabase />}
          label="数据库与同步"
          value={
            dbSizeQuery.data != null
              ? `${props.activeDatabase ?? "本地"} · ${formatBytes(dbSizeQuery.data)}`
              : props.activeDatabase
          }
          onClick={() => props.onOpenModule("database")}
        />
        <ListItem
          icon={<IconCloud />}
          label="资源与存储"
          value={resourceValue}
          onClick={() => props.onOpenModule("resource")}
        />
      </div>

      <div className="space-y-3 px-1">
        <h2 className="text-ink text-[16.5px] font-extrabold">协作</h2>
      </div>
      <div className="list-group">
        <ListItem
          icon={<LetterTile letter="协" className="bg-accent-soft text-accent" />}
          label="实时协作"
          value={
            props.collaborationServerUrl
              ? props.collaborationServerUrl.replace(/^https?:\/\//, "")
              : "未配置"
          }
          onClick={() => props.onOpenModule("collaboration")}
        />
      </div>

      <div className="space-y-3 px-1">
        <h2 className="text-ink text-[16.5px] font-extrabold">外观</h2>
      </div>
      <div className="list-group">
        <ListItem
          icon={<IconMoon />}
          label="主题"
          value={THEME_LABELS[themeMode]}
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
        <h2 className="text-ink text-[16.5px] font-extrabold">关于</h2>
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
      <span className="text-ink flex-1 text-[14px] font-medium">{label}</span>
      <span className="flex max-w-[55%] items-center gap-1.5">
        {value && <span className="text-ink-3 truncate text-[12.5px]">{value}</span>}
        {onClick && <span className="text-ink-3">›</span>}
      </span>
    </button>
  );
}
