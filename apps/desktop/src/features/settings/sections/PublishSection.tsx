/**
 * 发布 —— 将选中内容生成静态站点并发布。
 *
 * 四节：发布目标（GitHub Pages / S3 静态托管 / 本地导出，凭据在「集成」子页，
 * GitHub 的仓库与分支下拉凭据就绪自动拉取，basePath 按仓库名自动推导）→
 * 站点配置（标题 / 描述 / 公开 URL / favicon 选择后本地缓存）→ 发布内容
 * （内嵌 PublishSelector，五类内容勾选、选择持久化）→ 发布操作
 * （增量推送或本地导出，五阶段进度 + 取消）。
 */

import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { produce } from "immer";
import { FolderOpen, UploadCloud, Zap } from "lucide-react";
import { Button, Switch, Input, Select, toast } from "@tau/ui";
import useSettingStore, { EPublishProvider } from "@/stores/useSettingStore";
import {
  checkPublishConnection,
  createDir,
  downloadPublishTemplate,
  executePublish,
  getFileBaseName,
  getFileExtension,
  getUserDataDir,
  pathExists,
  readBinaryFile,
  removeFile,
  selectFile,
  writeBinaryFile,
} from "@/commands";
import { exportPublishOutput } from "@/commands/publish";
import { getReposByOwner, getBranchesByRepo } from "@/utils";
import {
  buildPublishFaviconCachePath,
  buildPublishFaviconCachePaths,
  createPublishFaviconConfig,
  getParentDirFromPath,
  normalizePublishFaviconExtension,
} from "@/utils/publishFavicon";
import PublishSelector from "@/components/PublishSelector";
import LocalImage from "@/components/LocalImage";
import type { IPublishFaviconConfig } from "@/types/publish";
import { useSettingsStore } from "@/app/settingsStore";
import { SettingRow } from "../components/SettingRow";
import { SectionTitle } from "../components/SectionTitle";

const PROVIDER_LABELS: Record<EPublishProvider, string> = {
  [EPublishProvider.Github]: "GitHub Pages",
  [EPublishProvider.S3]: "S3 静态托管",
  [EPublishProvider.Local]: "本地导出",
};

/** 提供商设置节的 string 字段并集（branch/gitWorkingDir 属 GitHub，bucket/region/path 属 S3，basePath 三家通用） */
type PublishFieldKey = "branch" | "gitWorkingDir" | "bucket" | "region" | "path" | "basePath";

/** username.github.io 仓库站点在根路径，普通仓库在 /repo-name/ 下 */
const computeBasePath = (canonicalRepo: string, userName: string) => {
  if (!canonicalRepo) return "/";
  const [ownerPart, namePart] = canonicalRepo.split("/");
  if (!namePart) return "/";
  const ownerLower = (ownerPart || userName).toLowerCase();
  if (namePart.toLowerCase() === `${ownerLower}.github.io`) return "/";
  return `/${namePart}/`;
};

