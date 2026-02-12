import type { SettingCompat } from "../../../types";
import type { SettingModule, SettingsPageProps } from "./types";
import { useGithubRepoSelector } from "./useGithubRepoSelector";
import {
  FieldInput,
  FieldSelect,
  IconCloud,
  IconFolder,
  ListItem,
  SaveButton,
  SwitchButton,
} from "./ui";

type UpdateSetting = SettingsPageProps["updateSetting"];

type ResourceCommonProps = {
  safeSetting: SettingCompat | null;
  activeResource: string;
  isSavingSetting: boolean;
  onSaveSetting: () => Promise<void>;
  updateSetting: UpdateSetting;
};

export function ResourceHomeSection(
  props: ResourceCommonProps & {
    compressionEnabled: boolean;
    onOpenModule: (module: Exclude<SettingModule, null>) => void;
  },
) {
  return (
    <div className="space-y-4">
      <div className="list-group p-4">
        <div className="mb-4 flex items-center justify-between">
          <span className="text-[15px] text-gray-800 dark:text-gray-100">
            上传前压缩图片
          </span>
          <SwitchButton
            checked={props.compressionEnabled}
            onChange={() =>
              props.updateSetting(
                (prev) => ({
                  ...prev,
                  imageBed: {
                    ...prev.imageBed,
                    enableCompression: !prev.imageBed.enableCompression,
                  },
                }),
                { persist: true },
              )
            }
          />
        </div>
        <p className="text-xs text-gray-400 dark:text-gray-500">
          开启后会在上传前将 png/jpg/jpeg 压缩为 webp。
        </p>
        <SaveButton
          isSaving={props.isSavingSetting}
          onClick={props.onSaveSetting}
        />
      </div>

      <div className="list-group">
        <ListItem
          icon={<IconFolder />}
          label="本地"
          value={props.activeResource === "local" ? "已启用" : ""}
          onClick={() => props.onOpenModule("resource-local")}
        />
        <ListItem
          icon={<IconCloud />}
          label="Github"
          value={props.activeResource === "github" ? "已启用" : ""}
          onClick={() => props.onOpenModule("resource-github")}
        />
        <ListItem
          icon={<IconCloud />}
          label="AliOSS"
          value={props.activeResource === "aliOSS" ? "已启用" : ""}
          onClick={() => props.onOpenModule("resource-alioss")}
        />
        <ListItem
          icon={<IconCloud />}
          label="S3"
          value={props.activeResource === "s3" ? "已启用" : ""}
          onClick={() => props.onOpenModule("resource-s3")}
        />
        <ListItem
          icon={<IconCloud />}
          label="WebDAV"
          value={props.activeResource === "webdav" ? "已启用" : ""}
          onClick={() => props.onOpenModule("resource-webdav")}
        />
      </div>
    </div>
  );
}

export function ResourceLocalSection(props: ResourceCommonProps) {
  return (
    <div className="space-y-4">
      <div className="list-group p-4">
        <div className="mb-4 flex items-center justify-between">
          <span className="text-[15px] text-gray-800 dark:text-gray-100">
            启用本地资源
          </span>
          <SwitchButton
            checked={props.activeResource === "local"}
            onChange={() =>
              props.updateSetting(
                (prev) => ({
                  ...prev,
                  imageBed: {
                    ...prev.imageBed,
                    active:
                      props.activeResource === "local" ? "github" : "local",
                  },
                }),
                { persist: true },
              )
            }
          />
        </div>

        <div className="space-y-3">
          <FieldInput
            label="相对目录"
            value={props.safeSetting?.imageBed.local.path ?? "resources"}
            onChange={(v) =>
              props.updateSetting((prev) => ({
                ...prev,
                imageBed: {
                  ...prev.imageBed,
                  local: { ...prev.imageBed.local, path: v },
                },
              }))
            }
            placeholder="resources"
          />
          <p className="text-xs text-gray-400 dark:text-gray-500">
            逻辑路径 `~/.editor/resources`，移动端实际目录为
            `appData/.editor/resources`。
          </p>
        </div>
        <SaveButton
          isSaving={props.isSavingSetting}
          onClick={props.onSaveSetting}
        />
      </div>
    </div>
  );
}

function IntegrationHint() {
  return (
    <p className="text-xs text-gray-400 dark:text-gray-500">
      凭证请在“集成账号”中配置，这里只填写业务参数。
    </p>
  );
}

