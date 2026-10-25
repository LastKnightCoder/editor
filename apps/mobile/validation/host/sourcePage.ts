/** 触屏源码块的验证操作：经正文点选与配件栏「编辑」进入源码页，写入输入框，返回即完成。 */
const pause = (ms = 100) => new Promise(resolve => setTimeout(resolve, ms));
const visible = (element: HTMLElement) =>
  element.getClientRects().length > 0 &&
  !element.closest('[inert],[aria-hidden="true"],[data-page-active="false"]');

async function waitFor<T>(read: () => T | null | undefined | false, label: string, attempts = 300) {
  for (let index = 0; index < attempts; index++) {
    const value = read();
    if (value) return value;
    await pause();
  }
  throw new Error(`${label}超时：${document.body.innerText.slice(-1200)}`);
}

export const sourcePageInput = () =>
  document.querySelector<HTMLTextAreaElement>("[data-source-editor-page] textarea");

const sourcePageButton = (label: string) =>
  document.querySelector<HTMLButtonElement>(
    `[data-source-editor-page] button[aria-label="${label}"]`
  );

const toolbarButton = (label: string) =>
  document.querySelector<HTMLButtonElement>(
    `[data-mobile-editor-toolbar="true"] button[aria-label="${label}"]`
  );

/** 当前页面里第 index 个触屏源码块的预览区；点按即选中该块 */
const sourceBlockPreview = (index: number) =>
  [
    ...document.querySelectorAll<HTMLElement>(
      '[data-source-presentation="touch"] [data-source-preview-slot]'
    ),
  ].filter(visible)[index];

/** 以原生输入的方式整段替换源码页内容 */
export function writeSource(input: HTMLTextAreaElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

/** 源码页已打开（如插入后自动打开）时直接返回输入框，否则点选块再点配件栏「编辑」 */
export async function openSourcePage(index = 0): Promise<HTMLTextAreaElement> {
  const opened = sourcePageInput();
  if (opened) return opened;
  (await waitFor(() => sourceBlockPreview(index), "源码块预览")).click();
  (await waitFor(() => toolbarButton("编辑"), "配件栏编辑")).click();
  return waitFor(sourcePageInput, "源码页输入框");
}

export async function clickSourcePage(label: "返回" | "撤销" | "重做") {
  (await waitFor(() => sourcePageButton(label), `源码页${label}`)).click();
  if (label === "返回") await waitFor(() => !sourcePageInput(), "源码页关闭");
}
