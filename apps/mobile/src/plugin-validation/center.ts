import { invoke } from "@tauri-apps/api/core";
import type { QueryClient } from "@tanstack/react-query";
import type { MobilePluginRuntime } from "../app/plugins/runtime";
import { getMobileCenterInstallStore } from "../app/plugins/center-install";
import type { Navigator } from "../router/navigatorTypes";
import { readMobilePlugins, removeMobilePlugin, clearMobilePluginData } from "../services/plugins";
import { createQuickCard, getCardDetail } from "../services/tauri";
import { mobileMarkdown } from "../services/editorMarkdown";

const counter = "example.external-counter";
const abc = "tau.abc";
const phaseKey = "tau-center-validation-phase";
const checksKey = "tau-center-validation-checks";
const pause = (ms = 100) => new Promise(resolve => setTimeout(resolve, ms));
async function until<T>(
  read: () => T | false | null | undefined | Promise<T | false | null | undefined>,
  label: string
) {
  for (let index = 0; index < 600; index++) {
    const value = await read();
    if (value) return value;
    await pause();
  }
  throw new Error(`等待超时：${label}；${document.body.innerText.slice(-2200)}`);
}
const visible = (element: HTMLElement) => element.getClientRects().length > 0;
function button(text: string, scope: ParentNode = document) {
  return [...scope.querySelectorAll<HTMLButtonElement>("button")]
    .filter(element => {
      const label = element.textContent?.replace(/›/g, "").trim();
      return (
        (label === text || (text === "插件中心" && label?.startsWith(text))) &&
        !element.disabled &&
        visible(element)
      );
    })
    .at(-1);
}
const click = async (text: string, scope: ParentNode = document) =>
  (await until(() => button(text, scope), text)).click();
const item = async (id = counter) =>
  (await readMobilePlugins()).packages.find(value => value.id === id);