export function ResourceGithubSection(props: ResourceCommonProps) {
  const token = props.safeSetting?.integration.github.token ?? "";
  const owner = props.safeSetting?.integration.github.user.name ?? "";
  const repo = props.safeSetting?.imageBed.github.repo ?? "";
  const branch = props.safeSetting?.imageBed.github.branch ?? "";
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
      imageBed: {
        ...prev.imageBed,
        github: {
          ...prev.imageBed.github,
          repo: nextRepo,
          branch:
            nextRepo === prev.imageBed.github.repo
              ? prev.imageBed.github.branch
              : "",
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
            启用 Github 资源
          </span>
          <SwitchButton
            checked={props.activeResource === "github"}
            onChange={() =>
              props.updateSetting(
                (prev) => ({
                  ...prev,
                  imageBed: { ...prev.imageBed, active: "github" },
                }),
                { persist: true },
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
                imageBed: {
                  ...prev.imageBed,
                  github: { ...prev.imageBed.github, branch: v },
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
            value={props.safeSetting?.imageBed.github.pathPrefix ?? ""}
            onChange={(v) =>
              props.updateSetting((prev) => ({
                ...prev,
                imageBed: {
                  ...prev.imageBed,
                  github: { ...prev.imageBed.github, pathPrefix: v },
                },
              }))
            }
            placeholder="uploads"
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

export function ResourceAliOssSection(props: ResourceCommonProps) {
  return (
    <div className="space-y-4">
      <div className="list-group p-4">
        <div className="mb-4 flex items-center justify-between">
          <span className="text-[15px] text-gray-800 dark:text-gray-100">
            启用 AliOSS 资源
          </span>
          <SwitchButton
            checked={props.activeResource === "aliOSS"}
            onChange={() =>
              props.updateSetting(
                (prev) => ({
                  ...prev,
                  imageBed: { ...prev.imageBed, active: "aliOSS" },
                }),
                { persist: true },
              )
            }
          />
        </div>

        <div className="space-y-3">
          <FieldInput
            label="Bucket"
            value={props.safeSetting?.imageBed.aliOSS.bucket ?? ""}
            onChange={(v) =>
              props.updateSetting((prev) => ({
                ...prev,
                imageBed: {
                  ...prev.imageBed,
                  aliOSS: { ...prev.imageBed.aliOSS, bucket: v },
                },
              }))
            }
            placeholder="bucket"
          />
          <FieldInput
            label="Region"
            value={props.safeSetting?.imageBed.aliOSS.region ?? ""}
            onChange={(v) =>
              props.updateSetting((prev) => ({
                ...prev,
                imageBed: {
                  ...prev.imageBed,
                  aliOSS: { ...prev.imageBed.aliOSS, region: v },
                },
              }))
            }
            placeholder="oss-cn-hangzhou"
          />
          <FieldInput
            label="路径前缀"
            value={props.safeSetting?.imageBed.aliOSS.pathPrefix ?? ""}
            onChange={(v) =>
              props.updateSetting((prev) => ({
                ...prev,
                imageBed: {
                  ...prev.imageBed,
                  aliOSS: { ...prev.imageBed.aliOSS, pathPrefix: v },
                },
              }))
            }
            placeholder="uploads"
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

export function ResourceS3Section(props: ResourceCommonProps) {
  return (
    <div className="space-y-4">
      <div className="list-group p-4">
        <div className="mb-4 flex items-center justify-between">
          <span className="text-[15px] text-gray-800 dark:text-gray-100">
            启用 S3 资源
          </span>
          <SwitchButton
            checked={props.activeResource === "s3"}
            onChange={() =>
              props.updateSetting(
                (prev) => ({
                  ...prev,
                  imageBed: { ...prev.imageBed, active: "s3" },
                }),
                { persist: true },
              )
            }
          />
        </div>

        <div className="space-y-3">
          <FieldInput
            label="Bucket"
            value={props.safeSetting?.imageBed.s3.bucket ?? ""}
            onChange={(v) =>
              props.updateSetting((prev) => ({
                ...prev,
                imageBed: {
                  ...prev.imageBed,
                  s3: { ...prev.imageBed.s3, bucket: v },
                },
              }))
            }
            placeholder="bucket"
          />
          <FieldInput
            label="Region"
            value={props.safeSetting?.imageBed.s3.region ?? ""}
            onChange={(v) =>
              props.updateSetting((prev) => ({
                ...prev,
                imageBed: {
                  ...prev.imageBed,
                  s3: { ...prev.imageBed.s3, region: v },
                },
              }))
            }
            placeholder="ap-southeast-1"
          />
          <FieldInput
            label="路径前缀"
            value={props.safeSetting?.imageBed.s3.pathPrefix ?? ""}
            onChange={(v) =>
              props.updateSetting((prev) => ({
                ...prev,
                imageBed: {
                  ...prev.imageBed,
                  s3: { ...prev.imageBed.s3, pathPrefix: v },
                },
              }))
            }
            placeholder="uploads"
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

export function ResourceWebDavSection(props: ResourceCommonProps) {
  return (
    <div className="space-y-4">
      <div className="list-group p-4">
        <div className="mb-4 flex items-center justify-between">
          <span className="text-[15px] text-gray-800 dark:text-gray-100">
            启用 WebDAV 资源
          </span>
          <SwitchButton
            checked={props.activeResource === "webdav"}
            onChange={() =>
              props.updateSetting(
                (prev) => ({
                  ...prev,
                  imageBed: { ...prev.imageBed, active: "webdav" },
                }),
                { persist: true },
              )
            }
          />
        </div>

        <div className="space-y-3">
          <FieldInput
            label="路径前缀"
            value={props.safeSetting?.imageBed.webdav.pathPrefix ?? ""}
            onChange={(v) =>
              props.updateSetting((prev) => ({
                ...prev,
                imageBed: {
                  ...prev.imageBed,
                  webdav: { ...prev.imageBed.webdav, pathPrefix: v },
                },
              }))
            }
            placeholder="/uploads"
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
