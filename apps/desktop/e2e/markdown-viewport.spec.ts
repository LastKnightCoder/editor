import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { basename, join } from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { expect, test, type ElectronApplication, type Page } from "@playwright/test";
import {
  availablePort,
  createSandbox,
  disposeSandbox,
  invoke,
  launch,
} from "./content-production/harness";

const fixture = process.env.TAU_MARKDOWN_VIEWPORT_FIXTURE;
const richSelector =
  '[data-markdown-full-editor="ready"] [data-slate-editor="true"][data-slate-node="value"]';
const input = "TauFirstInput20261115";
const mod = process.platform === "darwin" ? "Meta" : "Control";

interface OpenSample {
  visible: number;
  writable: number;
  visibleDom: number;
  writableDom: number;
  tables: number;
  spacers: number;
  point: { x: number; y: number } | null;
}

function installMeasure() {
  const sample: OpenSample = {
    visible: 0,
    writable: 0,
    visibleDom: 0,
    writableDom: 0,
    tables: 0,
    spacers: 0,
    point: null,
  };
  Object.assign(window, { markdownOpenSample: sample });
  const frame = (now: number) => {
    const editor = document.querySelector<HTMLElement>('[data-slate-editor="true"]');
    const text =
      editor &&
      getComputedStyle(editor).visibility === "visible" &&
      [...editor.querySelectorAll<HTMLElement>('[data-slate-string="true"]')].find(el => {
        const rect = el.getBoundingClientRect();
        return (
          el.textContent?.trim() &&
          rect.width > 2 &&
          rect.left >= 0 &&
          rect.top >= 80 &&
          rect.bottom <= innerHeight
        );
      });
    if (editor && text && !sample.visible) {
      sample.visible = now;
      sample.visibleDom = editor.getElementsByTagName("*").length;
    }
    const first = text && text.firstChild;
    if (first && editor?.isContentEditable && !editor.closest("[inert]")) {
      const range = document.createRange();
      range.setStart(first, 0);
      range.setEnd(first, 1);
      const rect = range.getBoundingClientRect();
      sample.point = {
        x: rect.left + Math.min(1, rect.width / 3),
        y: (rect.top + rect.bottom) / 2,
      };
      sample.writable = now;
      sample.writableDom = editor.getElementsByTagName("*").length;
      sample.tables = editor.querySelectorAll("table").length;
      sample.spacers = editor.querySelectorAll('[data-markdown-viewport-block="spacer"]').length;
      return;
    }
    requestAnimationFrame(frame);
  };
  if (location.hash.startsWith("#/markdown-window")) requestAnimationFrame(frame);
}

async function sandbox(
  run: (app: ElectronApplication, launcher: Page, directory: string) => Promise<void>
) {
  const directory = await createSandbox("tau-markdown-viewport-");
  let running: ElectronApplication | undefined;
  try {
    const { app, page } = await launch(directory, await availablePort(), instance => {
      running = instance;
    });
    await app.context().addInitScript(installMeasure);
    await run(app, page, directory);
  } finally {
    await disposeSandbox(directory, running);
  }
}

async function open(app: ElectronApplication, launcher: Page, path: string) {
  const [window] = await Promise.all([
    app.waitForEvent("window"),
    invoke(launcher, "open-markdown-window", path),
  ]);
  return window;
}

async function firstInput(page: Page, marker = input) {
  const handle = await page.waitForFunction(
    () => {
      const result = (window as unknown as { markdownOpenSample?: OpenSample }).markdownOpenSample;
      return result?.writable && result.point ? result : false;
    },
    {},
    { polling: "raf", timeout: 45_000 }
  );
  const sample = (await handle.jsonValue()) as OpenSample;
  if (!sample.point) throw new Error("首屏未找到可写位置");
  await page.mouse.click(sample.point.x, sample.point.y);
  await page.keyboard.insertText(marker);
  await page.keyboard.press(`${mod}+s`);
  return sample;
}

async function fileContains(path: string, marker: string) {
  await expect
    .poll(async () => (await readFile(path, "utf8")).includes(marker), { timeout: 15_000 })
    .toBe(true);
}

async function closeWindow(app: ElectronApplication, page: Page) {
  await expect(page.locator('span[title="未保存"]')).toHaveCount(0);
  const native = await app.browserWindow(page);
  await Promise.all([page.waitForEvent("close"), native.evaluate(window => window.close())]);
}

async function visibleBlocks(page: Page) {
  return page.locator(richSelector).evaluate(editable => {
    const blocks = [...editable.querySelectorAll("[data-markdown-viewport-block]")];
    const visible = blocks.flatMap((block, index) => {
      const rect = block.getBoundingClientRect();
      return rect.bottom > 150 && rect.top < innerHeight - 70 ? [index] : [];
    });
    return {
      first: visible[0] ?? -1,
      gaps: visible.filter(
        index => blocks[index].getAttribute("data-markdown-viewport-block") === "spacer"
      ).length,
      mounted: blocks.filter(
        block => block.getAttribute("data-markdown-viewport-block") === "mounted"
      ).length,
    };
  });
}

const digest = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

