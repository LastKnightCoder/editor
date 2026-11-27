import { expect, test, type ElectronApplication, type Page } from "@playwright/test";
import type { IArticle } from "../src/types/article";
import {
  availablePort,
  createSandbox,
  disposeSandbox,
  invoke,
  launch,
  subscribe,
  withTree,
} from "./content-production/harness";

interface ReadingSample {
  top: number;
  height: number;
  width: number;
  text: string;
}
interface ProbeWindow extends Window {
  articleViewportProbe: {
    first: ReadingSample | null;
    arm(): void;
    scroll(top: number): ReadingSample;
    stop(): void;
  };
}

async function createArticle(page: Page) {
  await page.getByRole("button", { name: "文章", exact: true }).click();
  await page.getByRole("button", { name: "新建", exact: true }).first().click();
  await page.getByRole("menuitem", { name: "空白文章", exact: true }).click();
  await expect(
    page.locator('[data-page-key="article-detail"][data-page-active] [data-slate-editor="true"]')
  ).toBeVisible();
  const [template] = await invoke<IArticle[]>(page, "get-all-articles");
  const opened = await invoke<{ documentId: string }>(page, "local-content:open-content", {
    contentId: template.contentId,
    sourceType: "article",
    sourceId: template.id,
  });
  const snapshot = await subscribe(page, opened.documentId, "article-scroll-fixture");
  try {
    // 从真实编辑器创建的正文取得契约，避免诊断夹具依赖某个插件版本号。
    const prepared = withTree(snapshot, tree => ({
      contracts: tree.contracts.toJSON(),
      paragraph: tree.snapshot()[0],
    }));
    await invoke(page, "create-article", {
      title: "阅读位置回归",
      author: "",
      tags: [],
      links: [],
      bannerBg: "",
      isTop: false,
      isDelete: false,
      count: 0,
      contracts: prepared.contracts,
      content: Array.from({ length: 100 }, (_, index) => ({
        type: "paragraph",
        tauContract: prepared.paragraph.tauContract,
        children: [
          {
            type: "formatted",
            text: `段落${index}：返回后继续阅读这一段，不能先显示文首再跳回来。`,
          },
        ],
      })),
    });
  } finally {
    await invoke(page, "local-content:unsubscribe", "article-scroll-fixture");
  }
  await page.reload();
  await page.getByRole("button", { name: "文章", exact: true }).first().click();
  await page
    .locator('[data-page-key="articles"][data-page-active]')
    .getByText("阅读位置回归", { exact: true })
    .first()
    .click();
  await expect(page.locator('[data-page-key="article-detail"][data-page-active]')).toContainText(
    "段落99"
  );
}

async function installProbe(page: Page) {
  await page.evaluate(() => {
    const findScroller = () => {
      const root = document.querySelector('[data-page-key="article-detail"][data-page-active]');
      const editor = root?.querySelector<HTMLElement>('[data-slate-editor="true"]');
      if (!root || !editor || getComputedStyle(root).visibility !== "visible") return null;
      for (
        let element = editor.parentElement;
        element && element !== root;
        element = element.parentElement
      ) {
        if (getComputedStyle(element).overflowY === "auto") return { element, editor };
      }
      return null;
    };
    const sample = (value: NonNullable<ReturnType<typeof findScroller>>): ReadingSample => {
      const { element, editor } = value;
      const top = element.getBoundingClientRect().top;
      const first = [...editor.querySelectorAll<HTMLElement>('[data-slate-string="true"]')].find(
        node => node.getBoundingClientRect().bottom > top
      );
      return {
        top: element.scrollTop,
        height: element.scrollHeight,
        width: element.clientWidth,
        text: first?.textContent ?? "",
      };
    };
    let armed = false;
    let frame = 0;
    const probe = {
      first: null as ReadingSample | null,
      arm: () => {
        probe.first = null;
        armed = true;
      },
      scroll: (top: number) => {
        const value = findScroller();
        if (!value) throw new Error("文章滚动容器尚未就绪");
        value.element.scrollTop = top;
        return sample(value);
      },
      stop: () => cancelAnimationFrame(frame),
    };
    const measure = () => {
      const value = armed && findScroller();
      if (value) {
        probe.first = sample(value);
        armed = false;
      }
      frame = requestAnimationFrame(measure);
    };
    frame = requestAnimationFrame(measure);
    (window as ProbeWindow).articleViewportProbe = probe;
  });
}

async function delayNextSubscription(app: ElectronApplication) {
  await app.evaluate(({ ipcMain }) => {
    type Handler = (event: unknown, ...args: unknown[]) => unknown;
    const handlers = (ipcMain as typeof ipcMain & { _invokeHandlers: Map<string, Handler> })
      ._invokeHandlers;
    const subscribe = handlers.get("local-content:subscribe");
    if (!subscribe) throw new Error("正文订阅入口未注册");
    let release: (() => void) | undefined;
    const waiting = new Promise<void>(resolve => {
      release = resolve;
    });
    let delayed = false;
    ipcMain.removeHandler("local-content:subscribe");
    ipcMain.handle("local-content:subscribe", async (event, ...args: unknown[]) => {
      if (!delayed) {
        delayed = true;
        await waiting;
      }
      return subscribe(event, ...args);
    });
    ipcMain.handle("article-scroll-test:release", () => release?.());
  });
}

