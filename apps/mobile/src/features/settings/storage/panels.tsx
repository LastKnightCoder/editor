// 内置存储服务的设置面板：账号卡 + 存储位置字段。同步服务与上传服务共用同一份账号（集成账号），
// 只是存储位置写进各自的配置段，所以面板只接收「当前值 + 改写函数」，不关心写到哪里。

import { useState } from "react";
import type { SettingCompat } from "../../../types";
import { GroupLabel } from "../../../components/GroupLabel";
import { ActionSheet } from "../components/ActionSheet";
import type { SettingModuleKey } from "../components/types";
import { useGithubRepoSelector } from "../components/useGithubRepoSelector";
import { AccountCard, FieldGroup, PickerField, TextField } from "./fields";

const ACCOUNT_DESCRIPTION = "同步与图片上传共用此账号";

type PanelBase<T> = {
  setting: SettingCompat;
  onOpenModule: (module: SettingModuleKey) => void;
  value: T;
  /** 只改内存，字段失焦或选择完成时再调用 onCommit 持久化 */
  onPatch: (patch: Partial<T>) => void;
  onCommit: () => void;
  /** 目录字段的占位与说明：同步存数据库、上传存图片，措辞不同 */
  pathPlaceholder: string;
  pathHint?: string;
};

function maskKey(key: string): string {
  if (key.length <= 8) return key;
  return `${key.slice(0, 4)}••••${key.slice(-4)}`;
}

export function S3Panel(props: PanelBase<{ bucket: string; region: string; pathPrefix: string }>) {
  const account = props.setting.integration.s3;
  return (
    <>
      <GroupLabel>账号</GroupLabel>
      <AccountCard
        letter="S"
        tileClassName="bg-tag-2-soft text-tag-2"
        connected={Boolean(account.accessKeyId && account.secretAccessKey)}
        title={maskKey(account.accessKeyId)}
        description={account.endpoint || ACCOUNT_DESCRIPTION}
        onManage={() => props.onOpenModule("integration-s3")}
      />
      <GroupLabel>存储位置</GroupLabel>
      <FieldGroup>
        <TextField
          label="Bucket"
          value={props.value.bucket}
          placeholder="必填"
          onChange={bucket => props.onPatch({ bucket })}
          onCommit={props.onCommit}
        />
        <TextField
          label="Region"
          value={props.value.region}
          placeholder="例如 ap-southeast-1"
          onChange={region => props.onPatch({ region })}
          onCommit={props.onCommit}
        />
        <TextField
          label="目录"
          value={props.value.pathPrefix}
          placeholder={props.pathPlaceholder}
          hint={props.pathHint}
          onChange={pathPrefix => props.onPatch({ pathPrefix })}
          onCommit={props.onCommit}
        />
      </FieldGroup>
    </>
  );
}

export function AliOssPanel(props: PanelBase<{ bucket: string; region: string; path: string }>) {
  const account = props.setting.integration.aliOSS;
  return (
    <>
      <GroupLabel>账号</GroupLabel>
      <AccountCard
        letter="A"
        tileClassName="bg-accent-soft text-accent-text"
        connected={Boolean(account.accessKeyId && account.accessKeySecret)}
        title={maskKey(account.accessKeyId)}
        description={ACCOUNT_DESCRIPTION}
        onManage={() => props.onOpenModule("integration-alioss")}
      />
      <GroupLabel>存储位置</GroupLabel>
      <FieldGroup>
        <TextField
          label="Bucket"
          value={props.value.bucket}
          placeholder="必填"
          onChange={bucket => props.onPatch({ bucket })}
          onCommit={props.onCommit}
        />
        <TextField
          label="Region"
          value={props.value.region}
          placeholder="例如 oss-cn-hangzhou"
          onChange={region => props.onPatch({ region })}
          onCommit={props.onCommit}
        />
        <TextField
          label="目录"
          value={props.value.path}
          placeholder={props.pathPlaceholder}
          hint={props.pathHint}
          onChange={path => props.onPatch({ path })}
          onCommit={props.onCommit}
        />
      </FieldGroup>
    </>
  );
}

export function WebDavPanel(props: PanelBase<{ pathPrefix: string }>) {
  const account = props.setting.integration.webdav;
  return (
    <>
      <GroupLabel>账号</GroupLabel>
      <AccountCard
        letter="W"
        tileClassName="bg-tag-1-soft text-tag-1"
        connected={Boolean(account.url && account.username && account.password)}
        title={account.username}
        description={account.url || ACCOUNT_DESCRIPTION}
        onManage={() => props.onOpenModule("integration-webdav")}
      />
      <GroupLabel>存储位置</GroupLabel>
      <FieldGroup>
        <TextField
          label="目录"
          value={props.value.pathPrefix}
          placeholder={props.pathPlaceholder}
          hint={props.pathHint}
          onChange={pathPrefix => props.onPatch({ pathPrefix })}
          onCommit={props.onCommit}
        />
      </FieldGroup>
    </>
  );
}

export function GithubPanel(
  props: PanelBase<{ repo: string; branch: string; pathPrefix: string }>
) {
  const [sheet, setSheet] = useState<"repo" | "branch" | null>(null);
  const token = props.setting.integration.github.token;
  const owner = props.setting.integration.github.user.name;
  const { repo, branch, pathPrefix } = props.value;
  const selector = useGithubRepoSelector({ token, owner, repo, branch });
  const toOptions = (items: string[], current: string) =>
    Array.from(new Set([current, ...items].filter(Boolean))).map(value => ({
      label: value,
      value,
    }));

  const selectRepo = (nextRepo: string) => {
    props.onPatch({ repo: nextRepo, branch: "" });
    props.onCommit();
    void selector.loadBranches(nextRepo);
  };

  const selectBranch = (nextBranch: string) => {
    props.onPatch({ branch: nextBranch });
    props.onCommit();
  };

  return (
    <>
      <GroupLabel>账号</GroupLabel>
      <AccountCard
        letter="G"
        tileClassName="bg-tag-3-soft text-tag-3"
        connected={selector.canLoad}
        title={owner}
        description={selector.canLoad ? ACCOUNT_DESCRIPTION : "连接后才能选择仓库与分支"}
        onManage={() => props.onOpenModule("integration-github")}
      />
      <GroupLabel>存储位置</GroupLabel>
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
          label="目录"
          value={pathPrefix}
          placeholder={props.pathPlaceholder}
          hint={props.pathHint}
          onChange={value => props.onPatch({ pathPrefix: value })}
          onCommit={props.onCommit}
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
