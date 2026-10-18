/** 首页导航与页脚的入口标记：构建时替换 index.html 里的占位，数据见 src/lib/site.ts */
import { GITHUB_MARK_PATH, GITHUB_URL, SITE_LINKS } from "../src/lib/site.ts";

const externalAttrs = ' target="_blank" rel="noopener"';

export function renderNavLinks(): string {
  return SITE_LINKS.map(
    link => `<a href="${link.href}"${link.external ? externalAttrs : ""}>${link.label}</a>`
  ).join("");
}

/** 星标数由 src/modules/githubStars.ts 在访客浏览器里补上，达到门槛才显示 */
export function renderGithubLink(): string {
  return `<a class="gh-link" href="${GITHUB_URL}"${externalAttrs} aria-label="在 GitHub 上查看源码" data-github-stars>
          <svg class="gh-mark" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="${GITHUB_MARK_PATH}"/></svg><span class="gh-label">GitHub</span><span class="gh-count" hidden><svg class="i"><use href="#i-star"/></svg><b></b></span>
        </a>`;
}

export function renderSiteNav(html: string): string {
  return html
    .replaceAll("<!--tau:nav-links-->", renderNavLinks())
    .replaceAll("<!--tau:github-link-->", renderGithubLink())
    .replaceAll("<!--tau:github-url-->", GITHUB_URL);
}
