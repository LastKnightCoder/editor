import type { BrowserWindow } from "electron";

/** 验收台主进程驱动：按可见标签操作真实界面，等待条件超时时附带页面文本便于定位。 */
export function createDriver(window: BrowserWindow, timeout = 20000) {
  const run = <T = unknown>(code: string): Promise<T> => window.webContents.executeJavaScript(code);
  async function wait(code: string, limit = timeout) {
    const deadline = Date.now() + limit;
    while (Date.now() < deadline) {
      if (await run(code)) return;
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    throw new Error("验证等待失败：" + code + "\n" + (await run("document.body.innerText")));
  }
  const find = (selector: string, label: string) =>
    `[...document.querySelectorAll(${JSON.stringify(selector)})].find(el => (el.getAttribute('aria-label') === ${JSON.stringify(label)} || el.textContent.trim() === ${JSON.stringify(label)}) && !el.disabled && el.getAttribute('aria-disabled') !== 'true' && el.getClientRects().length)`;
  /** 按钮、开关按 aria-label 或文本匹配。 */
  async function click(label: string) {
    const expression = find("button", label);
    await wait(`Boolean(${expression})`);
    await run(`${expression}.click()`);
  }
  /** 打开 ⋯ 菜单后选择菜单项。 */
  async function menu(trigger: string, item: string) {
    await click(trigger);
    const expression = find('[role^="menuitem"]', item);
    await wait(`Boolean(${expression})`);
    await run(`${expression}.click()`);
  }
  const text = (value: string) =>
    wait(`document.body.innerText.includes(${JSON.stringify(value)})`);
  return { run, wait, click, menu, text };
}
