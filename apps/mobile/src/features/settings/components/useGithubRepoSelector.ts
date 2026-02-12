import { useEffect, useState } from "react";
import { useMemoizedFn } from "ahooks";
import { mapErrorToMessage, parseInvokeError } from "../../../services/errors";
import * as tauri from "../../../services/tauri";

type UseGithubRepoSelectorParams = {
  token: string;
  owner: string;
  repo: string;
  branch: string;
};

function resolveErrorMessage(error: unknown, fallback: string) {
  const parsed = parseInvokeError(error);
  const baseMessage = mapErrorToMessage(
    parsed.code,
    parsed.message || fallback,
  );
  const detailMessage =
    parsed.message && parsed.message !== parsed.code ? parsed.message : "";
  if (detailMessage && detailMessage !== baseMessage) {
    return `${baseMessage}（${detailMessage}）`;
  }
  return baseMessage;
}

export function useGithubRepoSelector(params: UseGithubRepoSelectorParams) {
  const [repos, setRepos] = useState<string[]>([]);
  const [branches, setBranches] = useState<string[]>([]);
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [error, setError] = useState("");

  const token = params.token.trim();
  const owner = params.owner.trim();
  const canLoad = Boolean(token && owner);

  const loadRepos = useMemoizedFn(async (showLoading = true) => {
    if (!canLoad) {
      setError("请先在集成账号中连接 Github");
      setRepos([]);
      return [];
    }
    if (showLoading) {
      setLoadingRepos(true);
    }
    setError("");
    try {
      const repoList = await tauri.listGithubRepos(token, owner);
      setRepos(repoList);
      return repoList;
    } catch (error) {
      setError(resolveErrorMessage(error, "获取 Github 仓库列表失败"));
      return [];
    } finally {
      setLoadingRepos(false);
    }
  });

  const loadBranches = useMemoizedFn(
    async (repoName: string, showLoading = true) => {
      const repo = repoName.trim();
      if (!canLoad || !repo) {
        setBranches([]);
        if (!canLoad) {
          setError("请先在集成账号中连接 Github");
        }
        return [];
      }
      if (showLoading) {
        setLoadingBranches(true);
      }
      setError("");
      try {
        const branchList = await tauri.listGithubBranches(token, owner, repo);
        setBranches(branchList);
        return branchList;
      } catch (error) {
        setError(resolveErrorMessage(error, "获取 Github 分支列表失败"));
        return [];
      } finally {
        setLoadingBranches(false);
      }
    },
  );

  useEffect(() => {
    setRepos([]);
    setBranches([]);
    setError("");
  }, [owner, token]);

  useEffect(() => {
    if (!params.repo || repos.length > 0 || !canLoad) {
      return;
    }
    void loadRepos(false);
  }, [canLoad, loadRepos, params.repo, repos.length]);

  useEffect(() => {
    if (!params.repo || !params.branch || branches.length > 0 || !canLoad) {
      return;
    }
    void loadBranches(params.repo, false);
  }, [branches.length, canLoad, loadBranches, params.branch, params.repo]);

  return {
    repos,
    branches,
    error,
    canLoad,
    loadingRepos,
    loadingBranches,
    loadRepos,
    loadBranches,
  };
}