export function PublishSection() {
  const setting = useSettingStore(s => s.setting);
  const { publish, integration, appearance } = setting;
  const active = publish.active;
  const isLocalProvider = active === EPublishProvider.Local;

  /* ── GitHub 仓库/分支列表（凭据就绪自动拉取，repo 为 owner/name 规范形） ── */
  const githubTokenReady = Boolean(integration.github.token && integration.github.user.name);
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

  const handleSelectRepo = async (repo: string) => {
    const canonicalRepo = repo.includes("/") ? repo : `${integration.github.user.name}/${repo}`;
    useSettingStore.setState(s => ({
      setting: produce(s.setting, draft => {
        draft.publish.github.repo = canonicalRepo;
        draft.publish.github.basePath = computeBasePath(
          canonicalRepo,
          integration.github.user.name
        );
      }),
    }));
    const [owner, repoName] = canonicalRepo.split("/");
    try {
      const list = await getBranchesByRepo(integration.github.token, owner, repoName);
      if (list) {
        setBranches(list.map((item: { name: string }) => item.name));
      } else {
        toast.error("获取分支列表失败");
      }
    } catch {
      toast.error("获取分支列表失败，请检查网络");
    }
  };

  const updatePublishField = (field: PublishFieldKey, value: string) => {
    useSettingStore.setState(s => ({
      setting: produce(s.setting, draft => {
        (draft.publish[active] as Record<PublishFieldKey, string>)[field] = value;
      }),
    }));
  };

  const updateSiteField = (field: "title" | "description" | "publicUrl", value: string) => {
    useSettingStore.setState(s => ({
      setting: produce(s.setting, draft => {
        draft.publish.site[field] = value;
      }),
    }));
  };

  const setUseGitCli = (checked: boolean) => {
    useSettingStore.setState(s => ({
      setting: produce(s.setting, draft => {
        draft.publish.github.useGitCli = checked;
      }),
    }));
  };

  /* ── 站点 favicon：选择后缓存本地，发布自动复用 ── */
  const setFavicon = (favicon?: IPublishFaviconConfig) => {
    useSettingStore.setState(s => ({
      setting: produce(s.setting, draft => {
        draft.publish.site.favicon = favicon;
      }),
    }));
  };

  const removeCachedFaviconFiles = async () => {
    const userDataDir = await getUserDataDir();
    const targets = buildPublishFaviconCachePaths(userDataDir);
    await Promise.all(
      targets.map(async targetPath => {
        if (await pathExists(targetPath)) {
          await removeFile(targetPath);
        }
      })
    );
  };

  const handleSelectFavicon = async () => {
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
      if (error instanceof Error && error.message === "User canceled file selection") return;
      toast.error(`选择 favicon 失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const handleClearFavicon = async () => {
    try {
      await removeCachedFaviconFiles();
      setFavicon(undefined);
      toast.success("已清除自定义 favicon");
    } catch (error) {
      toast.error(`清除 favicon 失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  /* ── 发布动作：测试连接 / 发布（云家增量推送）或本地导出 ── */
  const [isPublishing, setIsPublishing] = useState(false);

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

  const handleCheckConnection = async () => {
    if (isLocalProvider) {
      toast.info("本地导出无需连接测试");
      return;
    }
    try {
      const connected = await checkPublishConnection({
        providerType: active,
        providerConfig,
      });
      if (connected) toast.success("连接成功");
      else toast.error("连接失败，请检查配置");
    } catch (error) {
      toast.error(`连接测试失败: ${error}`);
    }
  };

  const handleLocalPublish = async () => {
    try {
      const paths = await selectFile({
        properties: ["openDirectory", "createDirectory"],
      });
      if (!paths || paths.length === 0) return;
      const targetDir = paths[0];
      setIsPublishing(true);
      try {
        await downloadPublishTemplate();
        await exportPublishOutput({
          targetDir,
          providerType: EPublishProvider.Local,
          providerConfig: { basePath: publish.local.basePath },
          siteConfig: publish.site,
          settings: { appearance },
        });
        toast.success(`已导出到 ${targetDir}`);
      } catch (error) {
        toast.error(`导出失败: ${error}`);
      } finally {
        setIsPublishing(false);
      }
    } catch (error) {
      if (error instanceof Error && error.message === "User canceled file selection") return;
      toast.error(`选择目录失败: ${error}`);
    }
  };

  const handlePublish = async () => {
    if (isLocalProvider) {
      await handleLocalPublish();
      return;
    }
    setIsPublishing(true);
    try {
      await downloadPublishTemplate();
      const result = await executePublish({
        providerType: active,
        providerConfig,
        siteConfig: publish.site,
        settings: { appearance },
      });
      if (result.success) {
        toast.success("发布成功！");
      } else {
        toast.warning(`发布完成，但有 ${result.failed.length} 个文件失败`);
      }
    } catch (error) {
      toast.error(`发布失败: ${error}`);
    } finally {
      setIsPublishing(false);
    }
  };

  const openIntegration = () => useSettingsStore.getState().openSettings("integration");

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

  const inputField = (
    field: PublishFieldKey,
    label: string,
    placeholder?: string,
    spanFull = false
  ) => (
    <label key={field} className={clsx("flex min-w-0 flex-col gap-1.5", spanFull && "col-span-2")}>
      <span className="text-tau-meta text-ink-2 font-medium">{label}</span>
      <Input
        value={(publish[active] as Record<PublishFieldKey, string>)[field] ?? ""}
        placeholder={placeholder}
        onChange={e => updatePublishField(field, e.target.value)}
      />
    </label>
  );

  const selectGitWorkingDir = async () => {
    try {
      const paths = await selectFile({ properties: ["openDirectory", "createDirectory"] });
      if (paths && paths.length > 0) {
        updatePublishField("gitWorkingDir", paths[0]);
      }
    } catch (error) {
      if (error instanceof Error && error.message === "User canceled file selection") return;
      toast.error(`选择 Git 目录失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  return (
    <section>
      <h3 className="text-tau-body-lg font-semibold">发布</h3>
      <div className="text-tau-tiny text-ink-3 mt-0.5">将选中的内容生成静态站点并发布</div>

      <SectionTitle title={`发布目标 · ${PROVIDER_LABELS[active]}`} />
      <SettingRow title="提供商" description="GitHub Pages / S3 静态托管 / 本地导出">
        <Select
          aria-label="发布提供商"
          className="w-[168px]"
          value={active}
          options={(Object.keys(PROVIDER_LABELS) as EPublishProvider[]).map(key => ({
            value: key,
            label: PROVIDER_LABELS[key],
          }))}
          onValueChange={v =>
            useSettingStore.setState(s => ({
              setting: produce(s.setting, draft => {
                draft.publish.active = v as EPublishProvider;
              }),
            }))
          }
        />
      </SettingRow>

      {active === EPublishProvider.Github && (
        <>
          <div className="grid grid-cols-2 gap-x-3 pt-3">
            <label className="flex min-w-0 flex-col gap-1.5">
              <span className="text-tau-meta text-ink-2 font-medium">仓库</span>
              <Select
                aria-label="发布仓库"
                className="w-full"
                value={publish.github.repo}
                placeholder={
                  githubTokenReady ? (reposLoading ? "加载中…" : "选择仓库") : "需先配置 Token"
                }
                disabled={!githubTokenReady}
                options={repoOptions}
                onValueChange={v => void handleSelectRepo(v)}
              />
            </label>
            <label className="flex min-w-0 flex-col gap-1.5">
              <span className="text-tau-meta text-ink-2 font-medium">部署分支</span>
              <Select
                aria-label="部署分支"
                className="w-full"
                value={publish.github.branch}
                placeholder={publish.github.repo ? "选择分支" : "先选择仓库"}
                disabled={!githubTokenReady || !publish.github.repo}
                options={branchOptions}
                onValueChange={v => updatePublishField("branch", v)}
              />
            </label>
            <label className="flex min-w-0 flex-col gap-1.5">
              <span className="text-tau-meta text-ink-2 font-medium">访问路径（自动推导）</span>
              <Input value={publish.github.basePath} readOnly className="font-tau-mono" />
            </label>
            <div className="flex min-w-0 flex-col gap-1.5">
              <span className="text-tau-meta text-ink-2 font-medium">发布方式</span>
              <div className="flex h-8 items-center gap-2.5">
                <Switch checked={publish.github.useGitCli} onCheckedChange={setUseGitCli} />
                <span className="text-tau-tiny text-ink-2">Git Push（快，避开限速）</span>
              </div>
            </div>
            <div className="col-span-2 flex min-w-0 flex-col gap-1.5">
              <span className="text-tau-meta text-ink-2 font-medium">
                Git 工作目录（可选，缓存克隆加速）
              </span>
              <div className="flex items-center gap-2">
                <Input
                  className="font-tau-mono min-w-0 flex-1"
                  value={publish.github.gitWorkingDir}
                  placeholder="留空则自动使用应用缓存目录"
                  disabled={!publish.github.useGitCli}
                  onChange={e => updatePublishField("gitWorkingDir", e.target.value)}
                />
                <Button
                  variant="secondary"
                  size="sm"
                  icon={FolderOpen}
                  disabled={!publish.github.useGitCli}
                  onClick={() => void selectGitWorkingDir()}
                >
                  选择
                </Button>
                {publish.github.gitWorkingDir && (
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={!publish.github.useGitCli}
                    onClick={() => updatePublishField("gitWorkingDir", "")}
                  >
                    清空
                  </Button>
                )}
              </div>
            </div>
          </div>
          <SettingRow title="测试连接" description="验证 Token、仓库与分支可访问">
            <Button
              variant="secondary"
              size="sm"
              icon={Zap}
              onClick={() => void handleCheckConnection()}
            >
              测试
            </Button>
          </SettingRow>
          <div
            className={clsx(
              "text-tau-tiny flex items-center gap-2 px-0.5 pt-2.5",
              githubTokenReady ? "text-ink-3" : "text-warn"
            )}
          >
            <Zap size={13} strokeWidth={1.75} className="flex-none" />
            {githubTokenReady ? (
              <>
                Token 在
                <button
                  type="button"
                  className="text-accent-text font-medium hover:underline"
                  onClick={openIntegration}
                >
                  集成 · GitHub
                </button>
                中配置；发布地址自动推导为 username.github.io/仓库名/。
              </>
            ) : (
              <>
                尚未配置 GitHub Token——在
                <button
                  type="button"
                  className="font-semibold hover:underline"
                  onClick={openIntegration}
                >
                  集成 · GitHub
                </button>
                完成后，仓库与分支列表自动可用。
              </>
            )}
          </div>
        </>
      )}

      {active === EPublishProvider.S3 && (
        <>
          <div className="grid grid-cols-2 gap-x-3 pt-3">
            {inputField("bucket", "Bucket", "my-blog-bucket")}
            {inputField("region", "Region", "us-east-1")}
            {inputField("path", "路径前缀", "blog/（可选）")}
            {inputField("basePath", "访问路径", "/")}
          </div>
          <SettingRow title="测试连接" description="验证凭据与 Bucket 可访问">
            <Button
              variant="secondary"
              size="sm"
              icon={Zap}
              onClick={() => void handleCheckConnection()}
            >
              测试
            </Button>
          </SettingRow>
          <div className="text-tau-tiny text-ink-3 flex items-center gap-2 px-0.5 pt-2.5">
            <Zap size={13} strokeWidth={1.75} className="flex-none" />
            AccessKey / Secret（含 endpoint / URL 风格）在
            <button
              type="button"
              className="text-accent-text font-medium hover:underline"
              onClick={openIntegration}
            >
              集成 · S3
            </button>
            中配置。
          </div>
        </>
      )}

      {active === EPublishProvider.Local && (
        <>
          <div className="grid grid-cols-2 gap-x-3 pt-3">
            {inputField("basePath", "访问路径", "/ 或 /docs/", true)}
          </div>
          <div className="text-tau-tiny text-ink-3 flex items-center gap-2 px-0.5 pt-2.5">
            <Zap size={13} strokeWidth={1.75} className="flex-none" />
            本地导出无需凭据：发布时选择输出文件夹，生成完整静态站点自行部署。
          </div>
        </>
      )}

      <SectionTitle title="站点配置" />
      <div className="grid grid-cols-2 gap-x-3 pt-3">
        <label className="flex min-w-0 flex-col gap-1.5">
          <span className="text-tau-meta text-ink-2 font-medium">站点标题</span>
          <Input
            value={publish.site.title}
            placeholder="我的博客"
            onChange={e => updateSiteField("title", e.target.value)}
          />
        </label>
        <label className="flex min-w-0 flex-col gap-1.5">
          <span className="text-tau-meta text-ink-2 font-medium">公开 URL（RSS 用）</span>
          <Input
            value={publish.site.publicUrl}
            placeholder="https://example.com"
            onChange={e => updateSiteField("publicUrl", e.target.value)}
          />
        </label>
        <label className="col-span-2 flex min-w-0 flex-col gap-1.5">
          <span className="text-tau-meta text-ink-2 font-medium">站点描述</span>
          <Input
            value={publish.site.description}
            placeholder="记录学习与思考"
            onChange={e => updateSiteField("description", e.target.value)}
          />
        </label>
      </div>
      <SettingRow title="站点 Favicon" description="SVG / PNG / ICO，选择后缓存本地自动复用">
        <span className="border-line-1 bg-group text-ink-3 grid size-[34px] shrink-0 place-items-center overflow-hidden rounded-[9px]">
          {publish.site.favicon ? (
            <LocalImage
              url={publish.site.favicon.cachePath}
              alt={publish.site.favicon.fileName}
              className="h-full w-full object-contain"
            />
          ) : (
            <Zap size={16} strokeWidth={1.75} />
          )}
        </span>
        <Button variant="secondary" size="sm" onClick={() => void handleSelectFavicon()}>
          {publish.site.favicon ? "重新选择" : "选择文件"}
        </Button>
        {publish.site.favicon && (
          <Button variant="secondary" size="sm" onClick={() => void handleClearFavicon()}>
            清除
          </Button>
        )}
      </SettingRow>

      <SectionTitle title="发布内容" />
      <div className="-mx-1">
        <PublishSelector />
      </div>

      <SectionTitle title="发布操作" />
      <SettingRow
        title={isLocalProvider ? "导出静态站点" : "开始发布"}
        description={
          isLocalProvider
            ? "生成静态文件至本地文件夹，便于自行部署"
            : "按内容哈希增量推送，只上传变更文件"
        }
      >
        <Button
          variant="primary"
          size="sm"
          icon={UploadCloud}
          loading={isPublishing}
          loadingText={isLocalProvider ? "导出中" : "发布中"}
          onClick={() => void handlePublish()}
        >
          {isLocalProvider ? "导出" : "发布"}
        </Button>
      </SettingRow>
    </section>
  );
}
