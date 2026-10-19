/**
 * 发布配置（站点设置抽屉 + 页头身份共用）—— 读写 setting.publish，凭据只读 setting.integration。
 *
 * GitHub 仓库/分支下拉在凭据就绪时自动拉取（repo 为 owner/name 规范形），basePath 按仓库名推导；
 * favicon 选择后缓存到 userData，发布自动复用；连接测试状态随目标或字段变化失效。
 */

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listPublishTemplates } from "@/commands/publish";
import { produce } from "immer";
import { toast } from "@tau/ui";
import useSettingStore, { EPublishProvider } from "@/stores/useSettingStore";
import {
  checkPublishConnection,
  createDir,
  getFileBaseName,
  getFileExtension,
  getUserDataDir,
  pathExists,
  readBinaryFile,
  removeFile,
  selectFile,
  writeBinaryFile,
} from "@/commands";
import { getReposByOwner, getBranchesByRepo } from "@/utils";
import {
  buildPublishFaviconCachePath,
  buildPublishFaviconCachePaths,
  createPublishFaviconConfig,
  getParentDirFromPath,
  normalizePublishFaviconExtension,
} from "@/utils/publishFavicon";
import type { IPublishFaviconConfig } from "@/types/publish";

export const PROVIDER_LABELS: Record<EPublishProvider, string> = {
  [EPublishProvider.Github]: "GitHub Pages",
  [EPublishProvider.S3]: "S3 静态托管",
  [EPublishProvider.Local]: "本地导出",
};

/** 提供商设置的 string 字段并集（branch/gitWorkingDir 属 GitHub，bucket/region/path 属 S3，basePath 三家通用） */
export type PublishFieldKey =
  "branch" | "gitWorkingDir" | "bucket" | "region" | "path" | "basePath";

export type ConnectionState = "idle" | "checking" | "ok" | "fail";

const USER_CANCELED = "User canceled file selection";
const isUserCanceled = (error: unknown) =>
  error instanceof Error && error.message === USER_CANCELED;

/** username.github.io 仓库站点在根路径，普通仓库在 /repo-name/ 下 */
const computeBasePath = (canonicalRepo: string, userName: string) => {
  if (!canonicalRepo) return "/";
  const [ownerPart, namePart] = canonicalRepo.split("/");
  if (!namePart) return "/";
  const ownerLower = (ownerPart || userName).toLowerCase();
  if (namePart.toLowerCase() === `${ownerLower}.github.io`) return "/";
  return `/${namePart}/`;
};

const updateSetting = (
  recipe: (draft: ReturnType<typeof useSettingStore.getState>["setting"]) => void
) => useSettingStore.setState(s => ({ setting: produce(s.setting, recipe) }));

