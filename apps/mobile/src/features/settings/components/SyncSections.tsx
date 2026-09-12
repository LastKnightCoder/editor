import { useState } from "react";
import type { SettingCompat } from "../../../types";
import { ActionSheet } from "./ActionSheet";
import type { SettingModule, SettingsPageProps } from "./types";
import { useGithubRepoSelector } from "./useGithubRepoSelector";
import {
  CredentialEntryRow,
  FieldInput,
  FieldSheetTrigger,
  GroupCard,
  GroupLabel,
  SaveButton,
} from "./ui";

type UpdateSetting = SettingsPageProps["updateSetting"];

type SyncSectionProps = {
  safeSetting: SettingCompat | null;
  isSavingSetting: boolean;
  onSaveSetting: () => Promise<void>;
  updateSetting: UpdateSetting;
  onOpenModule: (module: Exclude<SettingModule, null>) => void;
};

/** 凭证组：各服务凭证在集成账号统一管理，配置页只放入口与连接态 */
function CredentialGroup(props: { connected: boolean; account?: string; onOpen: () => void }) {
  return (
    <>
      <GroupLabel>凭证</GroupLabel>
      <GroupCard>
        <CredentialEntryRow
          connected={props.connected}
          account={props.account}
          onOpen={props.onOpen}
        />
      </GroupCard>
    </>
  );
}

function ParamsGroup(props: { children: React.ReactNode }) {
  return (
    <>
      <GroupLabel>同步参数</GroupLabel>
      <div className="list-group p-4">{props.children}</div>
    </>
  );
}

export function SyncWebDavSection(props: SyncSectionProps) {
  const cred = props.safeSetting?.integration.webdav;
  const connected = Boolean(cred?.url && cred?.username);
  return (
    <div className="page-enter space-y-1">
      <CredentialGroup
        connected={connected}
        onOpen={() => props.onOpenModule("integration-webdav")}
      />
      <ParamsGroup>
        <div className="space-y-3">
          <FieldInput
            label="路径前缀"
            value={props.safeSetting?.sync.webdav.pathPrefix ?? ""}
            onChange={v =>
              props.updateSetting(prev => ({
                ...prev,
                sync: {
                  ...prev.sync,
                  webdav: { ...prev.sync.webdav, pathPrefix: v },
                },
              }))
            }
            placeholder="/sync"
          />
        </div>
        <SaveButton isSaving={props.isSavingSetting} onClick={props.onSaveSetting} />
      </ParamsGroup>
    </div>
  );
}

export function SyncAliOssSection(props: SyncSectionProps) {
  const cred = props.safeSetting?.integration.aliOSS;
  const connected = Boolean(cred?.accessKeyId);
  return (
    <div className="page-enter space-y-1">
      <CredentialGroup
        connected={connected}
        onOpen={() => props.onOpenModule("integration-alioss")}
      />
      <ParamsGroup>
        <div className="space-y-3">
          <FieldInput
            label="Bucket"
            value={props.safeSetting?.sync.aliOSS.bucket ?? ""}
            onChange={v =>
              props.updateSetting(prev => ({
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
            onChange={v =>
              props.updateSetting(prev => ({
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
            onChange={v =>
              props.updateSetting(prev => ({
                ...prev,
                sync: {
                  ...prev.sync,
                  aliOSS: { ...prev.sync.aliOSS, path: v },
                },
              }))
            }
            placeholder="/sync"
          />
        </div>
        <SaveButton isSaving={props.isSavingSetting} onClick={props.onSaveSetting} />
      </ParamsGroup>
    </div>
  );
}

export function SyncGithubSection(props: SyncSectionProps) {
  const [repoSheetOpen, setRepoSheetOpen] = useState(false);
  const [branchSheetOpen, setBranchSheetOpen] = useState(false);
  const token = props.safeSetting?.integration.github.token ?? "";
  const owner = props.safeSetting?.integration.github.user.name ?? "";
  const repo = props.safeSetting?.sync.github.repo ?? "";
  const branch = props.safeSetting?.sync.github.branch ?? "";
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
      sync: {
        ...prev.sync,
        github: {
          ...prev.sync.github,
          repo: nextRepo,
          branch: "",
        },
      },
    }));
    await loadBranches(nextRepo);
  };

  return (
    <div className="page-enter space-y-1">
      <CredentialGroup
        connected={canLoad && Boolean(owner)}
        account={owner || undefined}
        onOpen={() => props.onOpenModule("integration-github")}
      />
      <ParamsGroup>
        <div className="space-y-3">
          {!canLoad && (
            <div className="bg-butter-soft text-butter rounded-2xl p-3 text-sm font-medium">
              请先在「集成账号 · Github」连接账号，再选择仓库与分支。
            </div>
          )}
          {!!error && (
            <div className="bg-rose-soft text-danger rounded-2xl p-3 text-sm font-medium">
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
            value={props.safeSetting?.sync.github.pathPrefix ?? ""}
            onChange={v =>
              props.updateSetting(prev => ({
                ...prev,
                sync: {
                  ...prev.sync,
                  github: {
                    ...prev.sync.github,
                    pathPrefix: v,
                  },
                },
              }))
            }
            placeholder="sync"
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
            sync: {
              ...prev.sync,
              github: {
                ...prev.sync.github,
                branch: value,
              },
            },
          }))
        }
      />
    </div>
  );
}

export function SyncS3Section(props: SyncSectionProps) {
  const cred = props.safeSetting?.integration.s3;
  const connected = Boolean(cred?.accessKeyId);
  return (
    <div className="page-enter space-y-1">
      <CredentialGroup connected={connected} onOpen={() => props.onOpenModule("integration-s3")} />
      <ParamsGroup>
        <div className="space-y-3">
          <FieldInput
            label="Bucket"
            value={props.safeSetting?.sync.s3.bucket ?? ""}
            onChange={v =>
              props.updateSetting(prev => ({
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
            onChange={v =>
              props.updateSetting(prev => ({
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
            onChange={v =>
              props.updateSetting(prev => ({
                ...prev,
                sync: {
                  ...prev.sync,
                  s3: { ...prev.sync.s3, pathPrefix: v },
                },
              }))
            }
            placeholder="sync"
          />
        </div>
        <SaveButton isSaving={props.isSavingSetting} onClick={props.onSaveSetting} />
      </ParamsGroup>
    </div>
  );
}
