import { useMemo } from "react";
import useSettingStore from "@/stores/useSettingStore";
import { EGithubCDN, GITHUB_CDN_NONE_VALUE } from "@/constants/github";

export const getGithubCdnUrl = (
  url?: string,
  cdn?: EGithubCDN | null | string,
): string | undefined => {
  if (!url || !cdn || cdn === GITHUB_CDN_NONE_VALUE) return url;

  const trimmed = url.trim();
  const githubRawRegex =
    /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/raw\/([^/]+)\/(.+)$/i;
  const githubusercontentRegex =
    /^https:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/([^/]+)\/(.+)$/i;

  const matches =
    trimmed.match(githubRawRegex) || trimmed.match(githubusercontentRegex);

  if (!matches) {
    return trimmed;
  }

  const [, owner, repo, branch, filePath] = matches;

  if (cdn === EGithubCDN.JsDelivr) {
    return `https://cdn.jsdelivr.net/gh/${owner}/${repo}@${branch}/${filePath}`;
  }

  if (cdn === EGithubCDN.Statically) {
    return `https://cdn.statically.io/gh/${owner}/${repo}/@${branch}/${filePath}`;
  }

  return trimmed;
};

const useGithubCdnUrl = (url?: string) => {
  const cdn = useSettingStore((state) => state.setting.imageBed.github.cdn);

  return useMemo(() => getGithubCdnUrl(url, cdn), [url, cdn]);
};

export default useGithubCdnUrl;
