import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OverviewSection } from "../../components/OverviewSection";
import type { MobilePluginRuntime } from "../../../../app/plugins/runtime";
import { getNavigator } from "../../../../router";
import type { SettingCompat } from "../../../../types";
import {
  activePage,
  activeTitle,
  click,
  createTtsRuntime,
  deferred,
  findButton,
  makeAccount,
  makeSetting,
  mountTtsHarness,
  openPage,
  waitFor,
  type SettingState,
} from "./harness";

const native = vi.hoisted(() => ({
  create: vi.fn(),
  save: vi.fn(),
  rename: vi.fn(),
  deleteAccount: vi.fn(),
  addModel: vi.fn(),
  deleteModel: vi.fn(),
  select: vi.fn(),
}));
vi.mock("../../../../services/tts-settings", () => ({
  createTtsAccount: native.create,
  saveTtsConfig: native.save,
  renameTtsAccount: native.rename,
  deleteTtsAccount: native.deleteAccount,
  addTtsModel: native.addModel,
  deleteTtsModel: native.deleteModel,
  selectTtsUsage: native.select,
}));
const tts = vi.hoisted(() => ({ withSession: vi.fn() }));
vi.mock("../../../../services/plugin-tts", () => ({
  openMobilePluginTTS: vi.fn(),
  withMobilePluginTTS: tts.withSession,
}));
vi.mock("../../../../services/tauri", async importOriginal => ({
  ...(await importOriginal<object>()),
  getActiveDatabaseSize: vi.fn(async () => 0),
}));
vi.mock("../../about/appUpdate", () => ({
  useAutoUpdateCheck: () => undefined,
  useAppUpdate: (selector: (state: { check: null }) => unknown) => selector({ check: null }),
}));
vi.mock("../../about/useAppVersion", () => ({ useAppVersion: () => "1.0.0" }));

let runtime: MobilePluginRuntime;
let mounted: ReturnType<typeof mountTtsHarness> | null;

beforeEach(async () => {
  vi.clearAllMocks();
  window.history.replaceState(null, "");
  runtime = await createTtsRuntime();
  tts.withSession.mockImplementation(async (_runtime, _options, run) =>
    run({ info: { canClone: true }, voices: async () => [] })
  );
});

afterEach(async () => {
  mounted?.unmount();
  mounted = null;
  await runtime.dispose();
});

function installNative(state: SettingState) {
  native.create.mockImplementation(async (_database, pluginId, name) => ({
    ...state.current,
    ttsProviders: [
      ...(state.current.ttsProviders ?? []),
      makeAccount({
        id: `created-${native.create.mock.calls.length}`,
        pluginId,
        name,
        config: {},
        models: [],
      }),
    ],
  }));
  native.select.mockImplementation(async (_database, selection) => ({
    ...state.current,
    ttsUsageSettings: { default: selection },
  }));
}

