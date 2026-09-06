import { useEffect, useState } from "react";
import { produce } from "immer";
import { useMemoizedFn } from "ahooks";
import useSettingStore from "@/stores/useSettingStore";
import { getReposByOwner, getBranchesByRepo } from "@/utils";
import { selectFile } from "@/commands";
import { SettingInput, SettingDropdown, SettingButton, SettingSwitch } from "../components";

const GithubPublishSetting = () => {
  const { setting, integration } = useSettingStore(state => ({
    setting: state.setting.publish.github,
    integration: state.setting.integration.github,
  }));

  const {
    repo = "",
    branch = "gh-pages",
    basePath = "/",
    useGitCli = true,
    gitWorkingDir = "",
  } = setting;
  const { token = "", user } = integration;

  const [repos, setRepos] = useState<Array<{ label: string; value: string }>>([]);
  const [branches, setBranches] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");

  const onLoadRepos = useMemoizedFn(async (showLoading = true) => {
    if (!token) {
      setError("请先在集成设置中配置 Github Token");
      return;
    }
    if (showLoading) {
      setLoading(true);
    }
    setError("");
    const reposList = await getReposByOwner(token, user.name);
    if (reposList) {
      setRepos(
        reposList.map((r: { name: string }) => ({
          label: r.name,
          value: `${user.name}/${r.name}`,
        }))
      );
    } else {
      setError("获取仓库列表失败");
    }
    setLoading(false);
  });

  const computeBasePath = (canonicalRepo: string) => {
    if (!canonicalRepo) return "/";
    const [ownerPart, namePart] = canonicalRepo.split("/");
    if (!namePart) return "/";
    const ownerLower = (ownerPart || user.name).toLowerCase();
    const nameLower = namePart.toLowerCase();
    if (nameLower === `${ownerLower}.github.io`) {
      return "/";
    }
    return `/${namePart}/`;
  };

  const handleSelectRepo = useMemoizedFn(async (value: string) => {
    const canonicalRepo = value.includes("/") ? value : `${user.name}/${value}`;
    useSettingStore.setState(
      produce(state => {
        state.setting.publish.github.repo = canonicalRepo;
        state.setting.publish.github.basePath = computeBasePath(canonicalRepo);
      })
    );
    const repoName = canonicalRepo.split("/").pop()!;
    const owner = canonicalRepo.split("/")[0] || user.name;
    const branchesList = await getBranchesByRepo(token, owner, repoName);
    if (branchesList) {
      setBranches(branchesList.map((i: { name: string }) => i.name));
    } else {
      setError("获取分支列表失败");
    }
  });

  const handleSelectBranch = useMemoizedFn(async (value: string) => {
    useSettingStore.setState(
      produce(state => {
        state.setting.publish.github.branch = value;
      })
    );
  });

  const handleToggleGitCli = useMemoizedFn((checked: boolean) => {
    useSettingStore.setState(
      produce(state => {
        state.setting.publish.github.useGitCli = checked;
      })
    );
  });

  const handleWorkingDirChange = useMemoizedFn((path: string) => {
    const normalized = path.trim();
    useSettingStore.setState(
      produce(state => {
        state.setting.publish.github.gitWorkingDir = normalized;
      })
    );
  });

  const handleSelectWorkingDir = useMemoizedFn(async () => {
    try {
      const paths = await selectFile({
        properties: ["openDirectory", "createDirectory"],
      });
      if (!paths || paths.length === 0) {
        return;
      }
      handleWorkingDirChange(paths[0]);
    } catch (err) {
      if (err instanceof Error && err.message === "User canceled file selection") {
        return;
      }
      setError(`选择 Git 目录失败：${err instanceof Error ? err.message : String(err)}`);
    }
  });

  const handleClearWorkingDir = useMemoizedFn(() => {
    handleWorkingDirChange("");
  });

  useEffect(() => {
    if (!!repo && repos.length === 0 && token) {
      onLoadRepos(false);
    }
  }, [onLoadRepos, repo, repos, token]);

  useEffect(() => {
    if (!!branch && branches.length === 0 && token && !!repo) {
      handleSelectRepo(repo.includes("/") ? repo : `${user.name}/${repo}`);
    }
  }, [branch, branches, handleSelectRepo, repo, token, user.name]);

  useEffect(() => {
    if (!repo) return;
    const canonicalRepo = repo.includes("/") ? repo : `${user.name}/${repo}`;
    const computed = computeBasePath(canonicalRepo);
    if (basePath !== computed) {
      useSettingStore.setState(
        produce(state => {
          state.setting.publish.github.basePath = computed;
        })
      );
    }
  }, [repo, basePath, user.name]);

  useEffect(() => {
    if (!repo || repo.includes("/")) {
      return;
    }
    handleSelectRepo(`${user.name}/${repo}`);
  }, [repo, user.name, handleSelectRepo]);

  if (!token) {
    return (
      <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-4 dark:border-yellow-500/20 dark:bg-yellow-500/10">
        <div className="flex items-center gap-2 text-yellow-700 dark:text-yellow-400">
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
          <span className="text-sm font-medium">请先在【集成设置】中配置 Github Token</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <SettingButton
        variant="secondary"
        loading={loading}
        onClick={() => onLoadRepos()}
        icon={
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
        }
      >
        加载仓库列表
      </SettingButton>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">
          {error}
        </div>
      )}

      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs leading-relaxed text-slate-600 dark:border-slate-700 dark:bg-zinc-800/60 dark:text-slate-300">
        <p className="mb-1 font-semibold text-slate-800 dark:text-white">Git 环境准备</p>
        <p>GitHub 发布将调用本地 Git 命令，请确保系统已安装 Git 并可在命令行中执行。</p>
        <a
          href="https://git-scm.com/downloads"
          target="_blank"
          rel="noreferrer"
          className="mt-1 inline-block text-[var(--th-active-text)] hover:underline"
        >
          前往 Git 下载页面
        </a>
      </div>

      {(repos.length > 0 || !!repo) && (
        <SettingDropdown
          label="仓库"
          value={repo.includes("/") ? repo : `${user.name}/${repo}`}
          onChange={handleSelectRepo}
          options={repos}
        />
      )}
      {(repos.length > 0 || !!repo) && (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          仓库会自动补全为 “用户名/仓库”，无需手动输入用户名。
        </p>
      )}

      {(branches.length > 0 || !!branch) && (
        <SettingDropdown
          label="部署分支"
          value={branch}
          onChange={handleSelectBranch}
          options={branches.map(b => ({ label: b, value: b }))}
        />
      )}
      {(branches.length > 0 || !!branch) && (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          将静态文件推送到该分支，可直接选择现有分支或先在仓库中创建。
        </p>
      )}

      <SettingInput
        label="访问路径"
        placeholder="/"
        value={basePath}
        readOnly
        description="根据仓库自动推导。如需额外路径，请在仓库下配置 Pages 设置"
      />

      <SettingSwitch
        label="使用 Git Push 发布（推荐）"
        description="通过 git clone/push 批量上传，可显著提升发布速度并避开 API 速率限制"
        checked={useGitCli}
        onChange={handleToggleGitCli}
      />

      <div className={`space-y-3 ${useGitCli ? "" : "opacity-60"}`}>
        <SettingInput
          label="Git 工作目录（可选）"
          placeholder="留空则自动使用应用缓存目录"
          value={gitWorkingDir}
          onChange={e => handleWorkingDirChange(e.target.value)}
          disabled={!useGitCli}
          description="用于缓存克隆下来的仓库，会在该目录下按仓库创建子文件夹，加速后续发布并避免重复鉴权。"
        />
        <div className="flex gap-3">
          <SettingButton variant="secondary" onClick={handleSelectWorkingDir} disabled={!useGitCli}>
            选择文件夹
          </SettingButton>
          {gitWorkingDir && (
            <SettingButton
              variant="secondary"
              onClick={handleClearWorkingDir}
              disabled={!useGitCli}
            >
              清空
            </SettingButton>
          )}
        </div>
      </div>

      <div className="rounded-lg border border-blue-200 bg-[var(--th-accent-soft)] p-3 text-sm text-[var(--th-active-text)] dark:border-blue-500/20">
        <p className="mb-1 font-medium">提示</p>
        <p className="text-xs">
          发布后访问地址将自动推导：
          <br />• 如果仓库名为 <code>username.github.io</code>，访问{" "}
          <code>https://username.github.io/</code>
          <br />• 否则访问 <code>https://username.github.io/repo-name/</code>
        </p>
      </div>
    </div>
  );
};

export default GithubPublishSetting;
