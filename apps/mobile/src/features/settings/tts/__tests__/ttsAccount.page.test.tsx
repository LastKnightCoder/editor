import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PluginSettingsProps } from "@tau/plugins";
import type { MobilePluginRuntime } from "../../../../app/plugins/runtime";
import { getNavigator } from "../../../../router";
import type { SettingCompat, TTSModelSetting } from "../../../../types";
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
  setInputValue,
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

function AuthorSettings({ ttsConfig }: PluginSettingsProps) {
  if (!ttsConfig) return <p>缺少账号上下文</p>;
  return (
    <div data-testid="tts-author-form">
      <span>
        作者设置 · {ttsConfig.instanceId} · {ttsConfig.models.length} 个模型
      </span>
      <button
        type="button"
        onClick={() =>
          void ttsConfig.save({ apiKey: "new-secret", baseUrl: "https://api.example.com" }, [
            { id: "model-b", label: "作者模型" },
          ])
        }
      >
        作者保存
      </button>
    </div>
  );
}

let runtime: MobilePluginRuntime;
let mounted: ReturnType<typeof mountTtsHarness> | null;

beforeEach(async () => {
  vi.clearAllMocks();
  window.history.replaceState(null, "");
  runtime = await createTtsRuntime(AuthorSettings);
});

afterEach(async () => {
  mounted?.unmount();
  mounted = null;
  await runtime.dispose();
});

function installNative(state: SettingState) {
  native.save.mockImplementation(
    async (_database, instanceId, _pluginId, config, models: TTSModelSetting[]) => ({
      ...state.current,
      ttsProviders: state.current.ttsProviders?.map(account =>
        account.id === instanceId ? { ...account, config, models } : account
      ),
    })
  );
  native.rename.mockImplementation(async (_database, instanceId, name) => ({
    ...state.current,
    ttsProviders: state.current.ttsProviders?.map(account =>
      account.id === instanceId ? { ...account, name } : account
    ),
  }));
  native.select.mockImplementation(async (_database, selection) => ({
    ...state.current,
    ttsUsageSettings: { default: selection },
  }));
  native.addModel.mockImplementation(async (_database, instanceId, model) => ({
    ...state.current,
    ttsProviders: state.current.ttsProviders?.map(account =>
      account.id === instanceId ? { ...account, models: [...account.models, model] } : account
    ),
  }));
  native.deleteModel.mockImplementation(async (_database, instanceId, modelId) => {
    const providers = state.current.ttsProviders?.map(account =>
      account.id === instanceId
        ? { ...account, models: account.models.filter(model => model.id !== modelId) }
        : account
    );
    const usage = state.current.ttsUsageSettings?.default;
    const affected = providers?.find(account => account.id === instanceId);
    const nextUsage =
      usage && usage.providerId === instanceId && usage.modelId === modelId
        ? affected?.models.length
          ? { ...usage, modelId: affected.models[0].id, voiceId: "" }
          : null
        : usage;
    return {
      ...state.current,
      ttsProviders: providers,
      ttsUsageSettings: { default: nextUsage ?? null },
    };
  });
  native.deleteAccount.mockImplementation(async (_database, instanceId) => ({
    ...state.current,
    ttsProviders: state.current.ttsProviders?.filter(account => account.id !== instanceId),
    ttsUsageSettings: {
      default:
        state.current.ttsUsageSettings?.default?.providerId === instanceId
          ? null
          : (state.current.ttsUsageSettings?.default ?? null),
    },
  }));
}

