import type { SettingCompat } from "../../../types";
import type { SettingsPageProps } from "./types";
import { useGithubRepoSelector } from "./useGithubRepoSelector";
import { FieldInput, FieldSelect, SaveButton, SwitchButton } from "./ui";

type UpdateSetting = SettingsPageProps["updateSetting"];

type SyncSectionProps = {
  safeSetting: SettingCompat | null;
  activeSync: string;
  isSavingSetting: boolean;
  onSaveSetting: () => Promise<void>;
  updateSetting: UpdateSetting;
};

function switchSyncProvider(
  updateSetting: UpdateSetting,
  activeSync: string,
  target: "webdav" | "aliOSS" | "github" | "s3",
) {
  const fallback = target === "aliOSS" ? "webdav" : "aliOSS";
  updateSetting((prev) => ({
    ...prev,
    sync: {
      ...prev.sync,
      active: activeSync === target ? fallback : target,
    },
  }));
}

function IntegrationHint() {
  return (
    <p className="text-xs text-gray-400 dark:text-gray-500">
      凭证请在“集成账号”中配置，这里只填写同步业务参数。
    </p>
  );
}

export function SyncWebDavSection(props: SyncSectionProps) {
  return (
    <div className="space-y-4">
      <div className="list-group p-4">
        <div className="mb-4 flex items-center justify-between">
          <span className="text-[15px] text-gray-800 dark:text-gray-100">
            启用 WebDAV
          </span>
          <SwitchButton
            checked={props.activeSync === "webdav"}
            onChange={() =>
              switchSyncProvider(
                props.updateSetting,
                props.activeSync,
                "webdav",
              )
            }
          />
        </div>

        <div className="space-y-3">
          <FieldInput
            label="路径前缀"
            value={props.safeSetting?.sync.webdav.pathPrefix ?? ""}
            onChange={(v) =>
              props.updateSetting((prev) => ({
                ...prev,
                sync: {
                  ...prev.sync,
                  webdav: { ...prev.sync.webdav, pathPrefix: v },
                },
              }))
            }
            placeholder="/sync"
          />
          <IntegrationHint />
        </div>
        <SaveButton
          isSaving={props.isSavingSetting}
          onClick={props.onSaveSetting}
        />
      </div>
    </div>
  );
}

export function SyncAliOssSection(props: SyncSectionProps) {
  return (
    <div className="space-y-4">
      <div className="list-group p-4">
        <div className="mb-4 flex items-center justify-between">
          <span className="text-[15px] text-gray-800 dark:text-gray-100">
            启用 AliOSS
          </span>
          <SwitchButton
            checked={props.activeSync === "aliOSS"}
            onChange={() =>
              switchSyncProvider(
                props.updateSetting,
                props.activeSync,
                "aliOSS",
              )
            }
          />
        </div>

        <div className="space-y-3">
          <FieldInput
            label="Bucket"
            value={props.safeSetting?.sync.aliOSS.bucket ?? ""}
            onChange={(v) =>
              props.updateSetting((prev) => ({
                ...prev,
                sync: {
                  ...prev.sync,
                  aliOSS: { ...prev.sync.aliOSS, bucket: v },
                },
              }))
            }
            placeholder="Bucket"
          />
          <FieldInput
            label="Region"
            value={props.safeSetting?.sync.aliOSS.region ?? ""}
            onChange={(v) =>
              props.updateSetting((prev) => ({
                ...prev,
                sync: {
                  ...prev.sync,
                  aliOSS: { ...prev.sync.aliOSS, region: v },
                },
              }))
            }
            placeholder="例如 oss-cn-hangzhou"
          />
          <FieldInput
            label="路径前缀"
            value={props.safeSetting?.sync.aliOSS.path ?? ""}
            onChange={(v) =>
              props.updateSetting((prev) => ({
                ...prev,
                sync: {
                  ...prev.sync,
                  aliOSS: { ...prev.sync.aliOSS, path: v },
                },
              }))
            }
            placeholder="/sync"
          />
          <IntegrationHint />
        </div>
        <SaveButton
          isSaving={props.isSavingSetting}
          onClick={props.onSaveSetting}
        />
      </div>
    </div>
  );
}

