/** 页面通用行为：固定尺寸画面等比缩放、吸顶导航、滚动揭示、按系统与芯片推荐下载按钮 */
import { mustQuery } from "../lib/dom.ts";
import { detectMacArch, detectOs } from "../lib/platform.ts";

/** .fit-outer[data-w][data-h] 里的画面按设计尺寸绘制，再按容器宽度整体缩放 */
function initFitBoxes() {
  const fit = () =>
    document.querySelectorAll<HTMLElement>(".fit-outer").forEach(outer => {
      const width = Number(outer.dataset.w);
      const height = Number(outer.dataset.h);
      const scale = Math.min(1, outer.clientWidth / width);
      (outer.firstElementChild as HTMLElement).style.transform = `scale(${scale})`;
      outer.style.height = `${height * scale}px`;
    });
  addEventListener("resize", fit);
  fit();
}

function initTopbar() {
  const topbar = mustQuery(".topbar");
  const hero = mustQuery(".hero");
  const update = () => topbar.classList.toggle("show", hero.getBoundingClientRect().bottom < 80);
  addEventListener("scroll", update, { passive: true });
  update();
}

function initReveal() {
  const observer = new IntersectionObserver(
    entries =>
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("in");
        observer.unobserve(entry.target);
      }),
    { threshold: 0.12 }
  );
  document.querySelectorAll(".reveal").forEach(el => observer.observe(el));
}

const ARCH_HINT =
  "不确定是哪种芯片？点屏幕左上角的苹果菜单 › 关于本机，看「芯片」一栏：写着 Apple M 系列就选 Apple 芯片，写着 Intel 就选 Intel。";

/**
 * 构建时按固定顺序出按钮（Apple 芯片优先）；打开页面后把访客系统与芯片对应的安装包换成主按钮。
 * Mac 访客判断不出芯片时保持 Apple 芯片为主按钮，并在按钮下方说明怎么查看。
 */
async function preferVisitorDownload() {
  const os = detectOs();
  if (!os) return;
  // 只有 Mac 区分芯片；Windows 与 Android 各只有一个安装包
  const arch = os === "mac" ? await detectMacArch() : null;
  document.querySelectorAll<HTMLElement>(".ctas").forEach(group => {
    const candidates = [...group.querySelectorAll<HTMLAnchorElement>(`a.btn[data-os="${os}"]`)];
    const preferred = arch ? candidates.find(btn => btn.dataset.arch === arch) : candidates[0];
    if (!preferred) return;
    group.querySelectorAll("a.btn[data-os]").forEach(btn => {
      btn.classList.toggle("primary", btn === preferred);
      btn.classList.toggle("ghost", btn !== preferred);
    });
    group.prepend(preferred);
    if (os === "mac" && !arch && candidates.length > 1) {
      const hint = document.createElement("p");
      hint.className = "arch-hint";
      hint.textContent = ARCH_HINT;
      group.after(hint);
    }
  });
}

export function initLayout() {
  initFitBoxes();
  initTopbar();
  initReveal();
  void preferVisitorDownload();
}
