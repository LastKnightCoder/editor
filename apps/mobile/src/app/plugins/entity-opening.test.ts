import { afterEach, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { createMemoryStorage } from "@tau/plugins/host";
import { createPluginEnvironmentStore } from "@tau/plugins/environment-host";
import { definePlugin, type PluginContext, type PluginOwnEntity } from "@tau/plugins";
import { MobilePluginRuntime } from "./runtime";
import { createMobileApp } from "./app";
import type { MobileOwnData } from "./own-data";
import type { MobilePluginEntityTarget } from "./app-types";
import {
  installMobileEntityHost,
  openMobilePluginEntity,
  isMobileEntityMentionable,
} from "../../services/pluginEntities";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
const target: MobilePluginEntityTarget = {
  kind: "plugin-entity",
  id: 7,
  pluginId: "owner.plugin",
  entityKind: "note",
  createdAt: 10,
  contentId: 8,
  contentCreatedAt: 11,
  title: "内容",
  label: "笔记",
  icon: "",
};
const entity: PluginOwnEntity = {
  id: "7",
  kind: "note",
  key: "key",
  title: "内容",
  contentRef: "8:11",
  meta: { private: "不能交给调用方" },
  createdAt: 10,
  updatedAt: 12,
  revision: "12",
};
const runtimes: MobilePluginRuntime[] = [];
async function fixture() {
  const push = vi.fn();
  const runtime = new MobilePluginRuntime(
    createPluginEnvironmentStore({
      platform: "ios",
      input: { coarsePointer: true, finePointer: false },
    }),
    createMemoryStorage(),
    "one.db",
    { push },
    "0.2.13"
  );
  runtimes.push(runtime);
  const get = vi.fn(async () => entity);
  const params = vi.fn((value: PluginOwnEntity) => ({ entityId: value.id }));
  runtime.own = {
    entities: { get, registerKind: () => ({ dispose: vi.fn() }) },
    dispose: vi.fn(),
  } as unknown as MobileOwnData;
  runtime.host.registerTrusted(
    definePlugin({
      id: target.pluginId,
      name: "拥有者",
      version: "1",
      create: () => ({
        activate(context) {
          context.pages.register({
            id: "detail",
            title: "实体页",
            match: "params",
            getId: values => String(values.entityId),
            component: () => null,
          });
          context.entities.registerKind({
            kind: "note",
            label: "笔记",
            mentionable: true,
            open: { page: "detail", params },
          });
        },
      }),
    })
  );
  await runtime.host.enable(target.pluginId);
  return { runtime, push, get, params };
}
afterEach(async () => {
  await Promise.all(runtimes.splice(0).map(runtime => runtime.dispose()));
  vi.unstubAllGlobals();
  vi.mocked(invoke).mockReset();
});

it("打开使用拥有者注册与私有实体，定位不改变页面实例身份", async () => {
  const { runtime, push, params } = await fixture();
  await runtime.openEntityTarget(target, JSON.stringify({ block: 2 }));
  await runtime.openEntityTarget(target, JSON.stringify({ taskId: "task" }));
  expect(params).toHaveBeenCalledWith(entity);
  expect(push.mock.calls.map(call => call[1]?.instance)).toEqual(["7", "7"]);
  expect(push.mock.calls[1]?.[0]).toBe("pluginPage");
  expect(push.mock.calls[1]?.[1]).toMatchObject({ id: "owner.plugin:detail", instance: "7" });
  expect(JSON.parse(push.mock.calls[1]?.[1]?.params)).toEqual({
    entityId: "7",
    at: JSON.stringify({ taskId: "task" }),
  });
});

it("创建身份或正文身份变化不能打开同编号的新内容", async () => {
  const { runtime, push, get } = await fixture();
  get.mockResolvedValueOnce({ ...entity, createdAt: 99 });
  await expect(runtime.openEntityTarget(target)).rejects.toThrow("身份已变化");
  get.mockResolvedValueOnce({ ...entity, contentRef: "9:12" });
  await expect(runtime.openEntityTarget(target)).rejects.toThrow("身份已变化");
  expect(push).not.toHaveBeenCalled();
});

it("调用插件停用期间的拥有者读取完成后不再导航", async () => {
  vi.stubGlobal("navigator", { userActivation: { isActive: true } });
  const { runtime, push, get } = await fixture();
  runtime.app = createMobileApp(
    "one.db",
    "token",
    { push },
    async () => false,
    (value, options, guard) =>
      runtime.openEntityTarget(value, options.at ? JSON.stringify(options.at) : undefined, guard)
  );
  vi.mocked(invoke).mockResolvedValue(target);
  let caller!: PluginContext;
  runtime.host.registerTrusted(
    definePlugin({
      id: "caller.plugin",
      name: "调用者",
      version: "1",
      create: () => ({
        activate(value) {
          caller = value;
        },
      }),
    })
  );
  await runtime.host.enable("caller.plugin");
  let finish!: (value: PluginOwnEntity) => void;
  get.mockImplementationOnce(
    () =>
      new Promise(resolve => {
        finish = resolve;
      })
  );
  const opened = caller.app.open({ kind: "plugin-entity", id: "7" });
  const rejected = expect(opened).rejects.toThrow();
  await vi.waitFor(() => expect(get).toHaveBeenCalled());
  await runtime.host.disable("caller.plugin");
  finish(entity);
  await rejected;
  expect(push).not.toHaveBeenCalled();
});

it("宿主切换后旧打开请求失效，停用立即撤销mentionable", async () => {
  const { runtime, push, get } = await fixture();
  runtime.app = createMobileApp("one.db", "token", { push }, async () => false);
  vi.mocked(invoke).mockResolvedValue(target);
  const stop = installMobileEntityHost(runtime);
  expect(isMobileEntityMentionable(target.pluginId, "note")).toBe(true);
  let finish!: (value: PluginOwnEntity) => void;
  get.mockImplementationOnce(
    () =>
      new Promise(resolve => {
        finish = resolve;
      })
  );
  const opened = openMobilePluginEntity(7, { expectedContentId: 8, expectedCreatedAt: 10 });
  const rejected = expect(opened).rejects.toThrow("工作区已切换");
  await vi.waitFor(() => expect(get).toHaveBeenCalled());
  stop();
  finish(entity);
  await rejected;
  expect(push).not.toHaveBeenCalled();
  const cleanup = installMobileEntityHost(runtime);
  await runtime.host.disable(target.pluginId);
  expect(isMobileEntityMentionable(target.pluginId, "note")).toBe(false);
  cleanup();
});