/** 显式验证构建专用；操作真实页面与原生命令，阶段间由宿主强停并重启应用。 */
export async function validateMobileCenter(
  runtime: MobilePluginRuntime,
  navigator: Navigator,
  database: string,
  client: QueryClient
) {
  const checks: string[] = JSON.parse(localStorage.getItem(checksKey) ?? "[]");
  const store = getMobileCenterInstallStore(client);
  const report = async (status: string, next?: string, error?: unknown) => {
    if (next) localStorage.setItem(phaseKey, next);
    localStorage.setItem(checksKey, JSON.stringify(checks));
    const value = {
      status,
      phase: localStorage.getItem(phaseKey),
      checks,
      error: error === undefined ? undefined : String(error),
      platform: runtime.environment.getSnapshot().platform,
      inventory: await readMobilePlugins(),
      at: new Date().toISOString(),
    };
    await invoke("plugin_kv_write", {
      database,
      pluginId: "validation.center",
      key: "report",
      value,
      remove: false,
    });
    console.log("[plugin-center-validation]", JSON.stringify(value));
  };
  const manager = async () => {
    navigator.push("plugins", { tab: "installed" });
    await click("已安装");
    await pause(300);
  };
  const row = async (id = counter) =>
    until(
      () =>
        [...document.querySelectorAll<HTMLElement>("[data-plugin-id]")].find(
          element => element.dataset.pluginId === id && visible(element)
        ),
      `已安装 ${id}`
    );
  const assertData = async () => {
    const count = await invoke<string | null>("plugin_kv_read", {
      database,
      pluginId: counter,
      key: "count",
    });
    if (count !== "1") throw new Error(`计数丢失：${count}`);
    const card = await getCardDetail(Number(localStorage.getItem("tau-center-validation-card")));
    if (!JSON.stringify(card).includes("Center saved")) throw new Error("ABC 正文丢失");
  };
  try {
    const phase = localStorage.getItem(phaseKey) ?? "clean";
    if (phase === "complete") return;
    if (phase === "clean") {
      await runtime.dispose();
      for (const id of [counter, abc]) {
        if (await item(id)) await removeMobilePlugin(id);
        await clearMobilePluginData(database, id);
      }
      checks.length = 0;
      await report("restart", "install");
      return;
    }
    if (phase === "install") {
      navigator.push("settings");
      await click("插件中心");
      await until(() => document.body.innerText.includes("商店"), "商店入口");
      for (const [id, version] of [
        [counter, "1.0.0"],
        [abc, "0.1.0"],
      ]) {
        navigator.push("pluginStoreDetail", { pluginId: id });
        await click(`安装 v${version}`);
        await until(() => document.body.innerText.includes("不需要额外权限"), "真实权限确认");
        await click(`安装 v${version}`);
        await click("完成");
        await manager();
        const card = await row(id);
        if (!card.textContent?.includes(`v${version} 将在下次打开应用时生效`))
          throw new Error("待生效版本展示缺失");
        await click("启用", card);
        await until(async () => (await item(id))?.enabled, "启用意图");
      }
      checks.push("本机平台商店、详情、权限确认、中心安装、真实待生效版本与启用意图");
      await report("restart", "baseline");
      return;
    }
    if (phase === "baseline") {
      if (!runtime.isPluginActive(counter) || !runtime.isPluginActive(abc))
        throw new Error("重启后插件未运行");
      navigator.push("settings");
      await click("计数器");
      await click("增加并保存");
      await until(() => document.body.innerText.includes("已保存计数：1"), "计数保存");
      await click("说明");
      await until(() => document.querySelector('[role="dialog"]'), "说明浮层");
      await navigator.goBack("android");
      await pause(300);
      if (document.querySelector('[role="dialog"]') || !button("增加并保存"))
        throw new Error("返回仲裁失败");
      const content = mobileMarkdown.importFromMarkdown(
        "```abc\nX:1\nT:Center\nM:4/4\nL:1/4\nK:C\nC D E F |\n```"
      );
      const card = await createQuickCard({ content, count: 0 });
      localStorage.setItem("tau-center-validation-card", String(card.id));
      navigator.push("contentDetail", { cardId: card.id });
      (
        await until(
          () =>
            [...document.querySelectorAll<HTMLButtonElement>("button")].find(
              element =>
                visible(element) &&
                element.textContent?.startsWith("编辑") &&
                element.textContent?.endsWith("源码")
            ),
          "ABC 编辑入口"
        )
      ).click();
      const mirror = await until(
        () =>
          (
            document.querySelector('[role="dialog"] .CodeMirror') as
              (HTMLElement & { CodeMirror?: { setValue(value: string): void } }) | null
          )?.CodeMirror,
        "源码编辑器"
      );
      mirror.setValue("X:1\nT:Center saved\nM:4/4\nL:1/4\nK:C\nG A B c |");
      await click("保存");
      await pause(1500);
      await assertData();
      if (
        String(mobileMarkdown.importFromMarkdown(mobileMarkdown.getMarkdown(content))[0].type) !==
        "abc"
      )
        throw new Error("ABC codec 失败");
      checks.push("真实进程重启、计数器 SQLite 持久化、Dialog 返回、ABC 正文编辑保存与 codec");
      await report("publish-update", "update");
      return;
    }
    if (phase === "update") {
      await manager();
      await click("更新到 v1.0.1", await row());
      await click("更新 v1.0.1");
      await until(() => store.getSnapshot().status === "pending", "下载开始");
      navigator.push("pluginStoreDetail", { pluginId: counter });
      navigator.push("pluginStoreDetail", { pluginId: abc });
      await until(() => store.getSnapshot().status !== "pending", "跨两层页面下载完成");
      if (store.getSnapshot().status !== "success")
        throw new Error(String(store.getSnapshot().error));
      const current = await item();
      if (current?.currentVersion !== "1.0.0" || current.pendingVersion !== "1.0.1")
        throw new Error("更新提前切换当前版本");
      await assertData();
      await manager();
      if (!(await row()).textContent?.includes("v1.0.1 将在下次打开应用时生效"))
        throw new Error("更新版本未展示");
      checks.push("已安装行更新、慢速下载跨两层页面继续、旧版本运行与新版本待生效分离");
      await report("publish-corrupt", "failure");
      return;
    }
    if (phase === "failure") {
      if ((await item())?.currentVersion !== "1.0.1") throw new Error("更新重启未生效");
      await assertData();
      await manager();
      await click("更新到 v1.0.2", await row());
      await click("更新 v1.0.2");
      await until(() => store.getSnapshot().status === "error", "损坏包被拒绝");
      await click("关闭");
      if (
        !button("重试", await row()) ||
        (await item())?.pending ||
        (await item())?.currentVersion !== "1.0.1"
      )
        throw new Error("失败未保留旧版本或缺重试");
      await assertData();
      checks.push("更新真实重启生效；篡改下载失败、旧版本与数据保留、单插件重试入口");
      await report("repair", "retry");
      // 保持同一应用会话，验证真实失败任务的重试。
      await until(async () => {
        try {
          const value = await invoke<{ status: string }>("plugin_center_request", {
            request: { kind: "release", releaseId: store.getSnapshot().releaseId },
          });
          return value && button("重试", await row());
        } catch {
          return false;
        }
      }, "失败任务保留");
      await pause(5000);
      await click("重试", await row());
      await until(() => store.getSnapshot().status === "pending", "重试下载");
      await click("取消下载", await row());
      await until(() => store.getSnapshot().status === "idle", "取消结束");
      if ((await item())?.pending) throw new Error("取消留下待生效包");
      await click("更新到 v1.0.2", await row());
      await click("更新 v1.0.2");
      await click("完成");
      await click("取消待生效更新", await row());
      await until(async () => !(await item())?.pending, "取消待生效");
      await assertData();
      checks.push("单插件失败重试、慢速下载显式取消、重新安装与取消待生效更新");
      await report("offline", "offline");
      return;
    }
    if (phase === "offline") {
      if (!runtime.isPluginActive(counter) || !runtime.isPluginActive(abc))
        throw new Error("离线丢失已验证插件");
      await assertData();
      await manager();
      await until(() => document.body.innerText.includes("发布状态未刷新"), "离线状态提示");
      checks.push("中心 TCP 不可达时真正重启，已验证插件与数据保留、状态陈旧提示");
      await report("online", "foreground");
      return;
    }
    if (phase === "foreground") {
      await assertData();
      await manager();
      if ((await item())?.statusStale) throw new Error("联网未恢复状态");
      await report("revoke-foreground");
      await until(
        () => !runtime.isPluginActive(counter) && !runtime.isPluginActive(abc),
        "系统回前台撤回停用"
      );
      if (runtime.elementSupport.get("abc") !== "none") throw new Error("撤回未禁止 ABC 写入");
      await until(() => document.body.innerText.includes("已撤回"), "撤回展示");
      await assertData();
      checks.push("联网恢复；系统后台/前台触发撤回刷新、页面停用、ABC 禁写和原文保留");
      await report("offline-revoked", "revoked");
      return;
    }
    if (phase === "revoked") {
      if (
        runtime.isPluginActive(counter) ||
        runtime.isPluginActive(abc) ||
        !(await item())?.blocked ||
        !(await item(abc))?.blocked
      )
        throw new Error("已撤回版本离线复活");
      await assertData();
      await manager();
      await until(
        () =>
          document.body.innerText.includes("已撤回") &&
          document.body.innerText.includes("发布状态未刷新"),
        "持久撤回状态"
      );
      checks.push("已确认撤回的版本在中心断网并重启后仍停用，私有数据和正文保留");
      await report("passed", "complete");
      return;
    }
    throw new Error(`未知验证阶段 ${phase}`);
  } catch (error) {
    await report("failed", undefined, error);
  }
}
