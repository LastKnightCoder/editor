import { useState } from "react";
import type { SettingCompat } from "../../../types";
import { GroupLabel } from "../../../components/GroupLabel";
import { ActionSheet } from "./ActionSheet";
import type { SettingModule, SettingsPageProps } from "./types";
import { useGithubRepoSelector } from "./useGithubRepoSelector";
import { CredentialEntryRow, FieldInput, FieldSheetTrigger, GroupCard, SaveButton } from "./ui";

type UpdateSetting = SettingsPageProps["updateSetting"];

type ResourceCommonProps = {
  safeSetting: SettingCompat | null;
  isSavingSetting: boolean;
  onSaveSetting: () => Promise<void>;
  updateSetting: UpdateSetting;
  onOpenModule: (module: Exclude<SettingModule, null>) => void;
};

function ParamsGroup(props: { children: React.ReactNode }) {
  return (
    <>
      <GroupLabel>存储参数</GroupLabel>
      {/* 面板内容左边缘 = 16px 容器 + 1px 边框 + 14px，与 .setting-row 行文字同一基准 */}
      <div className="list-group px-3.5 py-4">{props.children}</div>
    </>
  );
}

export function ResourceLocalSection(props: ResourceCommonProps) {
  return (
    <div className="page-enter space-y-1">
      <ParamsGroup>
        <div className="space-y-3">
          <FieldInput
            label="相对目录"
            value={props.safeSetting?.imageBed.local.path ?? "resources"}
            onChange={v =>
              props.updateSetting(prev => ({
                ...prev,
                imageBed: {
                  ...prev.imageBed,
                  local: { ...prev.imageBed.local, path: v },
                },
              }))
            }
            placeholder="resources"
          />
          <p className="text-ink-3 text-xs">
            逻辑路径 `~/.editor/resources`，移动端实际目录为 `appData/.editor/resources`。
          </p>
        </div>
        <SaveButton isSaving={props.isSavingSetting} onClick={props.onSaveSetting} />
      </ParamsGroup>
    </div>
  );
}

export function ResourceGithubSection(props: ResourceCommonProps) {
  const [repoSheetOpen, setRepoSheetOpen] = useState(false);
  const [branchSheetOpen, setBranchSheetOpen] = useState(false);
  const token = props.safeSetting?.integration.github.token ?? "";
  const owner = props.safeSetting?.integration.github.user.name ?? "";
  const repo = props.safeSetting?.imageBed.github.repo ?? "";
  const branch = props.safeSetting?.imageBed.github.branch ?? "";
  const { repos, branches, error, canLoad, loadingRepos, loadingBranches, loadBranches } =
    useGithubRepoSelector({
      token,
      owner,
      repo,
      branch,
    });

  const repoOptions = Array.from(new Set([repo, ...repos].filter(Boolean))).map(item => ({
    label: item,
    value: item,
  }));
  const branchOptions = Array.from(new Set([branch, ...branches].filter(Boolean))).map(item => ({
    label: item,
    value: item,
  }));

  const handleSelectRepo = async (nextRepo: string) => {
    props.updateSetting(prev => ({
      ...prev,
      imageBed: {
        ...prev.imageBed,
        github: {
          ...prev.imageBed.github,
          repo: nextRepo,
          branch: "",
        },
      },
    }));
    await loadBranches(nextRepo);
  };

  return (
    <div className="page-enter space-y-1">
      <GroupLabel>凭证</GroupLabel>
      <GroupCard>
        <CredentialEntryRow
          connected={canLoad && Boolean(owner)}
          account={owner || undefined}
          onOpen={() => props.onOpenModule("integration-github")}
        />
      </GroupCard>
      <ParamsGroup>
        <div className="space-y-3">
          {!canLoad && (
            <div className="bg-tag-4-soft text-tag-4 rounded-2xl p-3 text-sm font-medium">
              请先在「集成账号 · Github」连接账号，再选择仓库与分支。
            </div>
          )}
          {!!error && (
            <div className="bg-tag-5-soft text-danger rounded-2xl p-3 text-sm font-medium">
              {error}
            </div>
          )}
          <FieldSheetTrigger
            label="仓库"
            value={repo}
            onOpen={() => setRepoSheetOpen(true)}
            placeholder="请选择仓库"
            disabled={!canLoad}
            loading={loadingRepos}
          />
          <FieldSheetTrigger
            label="分支"
            value={branch}
            onOpen={() => setBranchSheetOpen(true)}
            placeholder={repo ? "请选择分支" : "请先选择仓库"}
            disabled={!canLoad || !repo}
            loading={loadingBranches}
          />
          <FieldInput
            label="路径前缀"
            value={props.safeSetting?.imageBed.github.pathPrefix ?? ""}
            onChange={v =>
              props.updateSetting(prev => ({
                ...prev,
                imageBed: {
                  ...prev.imageBed,
                  github: {
                    ...prev.imageBed.github,
                    pathPrefix: v,
                  },
                },
              }))
            }
            placeholder="uploads"
          />
        </div>
        <SaveButton isSaving={props.isSavingSetting} onClick={props.onSaveSetting} />
      </ParamsGroup>
      <ActionSheet
        open={repoSheetOpen}
        title="选择仓库"
        value={repo}
        options={repoOptions}
        loading={loadingRepos}
        emptyText={canLoad ? "暂无仓库" : "请先连接 Github"}
        onClose={() => setRepoSheetOpen(false)}
        onSelect={value => {
          void handleSelectRepo(value);
        }}
      />
      <ActionSheet
        open={branchSheetOpen}
        title={repo ? `选择分支（${repo}）` : "选择分支"}
        value={branch}
        options={branchOptions}
        loading={loadingBranches}
        emptyText={repo ? "暂无分支" : "请先选择仓库"}
        onClose={() => setBranchSheetOpen(false)}
        onSelect={value =>
          props.updateSetting(prev => ({
            ...prev,
            imageBed: {
              ...prev.imageBed,
              github: {
                ...prev.imageBed.github,
                branch: value,
              },
            },
          }))
        }
      />
    </div>
  );
}

