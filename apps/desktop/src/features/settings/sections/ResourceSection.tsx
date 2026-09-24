/**
 * 资源存储 —— 上传目标（图床）：编辑器内上传直达所选存储（本地 / WebDAV / S3 /
 * 阿里云 OSS / GitHub，分段切换即生效）；凭据在「账号与连接」子页，本页只配存储定位；
 * 上传压缩是全局开关，本地目标落盘前同样生效。
 * 资源目录同步（resources 目录与云端镜像）已迁至「同步」子页的资源文件 Tab
 * （sections/ResourceSync.tsx，2026-09-24 第三版）。
 */

import { useEffect, useState } from "react";
import { produce } from "immer";
import { ArrowRight, Info } from "lucide-react";
import { Input, Segmented, Select, Switch, toast } from "@tau/ui";
import useSettingStore, { EImageBed } from "@/stores/useSettingStore";
import { getBucketList } from "@/commands";
import { getReposByOwner, getBranchesByRepo } from "@/utils";
import { EGithubCDN, GITHUB_CDN_NONE_VALUE, GithubCDNOptions } from "@/constants/github";
import { useSettingsStore } from "@/app/settingsStore";
import { SettingRow } from "../components/SettingRow";
import { SettingsGroup, SettingsNote } from "../components/SettingsGroup";

const PROVIDER_LABELS: Record<EImageBed, string> = {
  [EImageBed.Local]: "本地",
  [EImageBed.Github]: "GitHub",
  [EImageBed.AliOSS]: "阿里云 OSS",
  [EImageBed.S3]: "S3",
  [EImageBed.WebDav]: "WebDAV",
};

const PROVIDER_ORDER: EImageBed[] = [
  EImageBed.Local,
  EImageBed.WebDav,
  EImageBed.S3,
  EImageBed.AliOSS,
  EImageBed.Github,
];

