import { useEffect, useState } from "react";
import { produce } from "immer";
import { useMemoizedFn } from "ahooks";
import useSettingStore from "@/stores/useSettingStore";
import { getReposByOwner, getBranchesByRepo } from "@/utils";
import { EGithubCDN, GithubCDNOptions } from "@/constants/github";
import { SettingInput, SettingDropdown, SettingButton } from "../../components";

const GithubSetting = () => {
  const { github, githubIntegration } = useSettingStore((state) => ({
    github: state.setting.imageBed.github,
    githubIntegration: state.setting.integration.github,
  }));

  const { repo, branch, cdn, pathPrefix } = github;
  const { token, user } = githubIntegration;

  const [repos, setRepos] = useState<string[]>([]);
  const [branches, setBranches] = useState<string[]>([]);
  const [checkTokenLoading, setCheckTokenLoading] = useState(false);
  const [error, setError] = useState<string>("");

  const handleSelectRepo = useMemoizedFn(async (value: string) => {
    useSettingStore.setState(
      produce((state) => {
        state.setting.imageBed.github.repo = value;
      }),
    );
    const branches = await getBranchesByRepo(token, user.name, repo);
    if (branches) {
      setBranches(branches.map((i: any) => i.name));
    } else {
      setError("获取分支列表失败");
    }
  });

  const onLoadRepos = useMemoizedFn(async (showLoading = true) => {
    if (!token) {
      setError("请先在集成设置中配置 Github Token");
      return;
    }
    if (showLoading) {
      setCheckTokenLoading(true);
    }
    setError("");
    const repos = await getReposByOwner(token, user.name);
    if (repos) {
      setRepos(repos.map((i: any) => i.name));
    } else {
      setError("获取仓库列表失败");
    }
    setCheckTokenLoading(false);
  });

  const handleSelectBranch = useMemoizedFn(async (value: string) => {
    useSettingStore.setState(
      produce((state) => {
        state.setting.imageBed.github.branch = value;
      }),
    );
  });

  const handleSelectCDN = useMemoizedFn(async (value: string) => {
    useSettingStore.setState(
      produce((state) => {
        state.setting.imageBed.github.cdn = value as EGithubCDN;
      }),
    );
  });

  useEffect(() => {
    if (!!repo && repos.length === 0 && token) {
      onLoadRepos(false).then();
    }
  }, [onLoadRepos, repo, repos, token]);

  useEffect(() => {
    if (!!branch && branches.length === 0 && token && !!repo) {
      handleSelectRepo(repo).then();
    }
  }, [branch, branches, handleSelectRepo, repo, token]);

  if (!token) {
    return (
      <div className="p-4 rounded-xl bg-yellow-50 dark:bg-yellow-500/10 border border-yellow-200 dark:border-yellow-500/20">
        <div className="flex items-center gap-2 text-yellow-700 dark:text-yellow-400">
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
          <span className="text-sm font-medium">
            请先在【集成设置】中配置 Github Token
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 仓库设置 */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
          仓库设置
        </h3>

        <SettingButton
          variant="secondary"
          loading={checkTokenLoading}
          onClick={() => onLoadRepos()}
          icon={
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
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
          <div className="p-3 rounded-lg text-sm bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-600 dark:text-red-400">
            {error}
          </div>
        )}

        {(repos.length > 0 || !!repo) && (
          <SettingDropdown
            label="仓库"
            value={repo}
            onChange={handleSelectRepo}
            options={repos.map((r) => ({ label: r, value: r }))}
          />
        )}

        {(branches.length > 0 || !!branch) && (
          <SettingDropdown
            label="分支"
            value={branch}
            onChange={handleSelectBranch}
            options={branches.map((b) => ({ label: b, value: b }))}
          />
        )}

        <SettingInput
          label="路径前缀"
          placeholder="留空表示根目录，如：images/"
          value={pathPrefix}
          onChange={(e) => {
            useSettingStore.setState(
              produce((state) => {
                state.setting.imageBed.github.pathPrefix = e.target.value;
              }),
            );
          }}
        />
      </div>

      {/* CDN 设置 */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
          CDN 设置
        </h3>
        <SettingDropdown
          value={cdn || ""}
          onChange={handleSelectCDN}
          options={GithubCDNOptions}
        />
      </div>
    </div>
  );
};

export default GithubSetting;
