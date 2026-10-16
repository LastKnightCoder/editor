import { fail } from "./platform";

export async function github<T>(token: string, path: string, fetcher = fetch): Promise<T> {
  let response: Response;
  try {
    response = await fetcher(`https://api.github.com${path}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "Tau-Plugin-Portal",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    return fail(503, "GITHUB_UNAVAILABLE", "GitHub 暂时不可用，请稍后重试");
  }
  if (response.status === 401) fail(401, "UNAUTHENTICATED", "GitHub 授权已失效，请重新登录");
  if (response.status === 404) fail(422, "REPOSITORY_NOT_ALLOWED", "找不到公开仓库或指定提交");
  if (!response.ok) fail(503, "GITHUB_UNAVAILABLE", "GitHub 暂时无法完成检查，请稍后重试");
  return response.json() as Promise<T>;
}
export async function verifyRepository(
  token: string,
  url: string,
  commit: string,
  fetcher = fetch
): Promise<string> {
  const match = /^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+)$/.exec(url);
  if (!match || !/^[a-f0-9]{40}$/i.test(commit))
    fail(400, "INVALID_INPUT", "请输入 GitHub 仓库地址和完整 commit SHA");
  const path = `/repos/${match[1]}/${match[2]}`;
  const repo = await github<{ id: number; private: boolean; permissions?: { admin?: boolean } }>(
    token,
    path,
    fetcher
  );
  if (repo.private || !repo.permissions?.admin)
    fail(403, "REPOSITORY_NOT_ALLOWED", "只能提交你有管理权限的公开仓库");
  await github(token, `${path}/commits/${commit}`, fetcher);
  return String(repo.id);
}