export function ResourceSection() {
  const setting = useSettingStore(s => s.setting);
  const { imageBed, integration } = setting;
  const active = imageBed.active;

  /* ── 上传目标：GitHub 仓库/分支、OSS Bucket 列表（凭据就绪自动拉取） ── */
  const githubTokenReady = Boolean(integration.github.token && integration.github.user.name);
  const [repos, setRepos] = useState<string[]>([]);
  const [branches, setBranches] = useState<string[]>([]);
  const [reposLoading, setReposLoading] = useState(false);

  useEffect(() => {
    if (active !== EImageBed.Github || !githubTokenReady || repos.length > 0) return;
    let cancelled = false;
    setReposLoading(true);
    void getReposByOwner(integration.github.token, integration.github.user.name).then(list => {
      if (cancelled) return;
      setReposLoading(false);
      if (list) {
        setRepos(list.map((item: { name: string }) => item.name));
      } else {
        toast.error("获取仓库列表失败，请检查集成中的 GitHub Token");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [active, githubTokenReady, integration.github, repos.length]);

  useEffect(() => {
    if (active !== EImageBed.Github || !githubTokenReady) return;
    const repo = imageBed.github.repo;
    if (!repo || branches.length > 0) return;
    let cancelled = false;
    void getBranchesByRepo(integration.github.token, integration.github.user.name, repo).then(
      list => {
        if (!cancelled && list) {
          setBranches(list.map((item: { name: string }) => item.name));
        }
      }
    );
    return () => {
      cancelled = true;
    };
  }, [active, githubTokenReady, integration.github, imageBed.github, branches.length]);

  const [buckets, setBuckets] = useState<Array<{ bucket: string; region: string }>>([]);
  const ossCredentialReady = Boolean(
    integration.aliOSS.accessKeyId && integration.aliOSS.accessKeySecret
  );

  useEffect(() => {
    if (active !== EImageBed.AliOSS || !ossCredentialReady || buckets.length > 0) return;
    let cancelled = false;
    void getBucketList(integration.aliOSS.accessKeyId, integration.aliOSS.accessKeySecret)
      .then(list => {
        if (!cancelled && list) setBuckets(list);
      })
      .catch(() => {
        if (!cancelled) toast.error("获取 Bucket 列表失败，请检查集成中的阿里云凭据");
      });
    return () => {
      cancelled = true;
    };
  }, [active, ossCredentialReady, integration.aliOSS, buckets.length]);

  const updateImageBedField = (field: string, value: string) => {
    useSettingStore.setState(s => ({
      setting: produce(s.setting, draft => {
        (draft.imageBed[active] as Record<string, string>)[field] = value;
      }),
    }));
  };

  const setActiveProvider = (provider: EImageBed) => {
    useSettingStore.setState(s => ({
      setting: produce(s.setting, draft => {
        draft.imageBed.active = provider;
      }),
    }));
  };

  const setCompression = (checked: boolean) => {
    useSettingStore.setState(s => ({
      setting: produce(s.setting, draft => {
        draft.imageBed.enableCompression = checked;
      }),
    }));
  };

  const handleSelectRepo = async (repo: string) => {
    updateImageBedField("repo", repo);
    const list = await getBranchesByRepo(
      integration.github.token,
      integration.github.user.name,
      repo
    );
    if (list) {
      setBranches(list.map((item: { name: string }) => item.name));
    } else {
      toast.error("获取分支列表失败");
    }
  };

  const handleSelectBucket = (bucket: string) => {
    const info = buckets.find(item => item.bucket === bucket);
    useSettingStore.setState(s => ({
      setting: produce(s.setting, draft => {
        draft.imageBed.aliOSS.bucket = bucket;
        if (info) draft.imageBed.aliOSS.region = info.region;
      }),
    }));
  };

  const openIntegration = () => useSettingsStore.getState().openSettings("integration");

  const repoOptions = repos.length
    ? repos.map(name => ({ value: name, label: name }))
    : imageBed.github.repo
      ? [{ value: imageBed.github.repo, label: imageBed.github.repo }]
      : [];
  const branchOptions = branches.length
    ? branches.map(name => ({ value: name, label: name }))
    : imageBed.github.branch
      ? [{ value: imageBed.github.branch, label: imageBed.github.branch }]
      : [];
  const bucketOptions = buckets.length
    ? buckets.map(item => ({ value: item.bucket, label: item.bucket }))
    : imageBed.aliOSS.bucket
      ? [{ value: imageBed.aliOSS.bucket, label: imageBed.aliOSS.bucket }]
      : [];

  const inputRow = (field: string, label: string, placeholder?: string, description?: string) => (
    <SettingRow key={field} title={label} description={description}>
      <Input
        className="w-[260px]"
        value={(imageBed[active] as Record<string, string>)[field] ?? ""}
        placeholder={placeholder}
        spellCheck={false}
        onChange={e => updateImageBedField(field, e.target.value)}
      />
    </SettingRow>
  );

  const credentialHints: Partial<Record<EImageBed, string>> = {
    [EImageBed.Github]: "Personal Access Token；仓库与分支列表依赖该凭据",
    [EImageBed.AliOSS]: "AccessKey 与 Secret；Bucket 列表依赖该凭据",
    [EImageBed.S3]: "AccessKey、Secret 与 Endpoint",
    [EImageBed.WebDav]: "服务器地址、用户名与密码",
  };
  const credentialHint = credentialHints[active];

  return (
    <>
      <SettingsGroup title="上传目标" description="编辑器内上传的图片与附件直达所选存储">
        <SettingRow title="存储位置">
          <Segmented
            label="上传目标"
            size="sm"
            value={active}
            onValueChange={v => setActiveProvider(v as EImageBed)}
          >
            {PROVIDER_ORDER.map(key => (
              <Segmented.Item key={key} value={key} label={PROVIDER_LABELS[key]} />
            ))}
          </Segmented>
        </SettingRow>

        {active === EImageBed.Local && (
          <SettingRow title="存储目录" description="资源保存在当前数据库的 resources 目录，不上传">
            <Input
              value={imageBed.local.path || "resources"}
              readOnly
              className="font-tau-mono w-[220px]"
            />
          </SettingRow>
        )}

        {active === EImageBed.Github && (
          <>
            <SettingRow title="仓库">
              <Select
                aria-label="GitHub 仓库"
                className="w-[260px]"
                value={imageBed.github.repo}
                placeholder={
                  githubTokenReady ? (reposLoading ? "加载中…" : "选择仓库") : "需先配置 Token"
                }
                disabled={!githubTokenReady}
                options={repoOptions}
                onValueChange={v => void handleSelectRepo(v)}
              />
            </SettingRow>
            <SettingRow title="分支">
              <Select
                aria-label="GitHub 分支"
                className="w-[260px]"
                value={imageBed.github.branch}
                placeholder={imageBed.github.repo ? "选择分支" : "先选择仓库"}
                disabled={!githubTokenReady || !imageBed.github.repo}
                options={branchOptions}
                onValueChange={v => updateImageBedField("branch", v)}
              />
            </SettingRow>
            {inputRow("pathPrefix", "路径前缀", "如：img/", "可选")}
            <SettingRow title="CDN" description="用 CDN 加速访问仓库里的资源">
              <Select
                aria-label="GitHub CDN"
                className="w-[260px]"
                value={imageBed.github.cdn ?? GITHUB_CDN_NONE_VALUE}
                options={GithubCDNOptions}
                onValueChange={v =>
                  useSettingStore.setState(s => ({
                    setting: produce(s.setting, draft => {
                      draft.imageBed.github.cdn =
                        v === GITHUB_CDN_NONE_VALUE ? null : (v as EGithubCDN);
                    }),
                  }))
                }
              />
            </SettingRow>
          </>
        )}

        {active === EImageBed.AliOSS && (
          <>
            <SettingRow title="Bucket" description="选择后自动带出 Region">
              <Select
                aria-label="阿里云 OSS Bucket"
                className="w-[260px]"
                value={imageBed.aliOSS.bucket}
                placeholder={ossCredentialReady ? "选择 Bucket" : "需先配置 AccessKey"}
                disabled={!ossCredentialReady}
                options={bucketOptions}
                onValueChange={handleSelectBucket}
              />
            </SettingRow>
            {inputRow("region", "Region", "如：oss-cn-hangzhou")}
            {inputRow("pathPrefix", "路径前缀", "如：img/", "可选")}
          </>
        )}

        {active === EImageBed.S3 && (
          <>
            {inputRow("bucket", "Bucket")}
            {inputRow("region", "Region", "如：us-east-1")}
            {inputRow("pathPrefix", "路径前缀", "如：img/", "可选")}
          </>
        )}

        {active === EImageBed.WebDav &&
          inputRow("pathPrefix", "路径前缀", "如：/resources", "可选")}

        {credentialHint && (
          <SettingRow title="账号凭据" description={credentialHint}>
            <button
              type="button"
              className="text-tau-meta text-accent-text inline-flex items-center gap-1 font-medium hover:underline"
              onClick={openIntegration}
            >
              在「账号与连接」管理
              <ArrowRight size={13} strokeWidth={1.75} />
            </button>
          </SettingRow>
        )}
      </SettingsGroup>

      <SettingsGroup title="处理">
        <SettingRow
          title="上传压缩"
          description={`png / jpeg / jpg ${active === EImageBed.Local ? "落盘前" : "上传时"}自动转 webp 减小体积`}
        >
          <Switch
            aria-label="上传压缩"
            checked={imageBed.enableCompression}
            onCheckedChange={setCompression}
          />
        </SettingRow>
      </SettingsGroup>

      <SettingsNote icon={<Info size={14} strokeWidth={1.75} />}>
        本地 resources 目录与云端的镜像同步在「同步 · 资源文件」中管理。
      </SettingsNote>
    </>
  );
}