// 事故回归：对话放大返回时，正文异步重建把原阅读位置归零；首个可见帧也必须保位。
test("返回文章的首个可见帧保留位置，订阅延迟期间继续显示原页面", async () => {
  test.setTimeout(120_000);
  const directory = await createSandbox("tau-article-scroll-");
  let running: ElectronApplication | undefined;
  try {
    const { app, page } = await launch(directory, await availablePort(), value => {
      running = value;
    });
    await app.evaluate(({ BrowserWindow }) => {
      for (const window of BrowserWindow.getAllWindows())
        window.webContents.setBackgroundThrottling(false);
    });
    await createArticle(page);
    await page.keyboard.press(process.platform === "darwin" ? "Meta+j" : "Control+j");
    const expand = page.getByRole("button", { name: "在对话页打开", exact: true });
    await expect(expand).toBeVisible();
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all(
        document.getAnimations().map(animation => animation.finished.catch(() => undefined))
      );
    });
    await installProbe(page);
    const readings: { method: string; before: ReadingSample; first: ReadingSample }[] = [];
    for (const method of ["收为侧栏", "后退", "普通页面后退"]) {
      const before = await page.evaluate(() =>
        (window as ProbeWindow).articleViewportProbe.scroll(2000)
      );
      if (method === "普通页面后退") {
        // 减少动态效果时没有原生转场快照，展示交接仍须等待正文和位置就绪。
        await page.emulateMedia({ reducedMotion: "reduce" });
        await page.getByRole("button", { name: "今日", exact: true }).first().click();
        await expect(page.locator('[data-page-key="home"][data-page-active]')).toBeVisible();
      } else {
        await expand.click();
        await expect(page.locator('[data-page-key="chat"][data-page-active]')).toBeVisible();
      }
      await page.evaluate(() => (window as ProbeWindow).articleViewportProbe.arm());
      if (method === "收为侧栏") await delayNextSubscription(app);
      await page
        .getByRole("button", { name: method === "收为侧栏" ? "收为侧栏" : "后退", exact: true })
        .click();
      if (method === "收为侧栏") {
        await expect(
          page.locator('[data-page-key="article-detail"][data-page-preparing]')
        ).toHaveCount(1);
        await expect(page.locator('[data-page-key="chat"][data-page-active]')).toBeVisible();
        expect(
          await page.evaluate(() => (window as ProbeWindow).articleViewportProbe.first)
        ).toBeNull();
        await invoke(page, "article-scroll-test:release");
      }
      await expect
        .poll(() => page.evaluate(() => (window as ProbeWindow).articleViewportProbe.first))
        .not.toBeNull();
      const first = await page.evaluate(() => (window as ProbeWindow).articleViewportProbe.first);
      if (!first) throw new Error("未记录文章首个可见帧");
      expect(first.top, method).toBeCloseTo(before.top, 0);
      expect(first.text, method).toBe(before.text);
      expect(first.height).toBeGreaterThan(2000);
      readings.push({ method, before, first });
    }
    await page.evaluate(() => (window as ProbeWindow).articleViewportProbe.stop());
    await test.info().attach("first-visible-frame", {
      contentType: "application/json",
      body: JSON.stringify(readings, null, 2),
    });
    await expand.click();
    await expect(page.locator('[data-page-key="chat"][data-page-active]')).toBeVisible();
    await app.evaluate(({ ipcMain }) => {
      type Handler = (event: unknown, ...args: unknown[]) => unknown;
      const handlers = (ipcMain as typeof ipcMain & { _invokeHandlers: Map<string, Handler> })
        ._invokeHandlers;
      const subscribe = handlers.get("local-content:subscribe");
      if (!subscribe) throw new Error("正文订阅入口未注册");
      let failed = false;
      ipcMain.removeHandler("local-content:subscribe");
      ipcMain.handle("local-content:subscribe", (event, ...args: unknown[]) => {
        if (!failed) {
          failed = true;
          throw new Error("SCROLL_RESTORE_SUBSCRIPTION_UNAVAILABLE");
        }
        return subscribe(event, ...args);
      });
    });
    await page.getByRole("button", { name: "后退", exact: true }).click();
    const restored = page.locator('[data-page-key="article-detail"][data-page-active]');
    await expect(restored.getByRole("status")).toContainText(
      "SCROLL_RESTORE_SUBSCRIPTION_UNAVAILABLE"
    );
    await expect(page.locator("[data-page-preparing]")).toHaveCount(0);
  } finally {
    await disposeSandbox(directory, running);
  }
});