test("历史样本源码模式的打开与输入压力", async () => {
  // 门控：依赖仓外历史参考文件（sha256 固定，不入库）；TAU_MARKDOWN_VIEWPORT_FIXTURE 指向该文件后执行
  //（docs/notes/2026-11-15-markdown-viewport-validation.md「复测命令」）。
  test.skip(!fixture, "设置 TAU_MARKDOWN_VIEWPORT_FIXTURE 指向历史参考文件");
  if (!fixture) return;
  test.setTimeout(120_000);
  const original = await readFile(fixture, "utf8");
  await sandbox(async (app, launcher, directory) => {
    const path = join(directory, "source-stress.md");
    await writeFile(path, original);
    const page = await open(app, launcher, path);
    await expect(page.locator(richSelector)).toBeVisible();
    await page.evaluate(modifier => {
      const metrics = { switchAt: 0, focusAt: 0, input: [] as number[] };
      Object.assign(window, { sourceStressMetrics: metrics });
      const begin = (event: KeyboardEvent) => {
        if (event.key !== "/" || !(modifier === "Meta" ? event.metaKey : event.ctrlKey)) return;
        metrics.switchAt = performance.now();
        window.removeEventListener("keydown", begin, true);
      };
      window.addEventListener("keydown", begin, true);
      const start = (event: FocusEvent) => {
        if (!(event.target instanceof HTMLTextAreaElement) || !event.target.closest(".CodeMirror"))
          return;
        metrics.focusAt = performance.now();
        window.removeEventListener("focusin", start, true);
        event.target.addEventListener(
          "input",
          () => {
            const before = performance.now();
            requestAnimationFrame(() =>
              requestAnimationFrame(() => metrics.input.push(performance.now() - before))
            );
          },
          true
        );
      };
      window.addEventListener("focusin", start, true);
    }, mod);
    await page.keyboard.press(`${mod}+/`);
    const source = page.locator(".CodeMirror").filter({ visible: true });
    await expect(source.locator("textarea")).toBeFocused();
    const firstLine = original.split("\n", 1)[0];
    await source.evaluate(element => {
      const cm = (
        element as unknown as { CodeMirror: { setCursor(line: number, ch: number): void } }
      ).CodeMirror;
      cm.setCursor(0, 0);
    });
    const line = () =>
      source.evaluate(element =>
        (
          element as unknown as { CodeMirror: { getLine(line: number): string } }
        ).CodeMirror.getLine(0)
      );
    const marker = "TauSourceStress";
    for (let attempt = 0; attempt < 5; attempt++) {
      await page.keyboard.insertText("Z");
      await expect.poll(async () => (await line()) === "Z" + firstLine).toBe(true);
      await page.keyboard.press("Backspace");
      await expect.poll(async () => (await line()) === firstLine).toBe(true);
    }
    await page.keyboard.insertText(marker);
    await page.keyboard.press(`${mod}+s`);
    await fileContains(path, marker);
    const metrics = await source.evaluate(element => {
      const { switchAt, focusAt, input } = (
        window as unknown as {
          sourceStressMetrics: { switchAt: number; focusAt: number; input: number[] };
        }
      ).sourceStressMetrics;
      return {
        switchToFocus: focusAt - switchAt,
        input,
        renderedLines: element.querySelectorAll(".CodeMirror-code > div").length,
      };
    });
    expect(metrics.switchToFocus).toBeGreaterThan(0);
    expect(metrics.input.length).toBeGreaterThan(3);
    await test.info().attach("历史样本的源码输入压力", {
      contentType: "application/json",
      body: JSON.stringify(metrics),
    });
    expect(digest(await readFile(path))).toBe(digest(Buffer.from(marker + original)));
    await closeWindow(app, page);
  });
});

function scroll(page: Page, fraction: number) {
  return page.locator(richSelector).evaluate((editable, fraction) => {
    for (let el = editable.parentElement; el; el = el.parentElement) {
      if (!/auto|scroll/.test(getComputedStyle(el).overflowY) || el.scrollHeight <= el.clientHeight)
        continue;
      el.scrollTop = fraction * (el.scrollHeight - el.clientHeight);
      return;
    }
    throw new Error("正文滚动容器未找到");
  }, fraction);
}

async function prepareSelectionClipboard(
  page: Page,
  type: "copy" | "paste",
  payload?: { html: string; text: string }
) {
  return page.locator(richSelector).evaluate(
    (editable, { type, payload }) => {
      const transfer = new DataTransfer();
      if (payload) {
        transfer.setData("text/html", payload.html);
        transfer.setData("text/plain", payload.text);
      }
      const handled = !editable.dispatchEvent(
        new ClipboardEvent(type, { bubbles: true, cancelable: true, clipboardData: transfer })
      );
      if (type === "paste" && !handled) {
        editable.dispatchEvent(
          new InputEvent("beforeinput", {
            bubbles: true,
            cancelable: true,
            inputType: "insertFromPaste",
            dataTransfer: transfer,
          })
        );
      }
      return { html: transfer.getData("text/html"), text: transfer.getData("text/plain") };
    },
    { type, payload }
  );
}

async function exchangeWithNativeClipboard(html: string): Promise<{
  bold: boolean;
  italic: boolean;
  link: boolean;
  table: boolean;
  html: string;
  text: string;
}> {
  const native = spawn(
    "/usr/bin/swift",
    [join(__dirname, "markdown-viewport/native-rich-clipboard.swift")],
    { stdio: ["pipe", "pipe", "pipe"] }
  );
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  native.stdout.on("data", (data: Buffer) => stdout.push(data));
  native.stderr.on("data", (data: Buffer) => stderr.push(data));
  const done = new Promise<void>((resolve, reject) => {
    native.once("error", reject);
    native.once("close", status =>
      status === 0 ? resolve() : reject(new Error(Buffer.concat(stderr).toString()))
    );
  });
  native.stdin.on("error", () => {
    /* 子进程错误由退出状态报告。 */
  });
  native.stdin.end(html);
  await done;
  return JSON.parse(Buffer.concat(stdout).toString());
}

test("跨占位复制到 macOS 富文本客户端，再粘贴客户端生成的富文本", async () => {
  // 门控：AppKit 原生富文本剪贴板为 macOS 专属；非 darwin 平台跳过，macOS 上正常执行。
  test.skip(process.platform !== "darwin", "使用 macOS AppKit 原生富文本和独立剪贴板");
  test.setTimeout(120_000);
  await sandbox(async (app, launcher, directory) => {
    const path = join(directory, "native-clipboard.md");
    const original =
      [
        "在此插入跨应用内容。",
        ...Array.from({ length: 130 }, (_, index) => `普通正文 ${index + 1}`),
        "## OffscreenHeading",
        "**OffscreenBold**、*OffscreenItalic*、[OffscreenLink](https://example.com/viewport-clipboard)",
        "| 名称 | 内容 |\n| --- | --- |\n| OffscreenTableValue | 完整 |",
        "末尾数据。",
      ].join("\n\n") + "\n";
    await writeFile(path, original);
    const page = await open(app, launcher, path);
    const editable = page.locator(richSelector);
    const first = editable.getByText("在此插入跨应用内容。", { exact: true });
    await first.click();
    await expect(editable.getByText("OffscreenBold", { exact: true })).toHaveCount(0);
    await page.keyboard.press(`${mod}+a`);
    const copy = await prepareSelectionClipboard(page, "copy");
    const semantics = await page.evaluate(html => {
      const parsed = new DOMParser().parseFromString(html, "text/html");
      return {
        heading: parsed.querySelector("h2")?.textContent,
        table: parsed.querySelector("td")?.textContent,
        bold: parsed.querySelector("strong")?.textContent,
        italic: parsed.querySelector("em")?.textContent,
        link: parsed.querySelector("a")?.getAttribute("href"),
      };
    }, copy.html);
    expect(semantics).toEqual({
      heading: "OffscreenHeading",
      table: "名称",
      bold: "OffscreenBold",
      italic: "OffscreenItalic",
      link: "https://example.com/viewport-clipboard",
    });

    const native = await exchangeWithNativeClipboard(copy.html);
    expect({
      bold: native.bold,
      italic: native.italic,
      link: native.link,
      table: native.table,
    }).toEqual({ bold: true, italic: true, link: true, table: true });
    await scroll(page, 0);
    await page.keyboard.press("ArrowLeft");
    await first.click();
    await expect
      .poll(() =>
        page.evaluate(() => {
          const selection = window.getSelection();
          return selection?.isCollapsed ? selection.anchorNode?.textContent : undefined;
        })
      )
      .toBe("在此插入跨应用内容。");
    await prepareSelectionClipboard(page, "paste", { html: native.html, text: native.text });
    await expect(editable.getByText("NativeBold", { exact: true })).toBeVisible();
    await page.keyboard.press(`${mod}+s`);
    await fileContains(path, "[NativeLink](https://example.com/native-clipboard)");
    const saved = await readFile(path, "utf8");
    expect(
      saved.includes("**NativeBold**") &&
        saved.includes("*NativeItalic*") &&
        saved.endsWith(original.slice(original.indexOf("## OffscreenHeading")))
    ).toBe(true);
    await page.keyboard.press(`${mod}+a`);
    await expect.poll(() => page.evaluate(() => window.getSelection()?.isCollapsed)).toBe(false);
    await prepareSelectionClipboard(page, "paste", { html: native.html, text: native.text });
    await expect
      .poll(async () => (await readFile(path, "utf8")).trim())
      .toBe(
        "**NativeBold** 与 *NativeItalic* 及 [NativeLink](https://example.com/native-clipboard)"
      );
    await closeWindow(app, page);
  });
});

