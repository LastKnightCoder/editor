// 数据库同步服务注册表：宿主（同步中心 / 服务抽屉 / 服务页外壳）只消费这里的条目。
// 形态对齐桌面端同步插件——服务提供名称与一个设置面板，宿主负责状态、切换、测试与同步动作；
// 内置服务与将来的插件服务挂在同一个面板插槽上。

import { useState, type ComponentType } from "react";
import type { SettingCompat } from "../../../types";
import { ActionSheet } from "../components/ActionSheet";
import type { SettingModuleKey, SettingsPageProps } from "../components/types";
import { useGithubRepoSelector } from "../components/useGithubRepoSelector";
import { GroupLabel } from "../../../components/GroupLabel";
import { AccountCard, FieldGroup, PickerField, TextField } from "./SyncFields";

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

function LocationLabel() {
  return <GroupLabel>存储位置</GroupLabel>;
}

function S3Panel({ setting, updateSetting, onOpenModule }: SyncProviderPanelProps) {
  const account = setting.integration.s3;
  const params = setting.sync.s3;
  const commit = () => persist(updateSetting);
  return (
    <>
      <GroupLabel>账号</GroupLabel>
      <AccountCard
        letter="S"
        tileClassName="bg-tag-2-soft text-tag-2"
        connected={Boolean(account.accessKeyId && account.secretAccessKey)}
        title={maskKey(account.accessKeyId)}
        description={account.endpoint || "与资源存储共用此账号"}
        onManage={() => onOpenModule("integration-s3")}
      />
      <LocationLabel />
      <FieldGroup>
        <TextField
          label="Bucket"
          value={params.bucket}
          placeholder="必填"
          onChange={bucket => patchSync(updateSetting, "s3", { bucket })}
          onCommit={commit}
        />
        <TextField
          label="Region"
          value={params.region}
          placeholder="例如 ap-southeast-1"
          onChange={region => patchSync(updateSetting, "s3", { region })}
          onCommit={commit}
        />
        <TextField
          label="路径前缀"
          value={params.pathPrefix}
          placeholder="sync（可选）"
          hint="数据库文件存放在 Bucket 下的这个目录"
          onChange={pathPrefix => patchSync(updateSetting, "s3", { pathPrefix })}
          onCommit={commit}
        />
      </FieldGroup>
    </>
  );
}

function AliOssPanel({ setting, updateSetting, onOpenModule }: SyncProviderPanelProps) {
  const account = setting.integration.aliOSS;
  const params = setting.sync.aliOSS;
  const commit = () => persist(updateSetting);
  return (
    <>
      <GroupLabel>账号</GroupLabel>
      <AccountCard
        letter="A"
        tileClassName="bg-accent-soft text-accent-text"
        connected={Boolean(account.accessKeyId && account.accessKeySecret)}
        title={maskKey(account.accessKeyId)}
        description="与资源存储共用此账号"
        onManage={() => onOpenModule("integration-alioss")}
      />
      <LocationLabel />
      <FieldGroup>
        <TextField
          label="Bucket"
          value={params.bucket}
          placeholder="必填"
          onChange={bucket => patchSync(updateSetting, "aliOSS", { bucket })}
          onCommit={commit}
        />
        <TextField
          label="Region"
          value={params.region}
          placeholder="例如 oss-cn-hangzhou"
          onChange={region => patchSync(updateSetting, "aliOSS", { region })}
          onCommit={commit}
        />
        <TextField
          label="路径前缀"
          value={params.path}
          placeholder="/sync（可选）"
          hint="数据库文件存放在 Bucket 下的这个目录"
          onChange={path => patchSync(updateSetting, "aliOSS", { path })}
          onCommit={commit}
        />
      </FieldGroup>
    </>
  );
}

function WebDavPanel({ setting, updateSetting, onOpenModule }: SyncProviderPanelProps) {
  const account = setting.integration.webdav;
  return (
    <>
      <GroupLabel>账号</GroupLabel>
      <AccountCard
        letter="W"
        tileClassName="bg-tag-1-soft text-tag-1"
        connected={Boolean(account.url && account.username && account.password)}
        title={account.username}
        description={account.url || "与资源存储共用此账号"}
        onManage={() => onOpenModule("integration-webdav")}
      />
      <LocationLabel />
      <FieldGroup>
        <TextField
          label="路径前缀"
          value={setting.sync.webdav.pathPrefix}
          placeholder="/sync（可选）"
          hint="数据库文件存放在服务器上的这个目录"
          onChange={pathPrefix => patchSync(updateSetting, "webdav", { pathPrefix })}
          onCommit={() => persist(updateSetting)}
        />
      </FieldGroup>
    </>
  );
}

