// 上传服务注册表：宿主（图片与附件页 / 选择抽屉 / 服务页外壳 / 编辑器上传管线）只消费这里的条目。
// 形态对齐桌面端上传插件——服务提供名称、设置面板与示例地址，宿主负责选择、测试、压缩与失败处理；
// 「这台手机」是宿主内置的离线选项，不是一个服务，不进注册表。

import type { ComponentType } from "react";
import type { SettingCompat } from "../../../types";
import type { SettingModuleKey, SettingsPageProps } from "../components/types";
import { accountReady } from "../storage/accounts";
import { AliOssPanel, GithubPanel, S3Panel, WebDavPanel } from "../storage/panels";

type UpdateSetting = SettingsPageProps["updateSetting"];
type ImageBedSettings = SettingCompat["imageBed"];

export const LOCAL_UPLOAD_ID = "local";

export type UploadProviderPanelProps = {
  setting: SettingCompat;
  updateSetting: UpdateSetting;
  onOpenModule: (module: SettingModuleKey) => void;
};

export type UploadProviderEntry = {
  /** 与 setting.json 的 imageBed.active 取值一致 */
  id: string;
  name: string;
  description: string;
  tile: { letter: string; className: string };
  isConfigured: (setting: SettingCompat) => boolean;
  /** 目的地卡与抽屉的副文案，未配置时返回空串 */
  summary: (setting: SettingCompat) => string;
  /** 按当前配置拼出的图片地址示例，未配置时返回空串 */
  sampleUrl: (setting: SettingCompat) => string;
  Panel: ComponentType<UploadProviderPanelProps>;
};

/** 示例文件名：与后端「原名_uuid.扩展名」的命名一致，uuid 用省略号示意 */
const SAMPLE_OBJECT = "photo_3f9a….webp";

function joinKey(prefix: string): string {
  const trimmed = prefix.trim().replace(/^\/+|\/+$/g, "");
  return trimmed ? `${trimmed}/${SAMPLE_OBJECT}` : SAMPLE_OBJECT;
}

function patchImageBed<K extends keyof ImageBedSettings>(
  updateSetting: UpdateSetting,
  key: K,
  patch: Partial<ImageBedSettings[K]>
) {
  updateSetting(prev => ({
    ...prev,
    imageBed: { ...prev.imageBed, [key]: { ...(prev.imageBed[key] as object), ...patch } },
  }));
}

function persist(updateSetting: UpdateSetting) {
  updateSetting(prev => prev, { persist: true });
}

const PATH_PLACEHOLDER = "uploads（可选）";

function GithubUploadPanel({ setting, updateSetting, onOpenModule }: UploadProviderPanelProps) {
  return (
    <GithubPanel
      setting={setting}
      onOpenModule={onOpenModule}
      value={setting.imageBed.github}
      onPatch={patch => patchImageBed(updateSetting, "github", patch)}
      onCommit={() => persist(updateSetting)}
      pathPlaceholder={PATH_PLACEHOLDER}
      pathHint="图片存放在仓库的这个目录"
    />
  );
}

function AliOssUploadPanel({ setting, updateSetting, onOpenModule }: UploadProviderPanelProps) {
  const params = setting.imageBed.aliOSS;
  return (
    <AliOssPanel
      setting={setting}
      onOpenModule={onOpenModule}
      value={{ bucket: params.bucket, region: params.region, path: params.pathPrefix }}
      onPatch={({ path, ...rest }) =>
        patchImageBed(
          updateSetting,
          "aliOSS",
          path === undefined ? rest : { ...rest, pathPrefix: path }
        )
      }
      onCommit={() => persist(updateSetting)}
      pathPlaceholder={PATH_PLACEHOLDER}
      pathHint="Bucket 需允许公共读，文档里才能显示图片"
    />
  );
}

function S3UploadPanel({ setting, updateSetting, onOpenModule }: UploadProviderPanelProps) {
  return (
    <S3Panel
      setting={setting}
      onOpenModule={onOpenModule}
      value={setting.imageBed.s3}
      onPatch={patch => patchImageBed(updateSetting, "s3", patch)}
      onCommit={() => persist(updateSetting)}
      pathPlaceholder={PATH_PLACEHOLDER}
      pathHint="Bucket 需允许公共读，文档里才能显示图片"
    />
  );
}

