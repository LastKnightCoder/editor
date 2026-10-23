import type { driver as Driver } from "./main";
import { DOCUMENT_KEY, PACKAGE_KEY, verifyArtifacts } from "./runtime";

const CHECKPOINT = "tau-mobile-plugin-spike:checkpoint";
const SOURCE = "X:1\nT:Tau 跨端验证\nM:4/4\nL:1/4\nK:C\nC D E F | G A B c |";
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const assert = (value: unknown, message: string) => {
  if (!value) throw new Error(message);
};
async function until(check: () => unknown, label: string, timeout = 15000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (check()) return;
    await delay(50);
  }
  throw new Error(`等待超时：${label}`);
}
function click(selector: string) {
  const element = document.querySelector<HTMLButtonElement>(selector);
  assert(element && !element.disabled, `按钮不可用：${selector}`);
  element!.click();
}

export async function runSpikeChecks(driver: typeof Driver) {
  const runtime = driver.runtime!;
  const platform = runtime.environment.platform;
  const resume = localStorage.getItem(CHECKPOINT) !== null;
  const checks: string[] = [];
  const report = async (status: string, error?: unknown) => {
    const artifacts = JSON.parse(localStorage.getItem(PACKAGE_KEY)!);
    const result = {
      platform,
      status,
      resume,
      checks,
      error: error ? String(error) : undefined,
      userAgent: navigator.userAgent,
      origin: location.origin,
      environment: runtime.environment,
      nativeContainer: /Electron/.test(navigator.userAgent)
        ? "electron"
        : "__TAURI_INTERNALS__" in window
          ? "tauri"
          : "browser",
      artifacts: artifacts.map(
        (item: { manifest: { id: string; version: string; integrity: unknown } }) => ({
          id: item.manifest.id,
          version: item.manifest.version,
          integrity: item.manifest.integrity,
        })
      ),
    };
    // WKWebView 的开发资源代理只透传读取；报告不包含用户数据。
    const response =
      platform === "ios"
        ? await fetch(
            `/__plugin-spike__/report?payload=${encodeURIComponent(JSON.stringify(result))}`
          )
        : await fetch("http://127.0.0.1:2420/__plugin-spike__/report", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(result),
          });
    if (!response.ok) throw new Error("验证报告保存失败");
    return result;
  };
  try {
    await until(() => runtime.navigator, "导航初始化");
    assert(
      document.querySelector(
        `[data-entry-placement="${platform === "desktop" ? "sidebar" : "my-tools"}"]`
      ),
      "入口位置错误"
    );
    checks.push("同一语义入口按平台显示");
    const altered = JSON.parse(localStorage.getItem(PACKAGE_KEY)!);
    altered[0].code += "\n/* 篡改 */";
    let rejected = false;
    try {
      await verifyArtifacts(altered);
    } catch {
      rejected = true;
    }
    assert(rejected, "篡改包未被拒绝");
    checks.push("逐文件摘要阻止篡改");
    click('[data-spike-entry="spike.counter:counter"]');
    await until(
      () => /^\d+$/.test(document.querySelector("[data-spike-count]")?.textContent ?? ""),
      "计数器加载"
    );
    assert(
      document.querySelector(`[data-spike-counter][data-platform="${platform}"]`),
      "插件 hook 环境未注入"
    );
    checks.push("下载包动态注册页面与环境 hook");
    const before = Number(document.querySelector("[data-spike-count]")!.textContent);
    const checkpoint = JSON.parse(localStorage.getItem(CHECKPOINT) ?? "null");
    if (resume) assert(checkpoint && before === checkpoint.count, "计数器重启恢复失败");
    else {
      click("[data-spike-increment]");
      await until(
        () => Number(document.querySelector("[data-spike-count]")?.textContent) === before + 1,
        "计数器写入"
      );
    }
    checks.push(resume ? "页面计数在 WebView 重载后恢复" : "计数器写入私有存储");
    click("[data-spike-help]");
    await until(() => document.querySelector("[data-spike-dialog]"), "说明浮层");
    await delay(100);
    await runtime.navigator!.goBack(
      platform === "ios" ? "gesture" : platform === "android" ? "android" : "ui"
    );
    await until(() => !document.querySelector("[data-spike-dialog]"), "浮层返回");
    assert(
      runtime.navigator!.getActiveScreen()?.key === "spike-plugin-page",
      "返回错误地离开了页面"
    );
    checks.push("返回仲裁先关闭插件浮层");
    await delay(100);
    await runtime.navigator!.goBack("ui");
    await until(() => runtime.navigator!.getActiveScreen()?.key === "spike-home", "返回主页");
    click("[data-spike-open-editor]");
    await until(
      () => driver.editor && document.querySelector("[data-spike-editor]"),
      "编辑器初始化"
    );
    const abc = () =>
      driver.editor!.children.find(node => (node as { type: string }).type === "abc") as unknown as
        { content: string } | undefined;
    if (!abc()) {
      click("[data-spike-insert-menu]");
      await until(() => document.querySelector("[data-spike-insert-abc]"), "插件插入菜单");
      assert(
        document.querySelector(
          `[data-spike-insert-placement="${platform === "desktop" ? "toolbar-menu" : "touch-actions"}"]`
        ),
        "插入入口未适配"
      );
      click("[data-spike-insert-abc]");
      await until(abc, "ABC 插件节点插入");
      checks.push("使用插件 blockPanel 插入真实 ABC 节点");
    }
    const beforeSource = abc()!.content;
    if (resume) assert(beforeSource === checkpoint.source, "ABC 文档重启恢复失败");
    else {
      if (platform === "desktop") {
        document.dispatchEvent(new CustomEvent("preview-editor-focus", { detail: abc() }));
        await until(() => document.querySelector(".CodeMirror"), "桌面源码编辑器");
        const codeMirror = document.querySelector(".CodeMirror") as HTMLElement & {
          CodeMirror: { setValue(value: string): void };
        };
        codeMirror.CodeMirror.setValue(SOURCE);
      } else {
        click("[data-spike-edit-source]");
        await until(() => document.querySelector("[data-spike-source-input]"), "移动全屏源码编辑");
        const textarea = document.querySelector<HTMLTextAreaElement>("[data-spike-source-input]")!;
        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(
          textarea,
          SOURCE
        );
        textarea.dispatchEvent(new Event("input", { bubbles: true }));
      }
      await until(() => abc()?.content === SOURCE, "源码写入 Slate");
      if (platform !== "desktop") {
        await runtime.navigator!.goBack(platform === "ios" ? "gesture" : "android");
        await until(() => !document.querySelector("[data-spike-source-dialog]"), "源码面板返回");
        assert(
          runtime.navigator!.getActiveScreen()?.key === "spike-editor",
          "源码返回离开正文页面"
        );
      } else {
        [
          ...document.querySelectorAll<HTMLButtonElement>(
            '[data-spike-source-mode="desktop"] button'
          ),
        ]
          .find(button => button.textContent?.trim() === "完成")
          ?.click();
      }
      checks.push(
        platform === "desktop" ? "桌面源码组件修改同一 ABC 节点" : "移动源码面板修改与返回适配"
      );
      await delay(700);
      click("[data-spike-undo]");
      await until(() => abc()?.content === beforeSource, "源码撤销");
      click("[data-spike-redo]");
      await until(() => abc()?.content === SOURCE, "源码重做");
      checks.push("源码修改进入撤销与重做");
    }
    await until(() => document.querySelector("[data-tau-abc-preview] svg"), "ABC 实际 SVG 渲染");
    assert(
      driver.markdown!.getMarkdown(driver.editor!.children).includes("```abc"),
      "没有使用 ABC codec"
    );
    const restored = driver.markdown!.importFromMarkdown(
      driver.markdown!.getMarkdown(driver.editor!.children)
    );
    assert(
      restored.some(node => (node as { type: string }).type === "abc"),
      "ABC Markdown 往返失败"
    );
    checks.push("真实 abcjs 渲染 SVG 与 codec 往返");
    await until(
      () => (localStorage.getItem(DOCUMENT_KEY) ?? "").includes("Tau 跨端验证"),
      "文档持久化"
    );
    if (resume) {
      checks.push("下载包与 ABC 文档在 WebView 重载后恢复");
      return await report("passed");
    }
    localStorage.setItem(CHECKPOINT, JSON.stringify({ count: before + 1, source: SOURCE }));
    const result = await report("phase-one-passed");
    const next = new URL(location.href);
    next.searchParams.set("autotest", "1");
    next.searchParams.set("resume", "1");
    location.replace(next.href);
    return result;
  } catch (error) {
    return await report("failed", error);
  }
}
