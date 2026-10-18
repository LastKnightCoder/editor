/** 给导航里的 GitHub 入口补上星标数（不足门槛或读取失败时保持只有入口） */
import { formatStars, loadGithubStars } from "../lib/githubStars.ts";

export function initGithubStars() {
  const links = document.querySelectorAll<HTMLElement>("[data-github-stars]");
  if (!links.length) return;
  void loadGithubStars().then(count => {
    const text = formatStars(count);
    if (!text) return;
    links.forEach(link => {
      const slot = link.querySelector<HTMLElement>(".gh-count");
      const value = slot?.querySelector("b");
      if (!slot || !value) return;
      value.textContent = text;
      slot.hidden = false;
      link.setAttribute("aria-label", `在 GitHub 上查看源码，${count} 个星标`);
    });
  });
}