function GithubPanel({ setting, updateSetting, onOpenModule }: SyncProviderPanelProps) {
  const [sheet, setSheet] = useState<"repo" | "branch" | null>(null);
  const token = setting.integration.github.token;
  const owner = setting.integration.github.user.name;
  const { repo, branch, pathPrefix } = setting.sync.github;
  const selector = useGithubRepoSelector({ token, owner, repo, branch });
  const toOptions = (items: string[], current: string) =>
    Array.from(new Set([current, ...items].filter(Boolean))).map(value => ({
      label: value,
      value,
    }));

  const selectRepo = (nextRepo: string) => {
    patchSync(updateSetting, "github", { repo: nextRepo, branch: "" });
    persist(updateSetting);
    void selector.loadBranches(nextRepo);
  };

  const selectBranch = (nextBranch: string) => {
    patchSync(updateSetting, "github", { branch: nextBranch });
    persist(updateSetting);
  };

  return (
    <>
      <GroupLabel>账号</GroupLabel>
      <AccountCard
        letter="G"
        tileClassName="bg-tag-3-soft text-tag-3"
        connected={selector.canLoad}
        title={owner}
        description={selector.canLoad ? "已连接" : "连接后才能选择仓库与分支"}
        onManage={() => onOpenModule("integration-github")}
      />
      <LocationLabel />
      <FieldGroup>
        <PickerField
          label="仓库"
          value={repo}
          placeholder="请选择仓库"
          disabled={!selector.canLoad}
          loading={selector.loadingRepos}
          onOpen={() => setSheet("repo")}
        />
        <PickerField
          label="分支"
          value={branch}
          placeholder={repo ? "请选择分支" : "请先选择仓库"}
          disabled={!selector.canLoad || !repo}
          loading={selector.loadingBranches}
          error={Boolean(repo && !branch)}
          hint={repo && !branch ? "选择仓库后还需要选择分支" : undefined}
          onOpen={() => setSheet("branch")}
        />
        <TextField
          label="路径前缀"
          value={pathPrefix}
          placeholder="sync（可选）"
          onChange={value => patchSync(updateSetting, "github", { pathPrefix: value })}
          onCommit={() => persist(updateSetting)}
        />
      </FieldGroup>
      {selector.error && (
        <p className="text-danger px-[15px] pt-1.5 text-[11.5px]">{selector.error}</p>
      )}
      <ActionSheet
        open={sheet === "repo"}
        title="选择仓库"
        value={repo}
        options={toOptions(selector.repos, repo)}
        loading={selector.loadingRepos}
        emptyText="暂无仓库"
        onClose={() => setSheet(null)}
        onSelect={selectRepo}
      />
      <ActionSheet
        open={sheet === "branch"}
        title={repo ? `选择分支（${repo}）` : "选择分支"}
        value={branch}
        options={toOptions(selector.branches, branch)}
        loading={selector.loadingBranches}
        emptyText="暂无分支"
        onClose={() => setSheet(null)}
        onSelect={selectBranch}
      />
    </>
  );
}

function maskKey(key: string): string {
  if (key.length <= 8) return key;
  return `${key.slice(0, 4)}••••${key.slice(-4)}`;
}

export const SYNC_PROVIDERS: readonly SyncProviderEntry[] = [
  {
    id: "s3",
    name: "S3 兼容存储",
    description: "AWS、Cloudflare R2、MinIO…",
    tile: { letter: "S", className: "bg-tag-2-soft text-tag-2" },
    isConfigured: s =>
      Boolean(
        s.integration.s3.accessKeyId &&
        s.integration.s3.secretAccessKey &&
        s.sync.s3.bucket &&
        s.sync.s3.region
      ),
    summary: s => [s.sync.s3.bucket, s.sync.s3.region].filter(Boolean).join(" · "),
    Panel: S3Panel,
  },
  {
    id: "aliOSS",
    name: "阿里云 OSS",
    description: "国内访问快",
    tile: { letter: "A", className: "bg-accent-soft text-accent-text" },
    isConfigured: s =>
      Boolean(
        s.integration.aliOSS.accessKeyId &&
        s.integration.aliOSS.accessKeySecret &&
        s.sync.aliOSS.bucket &&
        s.sync.aliOSS.region
      ),
    summary: s => [s.sync.aliOSS.bucket, s.sync.aliOSS.region].filter(Boolean).join(" · "),
    Panel: AliOssPanel,
  },
  {
    id: "github",
    name: "GitHub 仓库",
    description: "免费，适合小库",
    tile: { letter: "G", className: "bg-tag-3-soft text-tag-3" },
    isConfigured: s =>
      Boolean(
        s.integration.github.token &&
        s.integration.github.user.name &&
        s.sync.github.repo &&
        s.sync.github.branch
      ),
    summary: s =>
      s.sync.github.repo
        ? `${s.integration.github.user.name}/${s.sync.github.repo}${s.sync.github.branch ? ` · ${s.sync.github.branch}` : ""}`
        : "",
    Panel: GithubPanel,
  },
  {
    id: "webdav",
    name: "WebDAV",
    description: "坚果云、Nextcloud、群晖…",
    tile: { letter: "W", className: "bg-tag-1-soft text-tag-1" },
    isConfigured: s =>
      Boolean(
        s.integration.webdav.url && s.integration.webdav.username && s.integration.webdav.password
      ),
    summary: s => hostOf(s.integration.webdav.url),
    Panel: WebDavPanel,
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
