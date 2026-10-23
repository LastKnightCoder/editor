import { invoke } from "@tauri-apps/api/core";
import type { MobilePluginRuntime } from "@/app/plugins/runtime";
import type { Navigator } from "@/router/navigatorTypes";
import {
  installMobilePlugin,
  setMobilePluginEnabled,
  applyPendingMobilePlugins,
  readDevelopmentPluginSource,
  MOBILE_PLUGIN_CAPABILITIES,
  type PluginInstallSource,
} from "@/services/plugins";
import { createQuickCard, getCardDetail } from "@/services/tauri";
import { mobileMarkdown } from "@/services/editorMarkdown";

declare const __TAU_PLUGIN_VALIDATION_SOURCES__: PluginInstallSource[];
declare const __TAU_PLUGIN_VALIDATION_SOURCE_URL__: string;
declare const __TAU_PLUGIN_VALIDATION_SUITE__: string;
const key = "tau-portability-validation-phase";
const pause = (milliseconds = 100) => new Promise(resolve => setTimeout(resolve, milliseconds));
async function until<T>(read: () => T | undefined | null | false): Promise<T> {
  for (let count = 0; count < 150; count++) {
    const result = read();
    if (result) return result;
    await pause();
  }
  throw new Error("等待真实界面状态超时");
}
function button(label: string) {
  return [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    element =>
      element.textContent?.trim() === label &&
      !element.disabled &&
      element.getClientRects().length > 0
  );
}

/** 仅由显式验证构建调用，使用正常 AppShell、路由、SQLite 和正文页面。 */
export async function validateMobileHost(
  runtime: MobilePluginRuntime,
  navigator: Navigator,
  database: string
) {
  const checks: string[] = [];
  let sources = __TAU_PLUGIN_VALIDATION_SOURCES__;
  const report = async (status: string, error?: unknown) => {
    const value = {
      status,
      checks,
      error: error === undefined ? undefined : String(error),
      platform: runtime.environment.getSnapshot().platform,
      sources,
      at: new Date().toISOString(),
    };
    await invoke("plugin_kv_write", {
      database,
      pluginId: "validation.host",
      key: "report",
      value,
      remove: false,
    });
    console.log("[plugin-validation]", JSON.stringify(value));
  };
  try {
    const config = await invoke<{ host: { capabilities: string[] } }>("plugin_center_config");
    if (
      JSON.stringify([...config.host.capabilities].sort()) !==
      JSON.stringify([...MOBILE_PLUGIN_CAPABILITIES].sort())
    )
      throw new Error("原生中心与编辑器运行时的能力声明不一致");
    checks.push("原生中心选版与编辑器运行时共用能力清单");
    if (__TAU_PLUGIN_VALIDATION_SOURCE_URL__) {
      const response = await fetch(__TAU_PLUGIN_VALIDATION_SOURCE_URL__);
      if (!response.ok) throw new Error(`读取验证包清单失败：${response.status}`);
      const values: unknown = await response.json();
      if (!Array.isArray(values)) throw new Error("验证包清单必须是数组");
      sources = values.map(value => readDevelopmentPluginSource(JSON.stringify(value)));
    }
    if (!localStorage.getItem(key)) {
      for (const source of sources)
        await installMobilePlugin(source, runtime.environment.getSnapshot(), runtime.appVersion);
      await applyPendingMobilePlugins();
      for (const source of sources) await setMobilePluginEnabled(source.id, true);
      localStorage.setItem(key, "installed");
      window.location.reload();
      return;
    }
    if (localStorage.getItem(key) === "complete") return;
    if (runtime.errors.size) throw new Error(JSON.stringify([...runtime.errors]));
    if (__TAU_PLUGIN_VALIDATION_SUITE__ === "editors") {
      const { validateEditorPlugins } = await import("./editors");
      await validateEditorPlugins(runtime, navigator, database);
      return;
    }
    if (__TAU_PLUGIN_VALIDATION_SUITE__ !== "basic") throw new Error("未知验证套件");
    navigator.push("settings");
    (await until(() => button("计数器")))?.click();
    const increment = await until(() => button("增加并保存"));
    increment.click();
    await until(() => document.body.textContent?.includes("已保存计数：1"));
    checks.push("我的语义入口、真实页面、SQLite 计数保存");
    (await until(() => button("说明"))).click();
    await until(() => document.querySelector('[role="dialog"]'));
    await navigator.goBack("android");
    await pause(300);
    if (document.querySelector('[role="dialog"]')) throw new Error("返回未关闭标准 Dialog");
    if (!button("增加并保存")) throw new Error("关闭浮层时误退页面");
    checks.push("标准 Dialog 返回仲裁");
    await navigator.goBack("ui");
    const content = mobileMarkdown.importFromMarkdown(
      "```abc\nX:1\nT:Portable\nM:4/4\nL:1/4\nK:C\nC D E F |\n```"
    );
    const created = await createQuickCard({ content, count: 0 });
    navigator.push("contentDetail", { cardId: created.id });
    await until(() => button("编辑") || button("完成"));
    button("编辑")?.click();
    (
      await until(
        () =>
          button("编辑ABC 乐谱源码") ||
          button("编辑乐谱源码") ||
          [...document.querySelectorAll<HTMLButtonElement>("button")].find(
            element =>
              element.textContent?.startsWith("编辑") && element.textContent?.endsWith("源码")
          )
      )
    ).click();
    const mirror = await until(
      () =>
        (
          document.querySelector('[role="dialog"] .CodeMirror') as
            (HTMLElement & { CodeMirror?: { setValue(value: string): void } }) | null
        )?.CodeMirror
    );
    mirror.setValue("X:1\nT:Portable saved\nM:4/4\nL:1/4\nK:C\nG A B c |");
    (await until(() => button("保存"))).click();
    await pause(1500);
    const persisted = await getCardDetail(created.id);
    if (!JSON.stringify(persisted).includes("Portable saved"))
      throw new Error("正常正文没有保存源码修改");
    checks.push("正常正文 ABC 渲染、公共 CodeMirror 编辑、保存往返");
    const roundTrip = mobileMarkdown.importFromMarkdown(mobileMarkdown.getMarkdown(content));
    if (String(roundTrip[0].type) !== "abc") throw new Error("ABC codec 往返失败");
    checks.push("同一静态快照的 Markdown codec");
    localStorage.setItem(key, "complete");
    await report("passed");
  } catch (error) {
    await report("failed", error);
  }
}