export function usePublishConfig() {
  const templatesQuery = useQuery({
    queryKey: ["publish", "templates"],
    queryFn: listPublishTemplates,
    refetchOnWindowFocus: true,
  });
  const setting = useSettingStore(s => s.setting);
  const { publish, integration } = setting;
  const active = publish.active;

  const githubTokenReady = Boolean(integration.github.token && integration.github.user.name);
  const s3CredentialReady = Boolean(integration.s3.accessKeyId && integration.s3.secretAccessKey);
  const credentialReady =
    active === EPublishProvider.Github
      ? githubTokenReady
      : active === EPublishProvider.S3
        ? s3CredentialReady
        : true;
  const targetReady =
    active === EPublishProvider.Github
      ? githubTokenReady && Boolean(publish.github.repo && publish.github.branch)
      : active === EPublishProvider.S3
        ? s3CredentialReady && Boolean(publish.s3.bucket)
        : true;

  /* ── GitHub 仓库/分支列表 ── */
  const [repos, setRepos] = useState<string[]>([]);
  const [branches, setBranches] = useState<string[]>([]);
  const [reposLoading, setReposLoading] = useState(false);

  useEffect(() => {
    if (active !== EPublishProvider.Github || !githubTokenReady || repos.length > 0) return;
    let cancelled = false;
    setReposLoading(true);
    void getReposByOwner(integration.github.token, integration.github.user.name)
      .then(list => {
        if (cancelled) return;
        setReposLoading(false);
        if (list) {
          setRepos(
            list.map((item: { name: string }) => `${integration.github.user.name}/${item.name}`)
          );
        } else {
          toast.error("获取仓库列表失败，请检查集成中的 GitHub Token");
        }
      })
      .catch(() => {
        if (cancelled) return;
        setReposLoading(false);
        toast.error("获取仓库列表失败，请检查网络");
      });
    return () => {
      cancelled = true;
    };
  }, [active, githubTokenReady, integration.github, repos.length]);

  useEffect(() => {
    if (active !== EPublishProvider.Github || !githubTokenReady) return;
    const repo = publish.github.repo;
    if (!repo || !repo.includes("/") || branches.length > 0) return;
    const [owner, repoName] = repo.split("/");
    let cancelled = false;
    void getBranchesByRepo(integration.github.token, owner, repoName)
      .then(list => {
        if (!cancelled && list) {
          setBranches(list.map((item: { name: string }) => item.name));
        }
      })
      .catch(() => {
        if (!cancelled) toast.error("获取分支列表失败，请检查网络");
      });
    return () => {
      cancelled = true;
    };
  }, [active, githubTokenReady, integration.github, publish.github.repo, branches.length]);

  const selectRepo = async (repo: string) => {
    const canonicalRepo = repo.includes("/") ? repo : `${integration.github.user.name}/${repo}`;
    updateSetting(draft => {
      draft.publish.github.repo = canonicalRepo;
      draft.publish.github.basePath = computeBasePath(canonicalRepo, integration.github.user.name);
    });
    const [owner, repoName] = canonicalRepo.split("/");
    try {
      const list = await getBranchesByRepo(integration.github.token, owner, repoName);
      if (list) setBranches(list.map((item: { name: string }) => item.name));
      else toast.error("获取分支列表失败");
    } catch {
      toast.error("获取分支列表失败，请检查网络");
    }
  };

  const repoOptions = repos.length
    ? repos.map(name => ({ value: name, label: name }))
    : publish.github.repo
      ? [{ value: publish.github.repo, label: publish.github.repo }]
      : [];
  const branchOptions = branches.length
    ? branches.map(name => ({ value: name, label: name }))
    : publish.github.branch
      ? [{ value: publish.github.branch, label: publish.github.branch }]
      : [];

  /* ── 字段写入（即时保存） ── */
  const setProvider = (provider: EPublishProvider) =>
    updateSetting(draft => {
      draft.publish.active = provider;
    });

  const getField = (field: PublishFieldKey) =>
    (publish[active] as Record<PublishFieldKey, string>)[field] ?? "";

  const setField = (field: PublishFieldKey, value: string) =>
    updateSetting(draft => {
      (draft.publish[draft.publish.active] as Record<PublishFieldKey, string>)[field] = value;
    });

  const setSiteField = (
    field: "title" | "description" | "publicUrl" | "templateId",
    value: string
  ) =>
    updateSetting(draft => {
      draft.publish.site[field] = value;
    });

  const setUseGitCli = (checked: boolean) =>
    updateSetting(draft => {
      draft.publish.github.useGitCli = checked;
    });

  const selectGitWorkingDir = async () => {
    try {
      const paths = await selectFile({ properties: ["openDirectory", "createDirectory"] });
      if (paths && paths.length > 0) setField("gitWorkingDir", paths[0]);
    } catch (error) {
      if (isUserCanceled(error)) return;
      toast.error(`选择 Git 目录失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  /* ── favicon：选择后缓存本地 ── */
  const setFavicon = (favicon?: IPublishFaviconConfig) =>
    updateSetting(draft => {
      draft.publish.site.favicon = favicon;
    });

  const removeCachedFaviconFiles = async () => {
    const userDataDir = await getUserDataDir();
    const targets = buildPublishFaviconCachePaths(userDataDir);
    await Promise.all(
      targets.map(async targetPath => {
        if (await pathExists(targetPath)) await removeFile(targetPath);
      })
    );
  };

  const selectFavicon = async () => {
    try {
      const paths = await selectFile({
        properties: ["openFile"],
        filters: [{ name: "Favicon", extensions: ["svg", "png", "ico"] }],
      });
      if (!paths || paths.length === 0) return;
      const filePath = paths[0];
      const extension = normalizePublishFaviconExtension(await getFileExtension(filePath));
      if (!extension) {
        toast.error("仅支持 SVG、PNG、ICO 格式的 favicon");
        return;
      }
      const userDataDir = await getUserDataDir();
      const cachePath = buildPublishFaviconCachePath(userDataDir, extension);
      // 先读源文件成功、再删旧缓存，避免中途失败后新旧皆失
      const content = await readBinaryFile(filePath);
      await createDir(getParentDirFromPath(cachePath));
      await removeCachedFaviconFiles();
      await writeBinaryFile(cachePath, content);
      setFavicon(
        createPublishFaviconConfig({
          cachePath,
          fileName: await getFileBaseName(filePath),
          format: extension,
        })
      );
      toast.success("已缓存发布 favicon");
    } catch (error) {
      if (isUserCanceled(error)) return;
      toast.error(`选择 favicon 失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const clearFavicon = async () => {
    try {
      await removeCachedFaviconFiles();
      setFavicon(undefined);
      toast.success("已清除自定义 favicon");
    } catch (error) {
      toast.error(`清除 favicon 失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  /* ── 提供商配置（executePublish / checkPublishConnection 入参） ── */
  const providerConfig = useMemo(() => {
    if (active === EPublishProvider.Github) {
      return {
        token: integration.github.token,
        repo: publish.github.repo,
        branch: publish.github.branch,
        committerName: integration.github.user.name,
        committerEmail: integration.github.user.email,
        basePath: publish.github.basePath,
        useGitCli: publish.github.useGitCli,
        gitWorkingDir: publish.github.gitWorkingDir,
      };
    }
    if (active === EPublishProvider.S3) {
      return {
        accessKeyId: integration.s3.accessKeyId,
        secretAccessKey: integration.s3.secretAccessKey,
        bucket: publish.s3.bucket,
        region: publish.s3.region,
        endpoint: integration.s3.endpoint,
        pathPrefix: publish.s3.path,
        urlStyle: integration.s3.urlStyle,
        basePath: publish.s3.basePath,
      };
    }
    return { basePath: publish.local.basePath };
  }, [active, publish, integration]);

  /* ── 连接测试：配置一变即失效 ── */
  const [connection, setConnection] = useState<ConnectionState>("idle");
  const connectionKey = `${active}:${JSON.stringify(providerConfig)}`;
  useEffect(() => setConnection("idle"), [connectionKey]);

  const checkConnection = async () => {
    if (active === EPublishProvider.Local) return;
    setConnection("checking");
    try {
      const connected = await checkPublishConnection({ providerType: active, providerConfig });
      setConnection(connected ? "ok" : "fail");
    } catch (error) {
      setConnection("fail");
      toast.error(`连接测试失败: ${error}`);
    }
  };

  /* ── 站点访问地址：公开 URL 优先，GitHub 按仓库推导 ── */
  const siteUrl = useMemo(() => {
    const publicUrl = publish.site.publicUrl.trim();
    if (publicUrl) return publicUrl;
    if (active === EPublishProvider.Github && publish.github.repo.includes("/")) {
      const owner = publish.github.repo.split("/")[0].toLowerCase();
      return `https://${owner}.github.io${publish.github.basePath || "/"}`;
    }
    return "";
  }, [active, publish.site.publicUrl, publish.github.repo, publish.github.basePath]);

  return {
    templateReady: Boolean(
      templatesQuery.data?.some(template => template.id === publish.site.templateId)
    ),
    templateOptions: (templatesQuery.data ?? []).map(template => ({
      label: `${template.name} · ${template.version}`,
      value: template.id,
    })),
    templateError: templatesQuery.error instanceof Error ? templatesQuery.error.message : "",
    publish,
    integration,
    appearance: setting.appearance,
    active,
    credentialReady,
    targetReady,
    githubTokenReady,
    providerConfig,
    siteUrl,
    repoOptions,
    branchOptions,
    reposLoading,
    selectRepo,
    setProvider,
    getField,
    setField,
    setSiteField,
    setUseGitCli,
    selectGitWorkingDir,
    selectFavicon,
    clearFavicon,
    connection,
    checkConnection,
  };
}

export type PublishConfig = ReturnType<typeof usePublishConfig>;