test("按住鼠标跨屏拖选，正向和反向选区包含已经回收的正文", async () => {
  await sandbox(async (app, launcher, directory) => {
    const path = join(directory, "drag-selection.md");
    const marker = (index: number) => `DragLine${String(index).padStart(3, "0")}`;
    const original =
      Array.from(
        { length: 360 },
        (_, index) => `${marker(index)} 连续正文，用于验证跨屏拖选。`
      ).join("\n\n") + "\n";
    await writeFile(path, original);
    const page = await open(app, launcher, path);
    const editable = page.locator(richSelector);
    await expect(editable).toBeVisible();
    for (const reverse of [false, true]) {
      const start = reverse ? 359 : 0;
      await scroll(page, reverse ? 1 : 0);
      const startNode = editable.getByText(marker(start), { exact: false });
      await expect(startNode).toBeInViewport();
      const origin = await startNode.evaluate((el, reverse) => {
        const range = document.createRange();
        range.selectNodeContents(el);
        const rect = range.getBoundingClientRect();
        return { x: reverse ? rect.right - 2 : rect.left + 1, y: (rect.top + rect.bottom) / 2 };
      }, reverse);
      const bounds = await editable.evaluate(el => {
        const scroll = el.closest(".overflow-y-auto");
        const rect = scroll?.getBoundingClientRect();
        return {
          top: Math.max(rect?.top ?? 64, 64) + 25,
          bottom: Math.min(rect?.bottom ?? innerHeight, innerHeight) - 70,
        };
      });
      await page.mouse.move(origin.x, origin.y);
      await page.mouse.down();
      const edge = reverse ? bounds.top : bounds.bottom;
      await page.mouse.move(origin.x + 60, edge, { steps: 8 });
      for (let hop = 0; hop < 5; hop++) {
        const previous = (await visibleBlocks(page)).first;
        await page.mouse.wheel(0, reverse ? -720 : 720);
        await expect
          .poll(async () => {
            const visible = await visibleBlocks(page);
            return visible.gaps === 0 && visible.first >= 0 && visible.first !== previous;
          })
          .toBe(true);
        await page.mouse.move(origin.x + 55 + hop, edge + (reverse ? 6 : -6) * (hop % 2), {
          steps: 3,
        });
      }
      await page.mouse.up();
      const selection = await page.evaluate(() => {
        const dom = window.getSelection();
        const index = (node: Node | null | undefined) =>
          Number(node?.textContent?.match(/DragLine(\d{3})/)?.[1] ?? -1);
        return { anchor: index(dom?.anchorNode), focus: index(dom?.focusNode) };
      });
      expect(selection.anchor).toBe(start);
      expect(Math.abs(selection.focus - start)).toBeGreaterThan(40);
      const clip = await prepareSelectionClipboard(page, "copy");
      const missing = Array.from(
        { length: Math.abs(selection.focus - start) - 1 },
        (_, n) => Math.min(selection.focus, start) + n + 1
      ).filter(index => !clip.text.includes(marker(index)));
      expect(missing).toEqual([]);
      expect((await visibleBlocks(page)).mounted).toBeLessThan(120);
    }
    expect(await readFile(path, "utf8")).toBe(original);
    await closeWindow(app, page);
  });
});

test("辅助技术启用时向 Chromium 无障碍树提供全文，保留当前编辑会话", async () => {
  // 门控：Electron setAccessibilitySupportEnabled 限 macOS/Windows；Linux 跳过，macOS/Windows 上正常执行。
  test.skip(
    !["darwin", "win32"].includes(process.platform),
    "Electron 的辅助技术状态 API 限于 macOS 和 Windows"
  );
  await sandbox(async (app, launcher, directory) => {
    const path = join(directory, "accessible-document.md");
    const tail = "全文辅助技术末尾标题";
    const original =
      [
        "## 正文起点",
        "在正文起点编辑。",
        ...Array.from({ length: 210 }, (_, index) => `可访问正文 ${index + 1}`),
        `## ${tail}`,
        "| 格头 | 值 |\n| --- | --- |\n| 文末辅助技术表格 | 完整 |",
      ].join("\n\n") + "\n";
    await writeFile(path, original);
    const page = await open(app, launcher, path);
    await expect(page.locator(richSelector)).toBeVisible();
    const spacers = page.locator('[data-markdown-viewport-block="spacer"]');
    await expect.poll(() => spacers.count()).toBeGreaterThan(140);
    await page.getByText("在正文起点编辑。", { exact: true }).click();
    const cursor = () => page.evaluate(() => window.getSelection()?.anchorNode?.textContent);
    await expect.poll(cursor).toBe("在正文起点编辑。");
    await app.evaluate(({ app }) => app.setAccessibilitySupportEnabled(true));
    await expect(spacers).toHaveCount(0);
    await expect
      .poll(() =>
        page
          .locator(richSelector)
          .locator("[data-slate-chunk]")
          .last()
          .evaluate(node => getComputedStyle(node).contentVisibility)
      )
      .toBe("visible");
    await expect.poll(cursor).toBe("在正文起点编辑。");
    const ax = await page.context().newCDPSession(page);
    await ax.send("Accessibility.enable");
    const { nodes } = await ax.send("Accessibility.getFullAXTree");
    await ax.detach();
    expect(
      nodes.some(
        node =>
          !node.ignored && node.role?.value === "heading" && String(node.name?.value).includes(tail)
      )
    ).toBe(true);
    expect(
      nodes.some(
        node =>
          !node.ignored &&
          ["cell", "gridcell"].includes(String(node.role?.value)) &&
          String(node.name?.value).includes("文末辅助技术表格")
      )
    ).toBe(true);
    expect(nodes.some(node => !node.ignored && node.name?.value === "Markdown 正文")).toBe(true);
    const marker = "AccessibleInput";
    await page.keyboard.insertText(marker);
    await page.keyboard.press(`${mod}+s`);
    await fileContains(path, marker);
    expect((await readFile(path, "utf8")).replace(marker, "")).toBe(original);

    const next = join(directory, "accessible-new-window.md");
    await writeFile(next, original);
    const second = await open(app, launcher, next);
    await expect(second.locator(richSelector).getByRole("heading", { name: tail })).toBeAttached();
    await expect(second.locator('[data-markdown-viewport-block="spacer"]')).toHaveCount(0);
    await closeWindow(app, second);
    await closeWindow(app, page);
  });
});