describe("TTS 账号与模型页面", () => {
  it("向作者组件传完整实例配置并合并原生保存快照", async () => {
    const state: SettingState = { current: makeSetting([makeAccount()]) };
    installNative(state);
    mounted = mountTtsHarness(state, runtime);
    await openPage("ttsAccount", { instanceId: "account-a" });
    await waitFor(() => activeTitle() === "测试账号");
    expect(document.body.textContent).toContain("作者设置 · account-a · 1 个模型");
    expect(native.select).not.toHaveBeenCalled();

    await click(findButton("作者保存"));
    await waitFor(() =>
      Boolean(
        state.current.ttsProviders?.[0].config &&
        typeof state.current.ttsProviders[0].config === "object" &&
        !Array.isArray(state.current.ttsProviders[0].config) &&
        state.current.ttsProviders[0].config.apiKey === "new-secret"
      )
    );
    expect(native.save).toHaveBeenCalledWith(
      "data.db",
      "account-a",
      "fixture.tts",
      { apiKey: "new-secret", baseUrl: "https://api.example.com" },
      [{ id: "model-b", label: "作者模型" }]
    );
    expect(state.current.ttsProviders?.[0].models).toEqual([{ id: "model-b", label: "作者模型" }]);

    const nameInput = document.querySelector<HTMLInputElement>("#tts-account-name")!;
    await setInputValue(nameInput, "  工作账号  ");
    await click(findButton("保存名称", activePage()));
    await waitFor(() => state.current.ttsProviders?.[0].name === "工作账号");
    expect(native.rename).toHaveBeenCalledWith("data.db", "account-a", "工作账号");

    await click(findButton("设为当前语音服务", activePage()));
    await waitFor(() => state.current.ttsUsageSettings?.default?.providerId === "account-a");
    expect(native.select).toHaveBeenCalledWith("data.db", {
      providerId: "account-a",
      modelId: "model-b",
      voiceId: "",
    });
  });

  it("声明式账号表单显式保存，失败保留草稿且不改模型或默认服务", async () => {
    await runtime.dispose();
    runtime = await createTtsRuntime({
      groups: [{ title: "连接", fields: [{ key: "apiKey", label: "API Key", type: "secret" }] }],
    });
    const state: SettingState = { current: makeSetting([makeAccount()]) };
    installNative(state);
    mounted = mountTtsHarness(state, runtime);
    await openPage("ttsAccount", { instanceId: "account-a" });
    await waitFor(() => activeTitle() === "测试账号");
    const input = document.querySelector<HTMLInputElement>('input[aria-label="API Key"]');
    if (!input) throw new Error("缺少声明式表单字段");
    await setInputValue(input, "updated-secret");
    expect(native.save).not.toHaveBeenCalled();
    native.save.mockRejectedValueOnce(new Error("保存失败"));
    await click(findButton("保存配置", activePage()));
    await waitFor(() => activePage()?.textContent?.includes("保存失败") ?? false);
    expect(state.current.ttsProviders?.[0].config).toEqual({ apiKey: "super-secret-key" });
    expect(input.value).toBe("updated-secret");
    await click(findButton("保存配置", activePage()));
    await waitFor(() => activePage()?.textContent?.includes("配置已保存") ?? false);
    expect(native.save).toHaveBeenLastCalledWith(
      "data.db",
      "account-a",
      "fixture.tts",
      { apiKey: "updated-secret" },
      [{ id: "model-a" }]
    );
    expect(state.current.ttsUsageSettings?.default).toBeNull();
    expect(native.select).not.toHaveBeenCalled();
  });

  it("停用插件后保留配置并隐藏作者表单", async () => {
    const state: SettingState = { current: makeSetting([makeAccount()]) };
    installNative(state);
    const before = JSON.stringify(state.current.ttsProviders);
    mounted = mountTtsHarness(state, runtime);
    await openPage("ttsAccount", { instanceId: "account-a" });
    await waitFor(() => Boolean(document.querySelector('[data-testid="tts-author-form"]')));
    await act(async () => {
      await runtime.host.disable("fixture.tts");
    });
    await waitFor(() => !document.querySelector('[data-testid="tts-author-form"]'));
    expect(activePage()?.textContent).toContain("已保存的账号、模型与当前选择仍然保留");
    expect(findButton("去插件中心启用", activePage())).toBeTruthy();
    expect(JSON.stringify(state.current.ttsProviders)).toBe(before);
  });

  it("添加与删除模型使用原生快照，最后一个模型删除后清空当前选择", async () => {
    const state: SettingState = {
      current: makeSetting([makeAccount()], {
        providerId: "account-a",
        modelId: "model-a",
        voiceId: "voice-a",
      }),
    };
    installNative(state);
    mounted = mountTtsHarness(state, runtime);
    await openPage("ttsModels", { instanceId: "account-a" });
    await waitFor(() => activeTitle() === "管理模型");
    await setInputValue(
      document.querySelector<HTMLInputElement>("#tts-custom-model")!,
      " model-b "
    );
    await click(findButton("添加模型", activePage()));
    await waitFor(() => state.current.ttsProviders?.[0].models.length === 2);
    expect(native.addModel).toHaveBeenCalledWith("data.db", "account-a", { id: "model-b" });

    await click(document.querySelector<HTMLElement>('[aria-label="删除模型 model-a"]'));
    await waitFor(() => state.current.ttsUsageSettings?.default?.modelId === "model-b");
    expect(state.current.ttsUsageSettings?.default?.voiceId).toBe("");
    await click(document.querySelector<HTMLElement>('[aria-label="删除模型 model-b"]'));
    await waitFor(() => state.current.ttsUsageSettings?.default === null);
    expect(native.deleteModel).toHaveBeenLastCalledWith("data.db", "account-a", "model-b");
  });

  it("删除账号必须经移动确认框，并合并清空后的快照", async () => {
    const state: SettingState = {
      current: makeSetting([makeAccount()], {
        providerId: "account-a",
        modelId: "model-a",
        voiceId: "voice-a",
      }),
    };
    installNative(state);
    mounted = mountTtsHarness(state, runtime);
    await openPage("ttsAccount", { instanceId: "account-a" });
    await click(findButton("删除此账号", activePage()));
    expect(document.body.textContent).toContain("删除「测试账号」？");
    expect(native.deleteAccount).not.toHaveBeenCalled();
    const confirm = [...document.querySelectorAll("button")].find(
      node => node.textContent === "删除"
    );
    await click(confirm as HTMLElement);
    await waitFor(() => state.current.ttsProviders?.length === 0);
    expect(native.deleteAccount).toHaveBeenCalledWith("data.db", "account-a");
    expect(state.current.ttsUsageSettings?.default).toBeNull();
  });

  it("删除响应在页面退出后到达只合并数据，不误弹当前页", async () => {
    const state: SettingState = {
      current: makeSetting([makeAccount()], {
        providerId: "account-a",
        modelId: "model-a",
        voiceId: "voice-a",
      }),
    };
    installNative(state);
    const pending = deferred<SettingCompat>();
    const saved = { ...state.current, ttsProviders: [], ttsUsageSettings: { default: null } };
    native.deleteAccount.mockReturnValue(pending.promise);
    mounted = mountTtsHarness(state, runtime);
    await openPage("ttsAccount", { instanceId: "account-a" });
    await click(findButton("删除此账号", activePage()));
    const confirm = [...document.querySelectorAll("button")].find(
      node => node.textContent === "删除"
    );
    await click(confirm as HTMLElement);
    await waitFor(() => native.deleteAccount.mock.calls.length === 1);
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
    await waitFor(() => state.current.ttsProviders?.length === 0);
    expect(activeTitle()).toBe("图片与附件");
    expect(getNavigator().getActiveScreen()?.key).toBe("settingsModule");
  });

  it("A 删除响应晚于 B loadSetting 时不覆盖 B，也不弹页面", async () => {
    const state: SettingState = { current: makeSetting([makeAccount()]) };
    installNative(state);
    const pending = deferred<SettingCompat>();
    const saved = { ...state.current, ttsProviders: [], ttsUsageSettings: { default: null } };
    native.deleteAccount.mockReturnValue(pending.promise);
    mounted = mountTtsHarness(state, runtime);
    await openPage("ttsAccount", { instanceId: "account-a" });
    await click(findButton("删除此账号", activePage()));
    const confirm = [...document.querySelectorAll("button")].find(
      node => node.textContent === "删除"
    );
    await click(confirm as HTMLElement);
    await waitFor(() => native.deleteAccount.mock.calls.length === 1);
    const next = makeSetting([makeAccount({ id: "account-b", name: "B 账号" })]);
    next.database.active = "B.db";
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
    expect(getNavigator().getActiveScreen()?.key).toBe("ttsAccount");
  });
});