function WebDavUploadPanel({ setting, updateSetting, onOpenModule }: UploadProviderPanelProps) {
  return (
    <WebDavPanel
      setting={setting}
      onOpenModule={onOpenModule}
      value={setting.imageBed.webdav}
      onPatch={patch => patchImageBed(updateSetting, "webdav", patch)}
      onCommit={() => persist(updateSetting)}
      pathPlaceholder="/uploads（可选）"
      pathHint="图片存放在服务器上的这个目录"
    />
  );
}

function s3SampleUrl(setting: SettingCompat): string {
  const { endpoint, urlStyle } = setting.integration.s3;
  const { bucket, region, pathPrefix } = setting.imageBed.s3;
  const key = joinKey(pathPrefix);
  const trimmedEndpoint = endpoint.trim().replace(/\/+$/, "");
  if (urlStyle === "virtualHosted") {
    if (!trimmedEndpoint) return `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
    const match = trimmedEndpoint.match(/^(https?):\/\/(.+)$/);
    return match
      ? `${match[1]}://${bucket}.${match[2]}/${key}`
      : `https://${bucket}.${trimmedEndpoint}/${key}`;
  }
  const base = trimmedEndpoint || `https://s3.${region}.amazonaws.com`;
  return `${base}/${bucket}/${key}`;
}

export const UPLOAD_PROVIDERS: readonly UploadProviderEntry[] = [
  {
    id: "github",
    name: "GitHub 仓库",
    description: "公开仓库，免费",
    tile: { letter: "G", className: "bg-tag-3-soft text-tag-3" },
    isConfigured: s =>
      accountReady.github(s) && Boolean(s.imageBed.github.repo && s.imageBed.github.branch),
    summary: s =>
      s.imageBed.github.repo
        ? `${s.integration.github.user.name}/${s.imageBed.github.repo}${s.imageBed.github.branch ? ` · ${s.imageBed.github.branch}` : ""}`
        : "",
    sampleUrl: s => {
      const { repo, branch, pathPrefix } = s.imageBed.github;
      const owner = s.integration.github.user.name;
      if (!owner || !repo || !branch) return "";
      return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${joinKey(pathPrefix)}`;
    },
    Panel: GithubUploadPanel,
  },
  {
    id: "s3",
    name: "S3 兼容存储",
    description: "AWS、Cloudflare R2、MinIO…",
    tile: { letter: "S", className: "bg-tag-2-soft text-tag-2" },
    isConfigured: s => accountReady.s3(s) && Boolean(s.imageBed.s3.bucket && s.imageBed.s3.region),
    summary: s => [s.imageBed.s3.bucket, s.imageBed.s3.region].filter(Boolean).join(" · "),
    sampleUrl: s => (s.imageBed.s3.bucket && s.imageBed.s3.region ? s3SampleUrl(s) : ""),
    Panel: S3UploadPanel,
  },
  {
    id: "aliOSS",
    name: "阿里云 OSS",
    description: "国内访问快",
    tile: { letter: "A", className: "bg-accent-soft text-accent-text" },
    isConfigured: s =>
      accountReady.aliOSS(s) && Boolean(s.imageBed.aliOSS.bucket && s.imageBed.aliOSS.region),
    summary: s => [s.imageBed.aliOSS.bucket, s.imageBed.aliOSS.region].filter(Boolean).join(" · "),
    sampleUrl: s => {
      const { bucket, region, pathPrefix } = s.imageBed.aliOSS;
      if (!bucket || !region) return "";
      return `https://${bucket}.${region}.aliyuncs.com/${joinKey(pathPrefix)}`;
    },
    Panel: AliOssUploadPanel,
  },
  {
    id: "webdav",
    name: "WebDAV",
    description: "坚果云、Nextcloud、群晖…",
    tile: { letter: "W", className: "bg-tag-1-soft text-tag-1" },
    isConfigured: accountReady.webdav,
    summary: s => hostOf(s.integration.webdav.url),
    sampleUrl: s => {
      const base = s.integration.webdav.url.trim().replace(/\/+$/, "");
      return base ? `${base}/${joinKey(s.imageBed.webdav.pathPrefix)}` : "";
    },
    Panel: WebDavUploadPanel,
  },
];

function hostOf(url: string): string {
  try {
    return url ? new URL(url).host : "";
  } catch {
    return url;
  }
}

export function findUploadProvider(id: string): UploadProviderEntry | undefined {
  return UPLOAD_PROVIDERS.find(provider => provider.id === id);
}