test("历史表格长文默认首屏可写，首次输入后立即保存全文", async () => {
  // 门控：依赖仓外历史参考文件（sha256 固定，不入库）；TAU_MARKDOWN_VIEWPORT_FIXTURE 指向该文件后执行
  //（docs/notes/2026-11-15-markdown-viewport-validation.md「复测命令」）。
  test.skip(!fixture, "设置 TAU_MARKDOWN_VIEWPORT_FIXTURE 指向历史参考文件");
  if (!fixture) return;
  test.setTimeout(240_000);
  const original = await readFile(fixture);
  const filename = basename(fixture);
  const originalHash = "54ac9221c2705af36a3f3c5c55b21c5cadc4d222f3f632ca33e29ab4166c167d";
  const legacyEditedHash = "ad9e6e7678cb2a6f0b531c03111546da15bbc01ecb3fa57a5d9aaf6087976610";
  expect(digest(original)).toBe(originalHash);
  const samples: { firstWindow: boolean; sample: OpenSample; hash: string }[] = [];
  const trial = async (
    app: ElectronApplication,
    launcher: Page,
    directory: string,
    firstWindow: boolean
  ) => {
    const folder = join(directory, `trial-${samples.length + 1}`);
    await mkdir(folder);
    const path = join(folder, filename);
    await writeFile(path, original);
    const page = await open(app, launcher, path);
    const sample = await firstInput(page);
    await fileContains(path, input);
    const saved = await readFile(path);
    samples.push({ firstWindow, sample, hash: digest(saved) });
    expect(sample.spacers).toBeGreaterThan(2000);
    expect(sample.writable).toBe(sample.visible);
    expect(digest(saved)).toBe(legacyEditedHash);
    await closeWindow(app, page);
  };
  try {
    await sandbox((app, launcher, directory) => trial(app, launcher, directory, true));
    await sandbox(async (app, launcher, directory) => {
      const warmup = join(directory, "warmup.md");
      await writeFile(warmup, "预热正文。\n");
      const first = await open(app, launcher, warmup);
      await expect(first.locator(richSelector).getByText("预热正文。")).toBeVisible();
      await expect(first.locator('[data-markdown-viewport-block="spacer"]')).toHaveCount(0);
      await closeWindow(app, first);
      for (let attempt = 0; attempt < 3; attempt++) {
        await trial(app, launcher, directory, false);
      }
    });
    expect(digest(await readFile(fixture))).toBe(digest(original));
  } finally {
    await test.info().attach("同一文件的打开采样与保存摘要", {
      contentType: "application/json",
      body: JSON.stringify(samples, null, 2),
    });
  }
});

async function openFind(page: Page) {
  await page.keyboard.press(mod + "+f");
  const input = page.getByRole("textbox", { name: "搜索当前窗口" });
  await expect(input).toBeFocused();
  const count = page.getByRole("search").locator('[aria-live="polite"]');
  return { input, count };
}

function richFindVisible(page: Page, text: string) {
  return page.evaluate(needle => {
    const current = CSS.highlights.get("tau-global-find-current");
    if (!current) return false;
    for (const range of current) {
      if (!(range instanceof Range) || range.toString() !== needle) continue;
      const rect = range.getBoundingClientRect();
      return (
        rect.height > 0 &&
        rect.bottom > 0 &&
        rect.top < innerHeight &&
        rect.right > 0 &&
        rect.left < innerWidth
      );
    }
    return false;
  }, text);
}

test("历史表格长文从首屏查找真实文末词，正文与源码均跳转高亮", async () => {
  // 门控：依赖仓外历史参考文件（sha256 固定，不入库）；TAU_MARKDOWN_VIEWPORT_FIXTURE 指向该文件后执行
  //（docs/notes/2026-11-15-markdown-viewport-validation.md「复测命令」）。
  test.skip(!fixture, "设置 TAU_MARKDOWN_VIEWPORT_FIXTURE 指向历史参考文件");
  if (!fixture) return;
  test.setTimeout(120_000);
  const original = await readFile(fixture, "utf8");
  const candidates = original
    .split("\n")
    .slice(-130)
    .filter(line => line.startsWith("|"))
    .flatMap(line =>
      line
        .split("|")
        .slice(1, -1)
        .map(cell => cell.trim().replace(/^\x60|\x60$/g, ""))
    );
  const lower = original.toLocaleLowerCase();
  const needle = candidates.findLast(
    term =>
      /^[\p{L}][\p{L}\p{N}_-]{7,}$/u.test(term) &&
      lower.split(term.toLocaleLowerCase()).length === 2
  );
  if (!needle) throw new Error("历史样本末尾没有可校验的唯一表格词");
  await sandbox(async (app, launcher, directory) => {
    const path = join(directory, "find-historical.md");
    await writeFile(path, original);
    const page = await open(app, launcher, path);
    const rich = page.locator(richSelector);
    await expect(rich).toBeVisible();
    expect(
      await rich.evaluate((element, text) => element.textContent?.includes(text), needle)
    ).toBe(false);
    const richFind = await openFind(page);
    await richFind.input.fill(needle);
    await expect(richFind.count).toHaveText("1 / 1");
    await expect.poll(() => richFindVisible(page, needle)).toBe(true);
    await scroll(page, 0);
    await expect.poll(() => richFindVisible(page, needle)).toBe(false);
    await expect(richFind.count).toHaveText("1 / 1");
    await richFind.input.press("Enter");
    await expect.poll(() => richFindVisible(page, needle)).toBe(true);
    await richFind.input.press("Escape");
    await expect(page.getByRole("search")).toHaveCount(0);

    await page.keyboard.press(mod + "+/");
    const code = page.locator(".CodeMirror").filter({ visible: true });
    await expect(code.locator("textarea")).toBeFocused();
    const startOfSource = () =>
      code.evaluate(el => {
        const { CodeMirror } = el as unknown as {
          CodeMirror: { scrollTo(x: number, y: number): void };
        };
        CodeMirror.scrollTo(0, 0);
      });
    await startOfSource();
    expect(
      await code.evaluate((element, text) => element.textContent?.includes(text), needle)
    ).toBe(false);
    const sourceFind = await openFind(page);
    await sourceFind.input.fill(needle);
    await expect(sourceFind.count).toHaveText("1 / 1");
    const mark = code.locator(".tau-source-find-current");
    await expect(mark).toBeInViewport();
    expect((await mark.textContent()) === needle).toBe(true);
    await startOfSource();
    await expect(mark).toHaveCount(0);
    await expect(sourceFind.count).toHaveText("1 / 1");
    await sourceFind.input.press("Enter");
    await expect(mark).toBeInViewport();
    await sourceFind.input.press("Escape");
    await expect(mark).toHaveCount(0);
    expect(digest(await readFile(path))).toBe(digest(Buffer.from(original)));
    await closeWindow(app, page);
  });
});