describe("语音设置入口与账号添加", () => {
  it("我的页显示当前账号并进入 voice 模块", async () => {
    const state: SettingState = {
      current: makeSetting([makeAccount({ name: "工作账号" })], {
        providerId: "account-a",
        modelId: "model-a",
        voiceId: "voice-a",
      }),
    };
    installNative(state);
    const onOpenModule = vi.fn();
    mounted = mountTtsHarness(
      state,
      runtime,
      <OverviewSection activeResource="local" onOpenModule={onOpenModule} />
    );
    const row = findButton("语音合成");
    expect(row?.textContent).toContain("工作账号");
    await click(row);
    expect(onOpenModule).toHaveBeenCalledWith("voice");
  });

  it("空态只列真实启用插件，添加账号后进入配置且不改默认", async () => {
    const state: SettingState = { current: makeSetting() };
    installNative(state);
    mounted = mountTtsHarness(state, runtime);
    await openPage("settingsModule", { module: "voice" });
    await waitFor(() => activeTitle() === "语音");
    expect(activePageText()).toContain("还没有语音服务");
    expect(activePageText()).toContain("Fixture Voice");

    await click(findButton("配置语音插件", activePage()));
    await click(findButton("Fixture Voice"));
    await waitFor(() => activeTitle() === "Fixture Voice");
    expect(native.create).not.toHaveBeenCalled();
    await click(findButton("添加账号", activePage()));
    await waitFor(() => activeTitle() === "Fixture Voice");
    expect(native.create).toHaveBeenCalledWith("data.db", "fixture.tts", "Fixture Voice");
    expect(state.current.ttsProviders).toHaveLength(1);
    expect(state.current.ttsUsageSettings?.default).toBeNull();
    expect(native.select).not.toHaveBeenCalled();
  });

  it("没有可用插件时保留真实插件中心入口", async () => {
    await runtime.host.disable("fixture.tts");
    const state: SettingState = { current: makeSetting() };
    installNative(state);
    mounted = mountTtsHarness(state, runtime);
    await openPage("settingsModule", { module: "voice" });
    await waitFor(() => activeTitle() === "语音");
    expect(activePageText()).not.toContain("MiniMax");
    expect(findButton("配置语音插件", activePage())).toBeNull();
    await click(findButton("去插件中心", activePage()));
    await waitFor(() => document.body.textContent?.includes("插件中心") ?? false);
  });

  it("只有显式选择账号才写入当前服务", async () => {
    const state: SettingState = { current: makeSetting([makeAccount()]) };
    installNative(state);
    mounted = mountTtsHarness(state, runtime);
    await openPage("settingsModule", { module: "voice" });
    await waitFor(() => activeTitle() === "语音");
    expect(native.select).not.toHaveBeenCalled();
    await click(findButton("未设置", activePage()));
    const options = [...document.querySelectorAll("button")].filter(node =>
      node.textContent?.includes("测试账号")
    );
    await click(options.at(-1) as HTMLElement);
    await waitFor(() => state.current.ttsUsageSettings?.default?.providerId === "account-a");
    expect(native.select).toHaveBeenCalledWith("data.db", {
      providerId: "account-a",
      modelId: "model-a",
      voiceId: "",
    });
  });

  it("同插件同名多账号按实例选择，不依赖显示名称", async () => {
    const state: SettingState = {
      current: makeSetting([
        makeAccount(),
        makeAccount({ id: "account-b", models: [{ id: "model-b" }] }),
      ]),
    };
    installNative(state);
    mounted = mountTtsHarness(state, runtime);
    await openPage("settingsModule", { module: "voice" });
    await waitFor(() => activeTitle() === "语音");
    await click(findButton("未设置", activePage()));
    await click(findButton("测试账号（account-b）"));
    await waitFor(() => state.current.ttsUsageSettings?.default?.providerId === "account-b");
    expect(native.select).toHaveBeenCalledWith("data.db", {
      providerId: "account-b",
      modelId: "model-b",
      voiceId: "",
    });
  });

  it("添加响应在页面退出后到达只合并数据，不自动压入账号页", async () => {
    const state: SettingState = { current: makeSetting() };
    installNative(state);
    const pending = deferred<SettingCompat>();
    const saved = {
      ...state.current,
      ttsProviders: [makeAccount({ id: "created-late", name: "迟到账号", config: {}, models: [] })],
    };
    native.create.mockReturnValue(pending.promise);
    mounted = mountTtsHarness(state, runtime);
    await openPage("settingsModule", { module: "voice" });
    await click(findButton("配置语音插件", activePage()));
    await click(findButton("Fixture Voice"));
    await waitFor(() => activeTitle() === "Fixture Voice");
    expect(native.create).not.toHaveBeenCalled();
    await click(findButton("添加账号", activePage()));
    await waitFor(() => native.create.mock.calls.length === 1);
    await act(async () => {
      getNavigator().replace("settingsModule", { module: "resource" });
      await Promise.resolve();
    });
    await waitFor(() => activeTitle() === "图片与附件");
    pending.resolve(saved);
    await act(async () => {
      await pending.promise;
      await Promise.resolve();
    });
    await waitFor(() => state.current.ttsProviders?.length === 1);
    expect(activeTitle()).toBe("图片与附件");
    expect(getNavigator().getActiveScreen()?.key).toBe("settingsModule");
  });

  it("A 添加响应晚于 B loadSetting 时不覆盖 B，也不自动导航", async () => {
    const state: SettingState = { current: makeSetting() };
    installNative(state);
    const pending = deferred<SettingCompat>();
    const saved = {
      ...state.current,
      ttsProviders: [makeAccount({ id: "created-a", name: "A 迟到账号" })],
    };
    native.create.mockReturnValue(pending.promise);
    mounted = mountTtsHarness(state, runtime);
    await openPage("settingsModule", { module: "voice" });
    await click(findButton("配置语音插件", activePage()));
    await click(findButton("Fixture Voice"));
    await waitFor(() => activeTitle() === "Fixture Voice");
    expect(native.create).not.toHaveBeenCalled();
    await click(findButton("添加账号", activePage()));
    await waitFor(() => native.create.mock.calls.length === 1);
    const next = makeSetting([makeAccount({ id: "account-b", name: "B 账号" })]);
    next.database.active = "B.db";
    next.sync = { ...next.sync, plugin: { id: "sync-b", configurations: {} } };
    next.imageBed = {
      ...next.imageBed,
      active: "plugin",
      plugin: { id: "upload-b", configurations: {} },
    };
    const loadSetting = state.loadSetting;
    if (!loadSetting) throw new Error("缺少 loadSetting 夹具");
    await act(async () => {
      loadSetting(next);
      await Promise.resolve();
    });
    pending.resolve(saved);
    await act(async () => {
      await pending.promise;
      await Promise.resolve();
    });
    expect(state.current).toBe(next);
    expect(state.current.database.active).toBe("B.db");
    expect(state.current.sync.plugin?.id).toBe("sync-b");
    expect(state.current.imageBed.plugin?.id).toBe("upload-b");
    expect(activeTitle()).toBe("Fixture Voice");
    expect(getNavigator().getActiveScreen()?.key).toBe("pluginSettings");
  });
});

function activePageText(): string {
  return document.querySelector('[data-page-active="true"]')?.textContent ?? "";
}
