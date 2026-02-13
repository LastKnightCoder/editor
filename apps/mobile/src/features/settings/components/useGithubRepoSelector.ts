import { useEffect, useRef, useState } from "react";
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
  const repoRequestSeqRef = useRef(0);
  const branchRequestSeqRef = useRef(0);

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
    const requestSeq = ++repoRequestSeqRef.current;
    try {
      const repoList = await tauri.listGithubRepos(token, owner);
      if (requestSeq !== repoRequestSeqRef.current) {
        return [];
      }
      setRepos(repoList);
      return repoList;
    } catch (error) {
      if (requestSeq === repoRequestSeqRef.current) {
        setError(resolveErrorMessage(error, "获取 Github 仓库列表失败"));
      }
      return [];
    } finally {
      if (requestSeq === repoRequestSeqRef.current) {
        setLoadingRepos(false);
      }
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
      const requestSeq = ++branchRequestSeqRef.current;
      try {
        const branchList = await tauri.listGithubBranches(token, owner, repo);
        if (requestSeq !== branchRequestSeqRef.current) {
          return [];
        }
        setBranches(branchList);
        return branchList;
      } catch (error) {
        if (requestSeq === branchRequestSeqRef.current) {
          setError(resolveErrorMessage(error, "获取 Github 分支列表失败"));
        }
        return [];
      } finally {
        if (requestSeq === branchRequestSeqRef.current) {
          setLoadingBranches(false);
        }
      }
    },
  );

  useEffect(() => {
    repoRequestSeqRef.current += 1;
    branchRequestSeqRef.current += 1;
    setRepos([]);
    setBranches([]);
    if (!canLoad) {
      setLoadingRepos(false);
      setLoadingBranches(false);
      setError("请先在集成账号中连接 Github");
      return;
    }
    setError("");
    void loadRepos(false);
  }, [canLoad, loadRepos, owner, token]);

  useEffect(() => {
    branchRequestSeqRef.current += 1;
    setBranches([]);
    if (!canLoad) {
      return;
    }
    const repo = params.repo.trim();
    if (!repo) {
      return;
    }
    void loadBranches(params.repo, false);
  }, [canLoad, loadBranches, owner, params.repo, token]);

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