export function SyncGithubSection(props: SyncSectionProps) {
  const token = props.safeSetting?.integration.github.token ?? "";
  const owner = props.safeSetting?.integration.github.user.name ?? "";
  const repo = props.safeSetting?.sync.github.repo ?? "";
  const branch = props.safeSetting?.sync.github.branch ?? "";
  const {
    repos,
    branches,
    error,
    canLoad,
    loadingRepos,
    loadingBranches,
    loadRepos,
    loadBranches,
  } = useGithubRepoSelector({
    token,
    owner,
    repo,
    branch,
  });

  const repoOptions = Array.from(new Set([repo, ...repos].filter(Boolean))).map(
    (item) => ({
      label: item,
      value: item,
    }),
  );
  const branchOptions = Array.from(
    new Set([branch, ...branches].filter(Boolean)),
  ).map((item) => ({
    label: item,
    value: item,
  }));

  const handleSelectRepo = async (nextRepo: string) => {
    props.updateSetting((prev) => ({
      ...prev,
      sync: {
        ...prev.sync,
        github: {
          ...prev.sync.github,
          repo: nextRepo,
          branch:
            nextRepo === prev.sync.github.repo ? prev.sync.github.branch : "",
        },
      },
    }));
    await loadBranches(nextRepo);
  };

  return (
    <div className="space-y-4">
      <div className="list-group p-4">
        <div className="mb-4 flex items-center justify-between">
          <span className="text-[15px] text-gray-800 dark:text-gray-100">
            启用 Github
          </span>
          <SwitchButton
            checked={props.activeSync === "github"}
            onChange={() =>
              switchSyncProvider(
                props.updateSetting,
                props.activeSync,
                "github",
              )
            }
          />
        </div>

        <div className="space-y-3">
          {!canLoad && (
            <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-700 dark:border-yellow-500/30 dark:bg-yellow-500/10 dark:text-yellow-300">
              请先在“集成账号 - Github”中验证并连接账号，再加载仓库列表。
            </div>
          )}
          <button
            type="button"
            onClick={() => void loadRepos()}
            disabled={loadingRepos || !canLoad}
            className="w-full rounded-lg border border-gray-200 bg-white py-3 text-sm font-medium text-gray-700 transition-transform active:scale-[0.98] disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
          >
            {loadingRepos ? "加载仓库中..." : "加载仓库列表"}
          </button>
          {!!error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
              {error}
            </div>
          )}
          <FieldSelect
            label="仓库"
            value={repo}
            onChange={(v) => void handleSelectRepo(v)}
            options={repoOptions}
            placeholder="请选择仓库"
            disabled={!canLoad}
          />
          <FieldSelect
            label="分支"
            value={branch}
            onChange={(v) =>
              props.updateSetting((prev) => ({
                ...prev,
                sync: {
                  ...prev.sync,
                  github: { ...prev.sync.github, branch: v },
                },
              }))
            }
            options={branchOptions}
            placeholder={
              loadingBranches
                ? "加载分支中..."
                : repo
                  ? "请选择分支"
                  : "请先选择仓库"
            }
            disabled={!canLoad || !repo || loadingBranches}
          />
          <FieldInput
            label="路径前缀"
            value={props.safeSetting?.sync.github.pathPrefix ?? ""}
            onChange={(v) =>
              props.updateSetting((prev) => ({
                ...prev,
                sync: {
                  ...prev.sync,
                  github: { ...prev.sync.github, pathPrefix: v },
                },
              }))
            }
            placeholder="sync"
          />
          <IntegrationHint />
        </div>
        <SaveButton
          isSaving={props.isSavingSetting}
          onClick={props.onSaveSetting}
        />
      </div>
    </div>
  );
}

export function SyncS3Section(props: SyncSectionProps) {
  return (
    <div className="space-y-4">
      <div className="list-group p-4">
        <div className="mb-4 flex items-center justify-between">
          <span className="text-[15px] text-gray-800 dark:text-gray-100">
            启用 S3
          </span>
          <SwitchButton
            checked={props.activeSync === "s3"}
            onChange={() =>
              switchSyncProvider(props.updateSetting, props.activeSync, "s3")
            }
          />
        </div>

        <div className="space-y-3">
          <FieldInput
            label="Bucket"
            value={props.safeSetting?.sync.s3.bucket ?? ""}
            onChange={(v) =>
              props.updateSetting((prev) => ({
                ...prev,
                sync: {
                  ...prev.sync,
                  s3: { ...prev.sync.s3, bucket: v },
                },
              }))
            }
            placeholder="bucket"
          />
          <FieldInput
            label="Region"
            value={props.safeSetting?.sync.s3.region ?? ""}
            onChange={(v) =>
              props.updateSetting((prev) => ({
                ...prev,
                sync: {
                  ...prev.sync,
                  s3: { ...prev.sync.s3, region: v },
                },
              }))
            }
            placeholder="ap-southeast-1"
          />
          <FieldInput
            label="路径前缀"
            value={props.safeSetting?.sync.s3.pathPrefix ?? ""}
            onChange={(v) =>
              props.updateSetting((prev) => ({
                ...prev,
                sync: {
                  ...prev.sync,
                  s3: { ...prev.sync.s3, pathPrefix: v },
                },
              }))
            }
            placeholder="sync"
          />
          <IntegrationHint />
        </div>
        <SaveButton
          isSaving={props.isSavingSetting}
          onClick={props.onSaveSetting}
        />
      </div>
    </div>
  );
}