test("查找跨格式文字与代码，重复命中可循环且滚动不会改变总数", async () => {
  const repeated = "RepeatedFindTarget";
  const codeText = "FindCodeLiteral+[42]";
  const filler = Array.from({ length: 240 }, (_, index) => "用于离屏挂载的段落 " + index);
  const raw =
    [
      "Repeated**Find**Target 样本开头",
      "\x60\x60\x60text\n" + codeText + "\n\x60\x60\x60",
      ...filler,
      repeated + " 样本文末",
    ].join("\n\n") + "\n";
  await sandbox(async (app, launcher, directory) => {
    const path = join(directory, "find-mixed.md");
    await writeFile(path, raw);
    const page = await open(app, launcher, path);
    await expect(page.locator(richSelector)).toBeVisible();
    const bar = await openFind(page);
    await bar.input.fill(repeated);
    await expect(bar.count).toHaveText("1 / 2");
    await expect.poll(() => richFindVisible(page, repeated)).toBe(true);
    await bar.input.press("Enter");
    await expect(bar.count).toHaveText("2 / 2");
    await expect(
      page.locator(richSelector).getByText("样本文末", { exact: false })
    ).toBeInViewport();
    await expect.poll(() => richFindVisible(page, repeated)).toBe(true);
    await scroll(page, 0);
    await expect(bar.count).toHaveText("2 / 2");
    await bar.input.press("Enter");
    await expect(bar.count).toHaveText("1 / 2");
    await expect.poll(() => richFindVisible(page, repeated)).toBe(true);
    await bar.input.press("Shift+Enter");
    await expect(bar.count).toHaveText("2 / 2");
    await expect.poll(() => richFindVisible(page, repeated)).toBe(true);
    await bar.input.fill(codeText);
    await expect(bar.count).toHaveText("1 / 1");
    await expect.poll(() => richFindVisible(page, codeText)).toBe(true);
    await bar.input.press("Escape");
    expect(await readFile(path, "utf8")).toBe(raw);
    await closeWindow(app, page);
  });
});

