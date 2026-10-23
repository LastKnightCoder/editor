// 数据库同步服务注册表：宿主（同步中心 / 服务抽屉 / 服务页外壳）只消费这里的条目。
// 形态对齐桌面端同步插件——服务提供名称与一个设置面板，宿主负责状态、切换、测试与同步动作；
// 内置服务与将来的插件服务挂在同一个面板插槽上。

import type { ComponentType } from "react";
import type { SettingCompat } from "../../../types";
import type { SettingModuleKey, SettingsPageProps } from "../components/types";
import { accountReady } from "../storage/accounts";
import { AliOssPanel, GithubPanel, S3Panel, WebDavPanel } from "../storage/panels";

type UpdateSetting = SettingsPageProps["updateSetting"];
type SyncSettings = SettingCompat["sync"];

export type SyncProviderPanelProps = {
  setting: SettingCompat;
  updateSetting: UpdateSetting;
  onOpenModule: (module: SettingModuleKey) => void;
};

export type SyncProviderEntry = {
  /** 与 setting.json 的 sync.active 取值一致 */
  id: string;
  name: string;
  description: string;
  tile: { letter: string; className: string };
  isConfigured: (setting: SettingCompat) => boolean;
  /** 「同步到」行与服务抽屉的副文案，未配置时返回空串 */
  summary: (setting: SettingCompat) => string;
  Panel: ComponentType<SyncProviderPanelProps>;
};

/** 改写 sync 下某个服务的参数（只改内存，失焦时再持久化） */
function patchSync<K extends keyof SyncSettings>(
  updateSetting: UpdateSetting,
  key: K,
  patch: Partial<SyncSettings[K]>
) {
  updateSetting(prev => ({
    ...prev,
    sync: { ...prev.sync, [key]: { ...(prev.sync[key] as object), ...patch } },
  }));
}

function persist(updateSetting: UpdateSetting) {
  updateSetting(prev => prev, { persist: true });
}

function S3SyncPanel({ setting, updateSetting, onOpenModule }: SyncProviderPanelProps) {
  return (
    <S3Panel
      setting={setting}
      onOpenModule={onOpenModule}
      value={setting.sync.s3}
      onPatch={patch => patchSync(updateSetting, "s3", patch)}
      onCommit={() => persist(updateSetting)}
      pathPlaceholder="sync（可选）"
      pathHint="数据库文件存放在 Bucket 下的这个目录"
    />
  );
}

function AliOssSyncPanel({ setting, updateSetting, onOpenModule }: SyncProviderPanelProps) {
  return (
    <AliOssPanel
      setting={setting}
      onOpenModule={onOpenModule}
      value={setting.sync.aliOSS}
      onPatch={patch => patchSync(updateSetting, "aliOSS", patch)}
      onCommit={() => persist(updateSetting)}
      pathPlaceholder="/sync（可选）"
      pathHint="数据库文件存放在 Bucket 下的这个目录"
    />
  );
}

function WebDavSyncPanel({ setting, updateSetting, onOpenModule }: SyncProviderPanelProps) {
  return (
    <WebDavPanel
      setting={setting}
      onOpenModule={onOpenModule}
      value={setting.sync.webdav}
      onPatch={patch => patchSync(updateSetting, "webdav", patch)}
      onCommit={() => persist(updateSetting)}
      pathPlaceholder="/sync（可选）"
      pathHint="数据库文件存放在服务器上的这个目录"
    />
  );
}

function GithubSyncPanel({ setting, updateSetting, onOpenModule }: SyncProviderPanelProps) {
  return (
    <GithubPanel
      setting={setting}
      onOpenModule={onOpenModule}
      value={setting.sync.github}
      onPatch={patch => patchSync(updateSetting, "github", patch)}
      onCommit={() => persist(updateSetting)}
      pathPlaceholder="sync（可选）"
    />
  );
}

export const SYNC_PROVIDERS: readonly SyncProviderEntry[] = [
  {
    id: "s3",
    name: "S3 兼容存储",
    description: "AWS、Cloudflare R2、MinIO…",
    tile: { letter: "S", className: "bg-tag-2-soft text-tag-2" },
    isConfigured: s => accountReady.s3(s) && Boolean(s.sync.s3.bucket && s.sync.s3.region),
    summary: s => [s.sync.s3.bucket, s.sync.s3.region].filter(Boolean).join(" · "),
    Panel: S3SyncPanel,
  },
  {
    id: "aliOSS",
    name: "阿里云 OSS",
    description: "国内访问快",
    tile: { letter: "A", className: "bg-accent-soft text-accent-text" },
    isConfigured: s =>
      accountReady.aliOSS(s) && Boolean(s.sync.aliOSS.bucket && s.sync.aliOSS.region),
    summary: s => [s.sync.aliOSS.bucket, s.sync.aliOSS.region].filter(Boolean).join(" · "),
    Panel: AliOssSyncPanel,
  },
  {
    id: "github",
    name: "GitHub 仓库",
    description: "免费，适合小库",
    tile: { letter: "G", className: "bg-tag-3-soft text-tag-3" },
    isConfigured: s =>
      accountReady.github(s) && Boolean(s.sync.github.repo && s.sync.github.branch),
    summary: s =>
      s.sync.github.repo
        ? `${s.integration.github.user.name}/${s.sync.github.repo}${s.sync.github.branch ? ` · ${s.sync.github.branch}` : ""}`
        : "",
    Panel: GithubSyncPanel,
  },
  {
    id: "webdav",
    name: "WebDAV",
    description: "坚果云、Nextcloud、群晖…",
    tile: { letter: "W", className: "bg-tag-1-soft text-tag-1" },
    isConfigured: accountReady.webdav,
    summary: s => hostOf(s.integration.webdav.url),
    Panel: WebDavSyncPanel,
  },
];

function hostOf(url: string): string {
  try {
    return url ? new URL(url).host : "";
  } catch {
    return url;
  }
}

export function findSyncProvider(id: string): SyncProviderEntry | undefined {
  return SYNC_PROVIDERS.find(provider => provider.id === id);
}
