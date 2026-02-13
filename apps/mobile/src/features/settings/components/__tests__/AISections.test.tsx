import { act, useEffect, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { SettingCompat } from "../../../../types";
import {
  AIEmbeddingApiSection,
  AILlmConfigsSection,
  AILlmUsageSection,
} from "../AISections";
import type { SettingsPageProps } from "../types";

type SectionType = "llm-configs" | "llm-usage" | "embedding";

type UpdateSetting = SettingsPageProps["updateSetting"];

type HarnessProps = {
  section: SectionType;
  initialSetting: SettingCompat;
  onSnapshot: (setting: SettingCompat) => void;
  onUpdate: (
    options: Parameters<UpdateSetting>[1] | undefined,
    setting: SettingCompat,
  ) => void;
};

function createBaseSetting(overrides?: Record<string, unknown>): SettingCompat {
  const base: SettingCompat = {
    database: {
      active: "data.db",
      databases: [],
    },
    imageBed: {
      active: "github",
      enableCompression: false,
      github: {
        repo: "",
        branch: "",
        cdn: null,
        pathPrefix: "",
      },
      aliOSS: {
        bucket: "",
        region: "",
        pathPrefix: "",
      },
      local: {
        path: "resources",
      },
      s3: {
        bucket: "",
        region: "",
        pathPrefix: "",
      },
      webdav: {
        pathPrefix: "",
      },
    },
    sync: {
      active: "aliOSS",
      webdav: {
        pathPrefix: "",
      },
      aliOSS: {
        bucket: "",
        region: "",
        path: "/",
      },
      s3: {
        bucket: "",
        region: "",
        pathPrefix: "",
      },
      github: {
        repo: "",
        branch: "",
        pathPrefix: "",
      },
    },
    integration: {
      github: {
        token: "",
        user: {
          name: "",
          email: "",
        },
      },
      s3: {
        accessKeyId: "",
        secretAccessKey: "",
        endpoint: "",
        urlStyle: "path",
      },
      webdav: {
        url: "",
        username: "",
        password: "",
      },
      aliOSS: {
        accessKeyId: "",
        accessKeySecret: "",
      },
    },
  };
  if (!overrides) {
    return base;
  }
  return {
    ...base,
    ...(overrides as SettingCompat),
  };
}

function Harness(props: HarnessProps) {
  const [setting, setSetting] = useState(props.initialSetting);

  useEffect(() => {
    props.onSnapshot(setting);
  }, [props, setting]);

  const updateSetting: UpdateSetting = (updater, options) => {
    setSetting((prev) => {
      const next = updater(prev);
      props.onUpdate(options, next);
      return next;
    });
  };

  if (props.section === "llm-configs") {
    return (
      <AILlmConfigsSection
        safeSetting={setting}
        updateSetting={updateSetting}
      />
    );
  }
  if (props.section === "llm-usage") {
    return (
      <AILlmUsageSection safeSetting={setting} updateSetting={updateSetting} />
    );
  }
  return (
    <AIEmbeddingApiSection
      safeSetting={setting}
      updateSetting={updateSetting}
    />
  );
}

type Controller = {
  render: (
    props: Omit<HarnessProps, "onSnapshot" | "onUpdate">,
  ) => Promise<void>;
  latest: () => SettingCompat | null;
  updates: () => Array<Parameters<UpdateSetting>[1] | undefined>;
  cleanup: () => Promise<void>;
};

function createController(): Controller {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root: Root = createRoot(host);
  let latestSetting: SettingCompat | null = null;
  const updateOptions: Array<Parameters<UpdateSetting>[1] | undefined> = [];

  return {
    render: async (props) => {
      await act(async () => {
        root.render(
          <Harness
            {...props}
            onSnapshot={(setting) => {
              latestSetting = setting;
            }}
            onUpdate={(options) => {
              updateOptions.push(options);
            }}
          />,
        );
      });
      await act(async () => {
        await Promise.resolve();
      });
    },
    latest: () => latestSetting,
    updates: () => updateOptions,
    cleanup: async () => {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    },
  };
}

function findButtonByText(text: string): HTMLButtonElement | null {
  return (
    (Array.from(document.querySelectorAll("button")).find((item) =>
      item.textContent?.includes(text),
    ) as HTMLButtonElement | undefined) ?? null
  );
}

describe("AISections", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("LLM 功能分配切换 provider 时会自动选择该 provider 的首个模型", async () => {
    const controller = createController();
    await controller.render({
      section: "llm-usage",
      initialSetting: createBaseSetting({
        llmConfigs: [
          {
            id: "p1",
            name: "Alpha",
            apiKey: "k1",
            baseUrl: "u1",
            models: [{ name: "alpha-model", description: "", features: {} }],
          },
          {
            id: "p2",
            name: "Beta",
            apiKey: "k2",
            baseUrl: "u2",
            models: [{ name: "beta-model", description: "", features: {} }],
          },
        ],
        llmUsageSettings: {
          chat: { providerId: "p1", modelName: "alpha-model" },
        },
      }),
    });

    const providerTrigger = findButtonByText("Alpha");
    expect(providerTrigger).toBeTruthy();
    await act(async () => {
      providerTrigger?.dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
      await Promise.resolve();
    });

    const betaOption = findButtonByText("Beta");
    expect(betaOption).toBeTruthy();
    await act(async () => {
      betaOption?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });

    const latest = controller.latest() as Record<string, unknown>;
    const usage = latest.llmUsageSettings as Record<string, unknown>;
    expect(usage.chat).toEqual({
      providerId: "p2",
      modelName: "beta-model",
    });
    await controller.cleanup();
  });

  it("删除 provider 后会清理对应 llmUsageSettings 引用", async () => {
    const controller = createController();
    await controller.render({
      section: "llm-configs",
      initialSetting: createBaseSetting({
        llmConfigs: [
          {
            id: "p1",
            name: "Alpha",
            apiKey: "k1",
            baseUrl: "u1",
            models: [{ name: "alpha-model", description: "", features: {} }],
          },
        ],
        llmUsageSettings: {
          chat: { providerId: "p1", modelName: "alpha-model" },
        },
      }),
    });

    const deleteButtons = Array.from(
      document.querySelectorAll("button"),
    ).filter((button) => button.textContent?.trim() === "删除");
    expect(deleteButtons.length).toBeGreaterThan(0);
    await act(async () => {
      deleteButtons[0]?.dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    const latest = controller.latest() as Record<string, unknown>;
    const usage = latest.llmUsageSettings as Record<string, unknown>;
    const configs = latest.llmConfigs as unknown[];
    expect(configs).toEqual([]);
    expect(usage.chat).toBeNull();
    await controller.cleanup();
  });

  it("Embedding 页面仅显示 API provider（隐藏 local_python）", async () => {
    const controller = createController();
    await controller.render({
      section: "embedding",
      initialSetting: createBaseSetting({
        embeddingProvider: {
          currentConfigId: "api-1",
          configs: [
            {
              id: "local-1",
              providerType: "local_python",
              name: "本地配置",
              models: [],
            },
            {
              id: "api-1",
              providerType: "remote_openai",
              name: "API 配置",
              apiKey: "k1",
              baseUrl: "u1",
              currentModel: "emb-1",
              models: [
                {
                  name: "emb-1",
                  description: "",
                  contextLength: 1536,
                  distance: 0.3,
                  features: { multimodal: false },
                },
              ],
            },
          ],
        },
      }),
    });

    expect(document.body.textContent?.includes("API 配置")).toBe(true);
    expect(document.body.textContent?.includes("本地配置")).toBe(false);
    await controller.cleanup();
  });

  it("文本输入失焦后会触发持久化更新", async () => {
    const controller = createController();
    await controller.render({
      section: "llm-configs",
      initialSetting: createBaseSetting({
        llmConfigs: [
          {
            id: "p1",
            name: "Alpha",
            apiKey: "k1",
            baseUrl: "u1",
            models: [],
          },
        ],
      }),
    });

    const nameInput = document.querySelector(
      'input[placeholder="请输入配置名称"]',
    ) as HTMLInputElement | null;
    expect(nameInput).toBeTruthy();
    const beforeUpdateCount = controller.updates().length;
    await act(async () => {
      if (!nameInput) return;
      nameInput.dispatchEvent(new Event("focus", { bubbles: true }));
      nameInput.value = "Alpha-Next";
      nameInput.dispatchEvent(new Event("input", { bubbles: true }));
      nameInput.dispatchEvent(new Event("change", { bubbles: true }));
      await Promise.resolve();
    });
    await act(async () => {
      if (!nameInput) return;
      nameInput.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });

    const latest = controller.latest() as Record<string, unknown>;
    expect(latest.llmConfigs).toBeTruthy();
    expect(controller.updates().length).toBeGreaterThan(beforeUpdateCount);
    expect(controller.updates().some((item) => item?.persist === true)).toBe(
      true,
    );
    await controller.cleanup();
  });

  it("Provider 未配置 API Key/Base URL 时禁止新增模型", async () => {
    const controller = createController();
    await controller.render({
      section: "llm-configs",
      initialSetting: createBaseSetting({
        llmConfigs: [
          {
            id: "p1",
            name: "Alpha",
            apiKey: "",
            baseUrl: "",
            models: [],
          },
        ],
      }),
    });

    const addModelButton = findButtonByText("新增模型");
    expect(addModelButton).toBeTruthy();
    expect(addModelButton?.disabled).toBe(true);
    expect(
      document.body.textContent?.includes(
        "请先填写当前 Provider 的 API Key 和 Base URL",
      ),
    ).toBe(true);

    await act(async () => {
      addModelButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });

    const latest = controller.latest() as Record<string, unknown>;
    const llmConfigs = latest.llmConfigs as Array<Record<string, unknown>>;
    const firstProviderModels = llmConfigs[0]?.models as unknown[];
    expect(Array.isArray(firstProviderModels)).toBe(true);
    expect(firstProviderModels.length).toBe(0);
    await controller.cleanup();
  });
});