test("长文两种模式往返保留光标字符位置并滚入视口", async () => {
  test.setTimeout(120_000);
  const quote = '[data-slate-node="element"][class*="--ed-quote-text"]';
  const highlight = '[class~="p-[1.25em]"][style*="background-color"]';
  const nestedCode = Array.from(
    { length: 115 },
    (_, i) => "const embeddedRow" + i + " = " + i + ";"
  );
  const cases = [
    { label: "普通标题末尾", line: "## 远处普通标题", offset: 6, selector: "h2" },
    { label: "闭合标题标记", line: "## 远处闭合标题 ##", offset: 6, selector: "h2", reverse: 9 },
    {
      label: "标题末尾的行内链接",
      line: "### 远处**加粗**[链接文字](https://example.com/position)",
      ch: 15,
      offset: 6,
      selector: "h3",
      reverse: 15,
    },
    { label: "表格单元格", line: "| 左侧字段 | 右侧目标文本 |", ch: 13, offset: 4, selector: "td" },
    {
      label: "多行普通段落",
      line: "软换行后的定位文字",
      ch: 5,
      offset: 17,
      selector: "p",
    },
    {
      label: "代码块第二行",
      line: "const caretValue = 2;",
      ch: 10,
      offset: 28,
      selector: "textarea.code-block-shiki-input",
    },
    {
      label: "链接开头的标题尾",
      line: "### [开头链接](https://example.com/heading) 后续文字",
      offset: 9,
      selector: "h3",
    },
    {
      label: "引用中的多级列表与链接",
      line: ">    - **内层** [**嵌套**链接](https://example.com/nested)",
      ch: ">    - **内层** [**嵌套**链".length,
      offset: 6,
      selector: "p",
    },
    {
      label: "引用中的表格",
      line: "> | 左项 | 嵌套单元格 |",
      ch: "> | 左项 | 嵌套单".length,
      offset: 3,
      selector: "td",
    },
    {
      label: "列表中的代码块",
      line: "  const nestedPosition = 2;",
      ch: 12,
      offset: "const nestedStart = 1;\n".length + 10,
      selector: "textarea.code-block-shiki-input",
    },
    {
      label: "引用和列表中的代码块",
      line: ">   const embeddedTarget = 2;",
      ch: 14,
      offset: nestedCode.join("\n").length + 11,
      selector: "textarea.code-block-shiki-input",
    },
    {
      label: "视口外的自动换行长段末尾",
      line: "自动换行定位文字 ".repeat(390).trimEnd(),
      offset: "自动换行定位文字 ".repeat(390).trimEnd().length,
      selector: "p",
    },
    {
      label: "引用内嵌提示块再嵌高亮块",
      line: "> 引用提示高亮三层正文",
      ch: "> 引用提示高亮".length,
      offset: 6,
      selector: quote + " .callout " + highlight + " p",
    },
    {
      label: "提示块内嵌高亮块再嵌引用",
      line: "> 提示高亮引用三层正文",
      ch: "> 提示高亮引用".length,
      offset: 6,
      selector: ".callout " + highlight + " " + quote + " p",
    },
    {
      label: "高亮块内嵌提示块再嵌引用",
      line: "> 高亮提示引用三层正文",
      ch: "> 高亮提示引用".length,
      offset: 6,
      selector: highlight + " .callout " + quote + " p",
    },
    {
      label: "引用内嵌高亮块再嵌提示块",
      line: "> 引用高亮提示三层正文",
      ch: "> 引用高亮提示".length,
      offset: 6,
      selector: quote + " " + highlight + " .callout p",
    },
    {
      label: "提示块内嵌引用再嵌高亮块",
      line: "> 提示引用高亮三层正文",
      ch: "> 提示引用高亮".length,
      offset: 6,
      selector: ".callout " + quote + " " + highlight + " p",
    },
    {
      label: "高亮块内嵌引用再嵌提示块",
      line: "> 高亮引用提示三层正文",
      ch: "> 高亮引用提示".length,
      offset: 6,
      selector: highlight + " " + quote + " .callout p",
    },
  ];
  const fillers = Array.from(
    { length: 1250 },
    (_, i) => "长文占位段落 " + i + " 用于窗外光标定位。"
  );
  const raw =
    [
      "正文开头",
      ...fillers,
      cases[0].line,
      cases[1].line,
      cases[2].line,
      "| 左栏 | 右栏 |\n| --- | --- |\n" + cases[3].line,
      "有软换行的第一部分文字\n" + cases[4].line,
      "\x60\x60\x60js\nconst sample = 1;\n" + cases[5].line + "\n\x60\x60\x60",
      cases[6].line,
      "> 1. 外层列表项\n" + cases[7].line,
      "> | 栏一 | 栏二 |\n> | --- | --- |\n" + cases[8].line,
      "- 代码所在列表项\n\n  \x60\x60\x60js\n  const nestedStart = 1;\n" +
        cases[9].line +
        "\n  \x60\x60\x60",
      "> - 引用中的代码列表项\n>\n>   \x60\x60\x60js\n>   " +
        nestedCode.join("\n>   ") +
        "\n" +
        cases[10].line +
        "\n>   \x60\x60\x60",
      cases[11].line,
      '> ::::tip{title="引用提示"}\n> :::highlight-block{color=blue}\n' +
        cases[12].line +
        "\n> :::\n> ::::",
      '::::note{title="外层提示"}\n:::highlight-block{color=yellow}\n' +
        cases[13].line +
        "\n:::\n::::",
      '::::highlight-block{color=yellow}\n:::warning{title="内层提示"}\n' +
        cases[14].line +
        "\n:::\n::::",
      '> ::::highlight-block{color=blue}\n> :::tip{title="内层提示"}\n' +
        cases[15].line +
        "\n> :::\n> ::::",
      '::::info{title="外层提示"}\n> :::highlight-block{color=yellow}\n' +
        cases[16].line +
        "\n> :::\n::::",
      '::::highlight-block{color=yellow}\n> :::note{title="内层提示"}\n' +
        cases[17].line +
        "\n> :::\n::::",
      ...fillers.slice(0, 50),
    ].join("\n\n") + "\n";
  await sandbox(async (app, launcher, directory) => {
    const path = join(directory, "caret-roundtrip.md");
    await writeFile(path, raw);
    const page = await open(app, launcher, path);
    const rich = page.locator(richSelector);
    const source = page.locator(".CodeMirror").filter({ visible: true });
    await expect(rich).toBeVisible();
    for (const sample of cases) {
      await scroll(page, 0);
      const clickMode = sample.label.includes("引用");
      const switchToSource = () =>
        clickMode
          ? page.locator('button[title^="源码模式"]').click()
          : page.keyboard.press(mod + "+/");
      const switchToRich = () =>
        clickMode
          ? page.locator('button[title^="退出源码模式"]').click()
          : page.keyboard.press(mod + "+/");
      await switchToSource();
      await expect(source.locator("textarea")).toBeFocused();
      const line = raw.split("\n").indexOf(sample.line);
      const ch = sample.ch ?? sample.line.length;
      await source.evaluate(
        (element, { line, ch }) => {
          const { CodeMirror } = element as unknown as {
            CodeMirror: { setCursor(line: number, ch: number): void };
          };
          CodeMirror.setCursor(line, ch);
        },
        { line, ch }
      );
      await switchToRich();
      await expect(source).toBeHidden();
      const actual = () =>
        page.evaluate(selector => {
          const active = document.activeElement;
          const visible = (rect: DOMRect) =>
            rect.height > 0 && rect.top >= 45 && rect.bottom <= innerHeight;
          if (active instanceof HTMLTextAreaElement && active.matches(selector)) {
            const leaf = active
              .closest(".ed-code-overlay")
              ?.querySelector("pre.code-block-shiki-measure")?.firstChild;
            const range = document.createRange();
            if (leaf instanceof globalThis.Text && leaf.length >= active.selectionStart) {
              range.setStart(leaf, active.selectionStart);
              range.collapse(true);
            }
            const rect = range.getBoundingClientRect();
            return {
              offset: active.selectionStart,
              visible: visible(rect.height ? rect : active.getBoundingClientRect()),
              kind: selector,
            };
          }
          const selected = window.getSelection();
          const node = selected?.anchorNode;
          const parent = (node instanceof HTMLElement ? node : node?.parentElement)?.closest(
            selector
          );
          if (!selected || !node || !parent?.closest('[data-slate-editor="true"]')) return null;
          const prefix = document.createRange();
          prefix.selectNodeContents(parent);
          prefix.setEnd(node, selected.anchorOffset);
          const caret = selected.getRangeAt(0).getBoundingClientRect();
          const editablePrefix = prefix
            .cloneContents()
            .querySelectorAll('[data-slate-string="true"]');
          return {
            offset: [...editablePrefix].reduce(
              (length, leaf) => length + (leaf.textContent?.length ?? 0),
              0
            ),
            visible: visible(caret),
            kind: selector,
          };
        }, sample.selector);
      await expect.soft.poll(actual, { timeout: 2500, message: sample.label }).toEqual({
        offset: sample.offset,
        visible: true,
        kind: sample.selector,
      });
      if (!(await actual())?.visible) {
        const geometry = await page.evaluate(() => {
          const selected = window.getSelection();
          const node = selected?.anchorNode;
          const scroll = node?.parentElement?.closest(".min-h-0.flex-1");
          return {
            text: node?.textContent?.slice(0, 32),
            caret: selected?.rangeCount
              ? selected.getRangeAt(0).getBoundingClientRect().toJSON()
              : null,
            scrollTop: scroll?.scrollTop,
            scrollRect: scroll?.getBoundingClientRect().toJSON(),
          };
        });
        await test.info().attach(sample.label + "光标几何", {
          contentType: "application/json",
          body: JSON.stringify(geometry),
        });
        console.log("TAU_CARET_GEOMETRY", JSON.stringify({ label: sample.label, geometry }));
      }
      await switchToSource();
      await expect(source.locator("textarea")).toBeFocused();
      {
        const pos = await source.evaluate(element => {
          const { CodeMirror } = element as unknown as {
            CodeMirror: { getCursor(): { line: number; ch: number } };
          };
          const { line, ch } = CodeMirror.getCursor();
          return { line, ch };
        });
        expect.soft(pos, sample.label + "返回源码").toEqual({ line, ch: sample.reverse ?? ch });
        const cursorVisible = await source.evaluate(element => {
          const caret = element.querySelector(".CodeMirror-cursor")?.getBoundingClientRect();
          const scroller = element.querySelector(".CodeMirror-scroll")?.getBoundingClientRect();
          return Boolean(
            caret &&
            scroller &&
            caret.height > 0 &&
            caret.top >= Math.max(scroller.top, 45) &&
            caret.bottom <= Math.min(scroller.bottom, innerHeight)
          );
        });
        expect.soft(cursorVisible, sample.label + "源码光标可见").toBe(true);
      }
      await switchToRich();
      await expect(source).toBeHidden();
    }
    expect(await readFile(path, "utf8")).toBe(raw);
    await closeWindow(app, page);
  });
});