export function ResourceAliOssSection(props: ResourceCommonProps) {
  const cred = props.safeSetting?.integration.aliOSS;
  const connected = Boolean(cred?.accessKeyId);
  return (
    <div className="page-enter space-y-1">
      <GroupLabel>凭证</GroupLabel>
      <GroupCard>
        <CredentialEntryRow
          connected={connected}
          onOpen={() => props.onOpenModule("integration-alioss")}
        />
      </GroupCard>
      <ParamsGroup>
        <div className="space-y-3">
          <FieldInput
            label="Bucket"
            value={props.safeSetting?.imageBed.aliOSS.bucket ?? ""}
            onChange={v =>
              props.updateSetting(prev => ({
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
            onChange={v =>
              props.updateSetting(prev => ({
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
            onChange={v =>
              props.updateSetting(prev => ({
                ...prev,
                imageBed: {
                  ...prev.imageBed,
                  aliOSS: { ...prev.imageBed.aliOSS, pathPrefix: v },
                },
              }))
            }
            placeholder="uploads"
          />
        </div>
        <SaveButton isSaving={props.isSavingSetting} onClick={props.onSaveSetting} />
      </ParamsGroup>
    </div>
  );
}

export function ResourceS3Section(props: ResourceCommonProps) {
  const cred = props.safeSetting?.integration.s3;
  const connected = Boolean(cred?.accessKeyId);
  return (
    <div className="page-enter space-y-1">
      <GroupLabel>凭证</GroupLabel>
      <GroupCard>
        <CredentialEntryRow
          connected={connected}
          onOpen={() => props.onOpenModule("integration-s3")}
        />
      </GroupCard>
      <ParamsGroup>
        <div className="space-y-3">
          <FieldInput
            label="Bucket"
            value={props.safeSetting?.imageBed.s3.bucket ?? ""}
            onChange={v =>
              props.updateSetting(prev => ({
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
            onChange={v =>
              props.updateSetting(prev => ({
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
            onChange={v =>
              props.updateSetting(prev => ({
                ...prev,
                imageBed: {
                  ...prev.imageBed,
                  s3: { ...prev.imageBed.s3, pathPrefix: v },
                },
              }))
            }
            placeholder="uploads"
          />
        </div>
        <SaveButton isSaving={props.isSavingSetting} onClick={props.onSaveSetting} />
      </ParamsGroup>
    </div>
  );
}

export function ResourceWebDavSection(props: ResourceCommonProps) {
  const cred = props.safeSetting?.integration.webdav;
  const connected = Boolean(cred?.url && cred?.username);
  return (
    <div className="page-enter space-y-1">
      <GroupLabel>凭证</GroupLabel>
      <GroupCard>
        <CredentialEntryRow
          connected={connected}
          onOpen={() => props.onOpenModule("integration-webdav")}
        />
      </GroupCard>
      <ParamsGroup>
        <div className="space-y-3">
          <FieldInput
            label="路径前缀"
            value={props.safeSetting?.imageBed.webdav.pathPrefix ?? ""}
            onChange={v =>
              props.updateSetting(prev => ({
                ...prev,
                imageBed: {
                  ...prev.imageBed,
                  webdav: { ...prev.imageBed.webdav, pathPrefix: v },
                },
              }))
            }
            placeholder="/uploads"
          />
        </div>
        <SaveButton isSaving={props.isSavingSetting} onClick={props.onSaveSetting} />
      </ParamsGroup>
    </div>
  );
}
