/** GitHub 星标数：浏览器直连公开 API（未认证每小时 60 次），本地缓存一小时 */
import { GITHUB_REPO } from "./site.ts";

const CACHE_KEY = "tau-site-gh-stars";
const CACHE_TTL = 60 * 60 * 1000;
/** 星标少于这个数时不展示数字，只留 GitHub 入口 */
export const MIN_VISIBLE_STARS = 100;

interface CachedStars {
  count: number;
  at: number;
}

function readCache(): number | null {
  try {
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY) ?? "null") as CachedStars | null;
    return cached && Date.now() - cached.at < CACHE_TTL ? cached.count : null;
  } catch {
    return null;
  }
}

function writeCache(count: number) {
  try {
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ count, at: Date.now() } satisfies CachedStars)
    );
  } catch {
    // 隐私模式下无法缓存，下次打开再请求
  }
}

let pending: Promise<number | null> | null = null;

/** 读取失败（限流、断网）时返回 null，调用方只显示 GitHub 入口 */
export function loadGithubStars(): Promise<number | null> {
  return (pending ??= (async () => {
    const cached = readCache();
    if (cached !== null) return cached;
    try {
      const response = await fetch(`https://api.github.com/repos/${GITHUB_REPO}`, {
        headers: { Accept: "application/vnd.github+json" },
      });
      if (!response.ok) return null;
      const { stargazers_count } = (await response.json()) as { stargazers_count?: unknown };
      if (typeof stargazers_count !== "number") return null;
      writeCache(stargazers_count);
      return stargazers_count;
    } catch {
      return null;
    }
  })());
}

/** 达到展示门槛才返回文案：1234 → 1.2k */
export function formatStars(count: number | null): string | null {
  if (count === null || count < MIN_VISIBLE_STARS) return null;
  if (count < 1000) return String(count);
  const thousands = count / 1000;
  return `${thousands >= 10 ? Math.round(thousands) : Number(thousands.toFixed(1))}k`;
}