test("非窗口化源码改写标题后切换，光标跟随最新文字和外层滚动", async () => {
  const rawTitle = "## 初始标题";
  const changedTitle = rawTitle + "新增";
  const raw =
    [...Array.from({ length: 75 }, (_, i) => "短文前置片段 " + i), rawTitle].join("\n\n") + "\n";
  await sandbox(async (app, launcher, directory) => {
    const path = join(directory, "caret-after-source-edit.md");
    await writeFile(path, raw);
    const page = await open(app, launcher, path);
    await expect(page.locator(richSelector)).toBeVisible();
    await expect(page.locator("[data-markdown-viewport]")).toHaveCount(0);
    await page.keyboard.press(mod + "+/");
    const source = page.locator(".CodeMirror").filter({ visible: true });
    await expect(source.locator("textarea")).toBeFocused();
    const line = raw.split("\n").indexOf(rawTitle);
    await source.evaluate(
      (element, { line, length }) => {
        const { CodeMirror } = element as unknown as {
          CodeMirror: { setCursor(line: number, ch: number): void };
        };
        CodeMirror.setCursor(line, length);
      },
      { line, length: rawTitle.length }
    );
    await page.keyboard.insertText("新增");
    await expect(source.getByText("初始标题新增", { exact: false })).toBeInViewport();
    await page.locator('button[title^="退出源码模式"]').click();
    await expect(
      page.locator(richSelector).getByRole("heading", { name: "初始标题新增" })
    ).toBeInViewport();
    await expect
      .poll(() =>
        page.evaluate(() => {
          const selection = window.getSelection();
          return { text: selection?.anchorNode?.textContent, offset: selection?.anchorOffset };
        })
      )
      .toEqual({ text: "初始标题新增", offset: 6 });
    await page.keyboard.press(mod + "+/");
    await expect(source.locator("textarea")).toBeFocused();
    const result = await source.evaluate(element => {
      const { CodeMirror } = element as unknown as {
        CodeMirror: { getCursor(): { line: number; ch: number } };
      };
      const { line, ch } = CodeMirror.getCursor();
      return { line, ch };
    });
    expect(result).toEqual({ line, ch: changedTitle.length });
    await expect(source.locator(".CodeMirror-cursor")).toBeInViewport();
    await page.keyboard.press(mod + "+s");
    await expect
      .poll(async () => (await readFile(path, "utf8")) === raw.replace(rawTitle, changedTitle))
      .toBe(true);
    await closeWindow(app, page);
  });
});

test("长文滚动、全文剪贴板、撤销和源码往返保留完整文件", async () => {
  test.setTimeout(150_000);
  const marker = "TauViewportEarlyEdit";
  const tail = "TailBeforeViewportEnd";
  const rows = Array.from(
    { length: 1800 },
    (_, index) => `第 ${index + 1} 段。${"中文长段落用来验证滚动之后的数据没有丢失。".repeat(3)}`
  );
  const table = "| 左列 | 右列 |\n| --- | --- |\n| 表格内文字 | 保留这项 |";
  rows.splice(6, 0, table);
  const original = [`开头定位文本`, ...rows, "## 文末定位", tail].join("\n\n") + "\n";
  await sandbox(async (app, launcher, directory) => {
    const path = join(directory, "synthetic-long.md");
    const other = join(directory, "other.md");
    const otherText = "切换目标原文。\n";
    await writeFile(path, original);
    await writeFile(other, otherText);
    const page = await open(app, launcher, path);
    const errors: string[] = [];
    page.on("pageerror", error =>
      errors.push(
        [
          error.name,
          ...(error.stack?.split("\n").filter(line => line.trimStart().startsWith("at ")) ?? []),
        ].join("\n")
      )
    );
    const sample = await firstInput(page, marker);
    expect(sample.visible).toBe(sample.writable);
    expect(sample.spacers).toBeGreaterThan(1600);
    await fileContains(path, marker);
    const saved = await readFile(path, "utf8");
    expect(saved.replace(marker, "")).toBe(original);

    await page.keyboard.press(`${mod}+a`);
    await expect
      .poll(() =>
        page.evaluate(() => {
          const range = window.getSelection();
          return {
            start: range?.anchorNode?.textContent?.includes("开头定位文本"),
            end: range?.focusNode?.textContent?.includes("TailBeforeViewportEnd"),
          };
        })
      )
      .toEqual({ start: true, end: true });
    const clipboardEvent = (type: "copy" | "cut" | "paste") =>
      page.locator(richSelector).evaluate(
        (editable, { type, marker, tail }) => {
          const state = window as unknown as { viewportClipboard?: DataTransfer };
          const data = type === "paste" ? state.viewportClipboard : new DataTransfer();
          if (!data) throw new Error("剪贴板测试数据尚未准备");
          const handled = !editable.dispatchEvent(
            new ClipboardEvent(type, { bubbles: true, cancelable: true, clipboardData: data })
          );
          if (type === "paste" && !handled) {
            editable.dispatchEvent(
              new InputEvent("beforeinput", {
                bubbles: true,
                cancelable: true,
                inputType: "insertFromPaste",
                dataTransfer: data,
              })
            );
          }
          state.viewportClipboard = data;
          const text = data.getData("text/plain");
          return {
            head: text.includes(marker),
            middle: text.includes("第 900 段"),
            tail: text.includes(tail),
            table: text.includes("表格内文字"),
            paragraphCount: text.match(/第 \d+ 段/g)?.length ?? 0,
          };
        },
        { type, marker, tail }
      );
    const expectedClipboard = {
      head: true,
      middle: true,
      tail: true,
      table: true,
      paragraphCount: 1800,
    };
    expect(await clipboardEvent("copy")).toEqual(expectedClipboard);
    expect(await clipboardEvent("cut")).toEqual(expectedClipboard);
    await expect(page.locator(richSelector).getByText(marker, { exact: false })).toHaveCount(0);
    await page.keyboard.press(`${mod}+s`);
    await expect.poll(async () => (await readFile(path, "utf8")).trim()).toBe("");
    await clipboardEvent("paste");
    await page.keyboard.press(`${mod}+s`);
    await expect.poll(async () => (await readFile(path, "utf8")) === saved).toBe(true);
    await page.keyboard.press("ArrowLeft");

    const counts: number[] = [];
    for (const fraction of [0.14, 0.5, 0.99, 0.32, 0.82, 0, 1]) {
      const previous = (await visibleBlocks(page)).first;
      await scroll(page, fraction);
      await expect
        .poll(async () => {
          const state = await visibleBlocks(page);
          return state.gaps === 0 && state.first >= 0 && state.first !== previous;
        })
        .toBe(true);
      counts.push((await visibleBlocks(page)).mounted);
    }
    expect(Math.max(...counts)).toBeLessThan(160);
    await expect(page.locator(richSelector).getByText(tail)).toBeVisible();

    await page.locator(richSelector).getByText(tail).click();
    await page.keyboard.press(`${mod}+/`);
    const source = page.locator(".CodeMirror").filter({ visible: true });
    await expect(source).toBeVisible();
    await expect(source.locator("textarea")).toBeFocused();
    await source.evaluate(element => {
      const cm = (
        element as unknown as {
          CodeMirror: { lastLine(): number; setCursor(line: number, ch: number): void };
        }
      ).CodeMirror;
      cm.setCursor(cm.lastLine() - 1, 4);
    });
    await page.keyboard.press(`${mod}+/`);
    await expect
      .poll(() => page.evaluate(() => window.getSelection()?.anchorNode?.textContent))
      .toBe(tail);
    await page.keyboard.insertText("END_");
    await page.keyboard.press(`${mod}+s`);
    await fileContains(path, "TailEND_BeforeViewportEnd");
    await page.keyboard.press(`${mod}+z`);
    await page.keyboard.press(`${mod}+s`);
    await expect.poll(async () => (await readFile(path, "utf8")) === saved).toBe(true);
    await page.keyboard.press(process.platform === "darwin" ? "Meta+Shift+z" : "Control+Shift+z");
    await page.keyboard.press(`${mod}+s`);
    await fileContains(path, "TailEND_BeforeViewportEnd");

    await scroll(page, 0);
    await page.locator(richSelector).getByText("开头定位文本", { exact: false }).click();
    await expect(page.locator(richSelector).getByText("TailEND_BeforeViewportEnd")).toHaveCount(0);
    const revised = (await readFile(path, "utf8")).replace(
      "TailEND_BeforeViewportEnd",
      "ExternalTailUpdated"
    );
    await writeFile(path, revised);
    await expect(page.getByText("已同步外部修改", { exact: true })).toBeVisible();
    const heading = page
      .getByRole("navigation", { name: "大纲" })
      .getByRole("button", { name: "文末定位" });
    if (!(await heading.isVisible()))
      await page.getByRole("button", { name: "大纲", exact: true }).click();
    await heading.click();
    await expect(page.locator(richSelector).getByText("ExternalTailUpdated")).toBeInViewport();
    expect(digest(await readFile(path))).toBe(digest(Buffer.from(revised)));

    await page.getByRole("button", { name: "侧栏", exact: true }).click();
    const targetFile = page.getByRole("treeitem", { name: "other.md", exact: true });
    await expect(targetFile).toBeVisible();
    await page.locator(richSelector).getByText("ExternalTailUpdated").click();
    await page.keyboard.insertText("SwitchFlush");
    await targetFile.click();
    await fileContains(path, "SwitchFlush");
    expect((await readFile(path, "utf8")).replace("SwitchFlush", "")).toBe(revised);
    await expect(page.locator(richSelector).getByText("切换目标原文。")).toBeVisible();
    expect(await readFile(other, "utf8")).toBe(otherText);
    await closeWindow(app, page);
    expect(errors).toEqual([]);
    await test.info().attach("合成长文的挂载数量", {
      contentType: "application/json",
      body: JSON.stringify({ sample, counts }),
    });
  });
});

test("首块巨表内连续输入、中文组合输入与保存", async () => {
  test.setTimeout(150_000);
  const rows = Array.from(
    { length: 450 },
    (_, row) =>
      `| ${Array.from({ length: 6 }, (_, column) => `单元格${row}-${column}`).join(" | ")} |`
  );
  const original = [
    `| 甲 | 乙 | 丙 | 丁 | 戊 | 己 |`,
    "| --- | --- | --- | --- | --- | --- |",
    ...rows,
    "",
    "## 巨表后的正文",
    "",
    "表格后的段落要保留。",
    "",
  ].join("\n");
  await sandbox(async (app, launcher, directory) => {
    const path = join(directory, "giant-table.md");
    await writeFile(path, original);
    const page = await open(app, launcher, path);
    const sample = await firstInput(page);
    expect(sample.visible).toBe(sample.writable);
    const table = page.locator(richSelector).locator("table");
    await expect(table.locator("tbody td")).toHaveCount(2706);
    const cell = table.locator("tbody tr").nth(1).locator("td").first();
    await cell.scrollIntoViewIfNeeded();
    const point = await cell.evaluate(element => {
      const leaf = element.querySelector('[data-slate-string="true"]')?.firstChild;
      if (!leaf) throw new Error("表格单元格缺少文字");
      const range = element.ownerDocument.createRange();
      range.setStart(leaf, 1);
      range.setEnd(leaf, 2);
      const rect = range.getBoundingClientRect();
      const x = (rect.left + rect.right) / 2;
      const y = (rect.top + rect.bottom) / 2;
      return { x, y, inside: element.contains(element.ownerDocument.elementFromPoint(x, y)) };
    });
    expect(point.inside).toBe(true);
    await page.mouse.click(point.x, point.y);
    const atCell = () =>
      cell.evaluate(element => {
        const selection = element.ownerDocument.getSelection();
        return {
          collapsed: Boolean(selection?.isCollapsed),
          inside: element.contains(selection?.anchorNode ?? null),
          active: Boolean(
            element.ownerDocument.activeElement?.matches('[data-slate-editor="true"]')
          ),
          anchor: selection?.anchorNode?.textContent?.slice(0, 30),
        };
      });
    const editingCell = { collapsed: true, inside: true, active: true, anchor: "单元格0-0" };
    await expect.poll(atCell).toEqual(editingCell);
    await cell.evaluate(cell => {
      const readings: number[] = [];
      Object.assign(window, { markdownInputReadings: readings });
      const editor = cell.closest('[data-slate-editor="true"]');
      if (!editor) throw new Error("未找到表格所在的编辑器");
      editor.addEventListener("beforeinput", () => {
        const started = performance.now();
        requestAnimationFrame(() =>
          requestAnimationFrame(() => readings.push(performance.now() - started))
        );
      });
    });
    for (let attempt = 0; attempt < 20; attempt++) {
      await page.keyboard.insertText("X");
      await expect(cell, `第 ${attempt + 1} 次格内输入`).toContainText("X");
      await page.keyboard.press("Backspace");
      await expect(cell).not.toContainText("X");
    }
    await expect.poll(atCell).toEqual(editingCell);
    await expect(cell).toHaveText("单元格0-0");
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Input.imeSetComposition", {
      text: "输入法验证",
      selectionStart: 5,
      selectionEnd: 5,
    });
    await cdp.send("Input.insertText", { text: "输入法验证" });
    await cdp.detach();
    await page.keyboard.press(`${mod}+s`);
    await fileContains(path, "输入法验证");
    const saved = await readFile(path, "utf8");
    expect(saved.replace(input, "").replace("输入法验证", "")).toBe(original);
    const readings = await page.evaluate(
      () => (window as unknown as { markdownInputReadings: number[] }).markdownInputReadings
    );
    await test.info().attach("巨表的首屏与按键采样", {
      contentType: "application/json",
      body: JSON.stringify({ sample, readings }),
    });
    await closeWindow(app, page);
  });
});
