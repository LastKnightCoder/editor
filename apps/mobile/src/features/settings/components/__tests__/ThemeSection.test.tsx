import { act, useEffect, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { SettingCompat } from "../../../../types";
import { ThemeSection } from "../ThemeSection";
import type { SettingsPageProps } from "../types";

type UpdateSetting = SettingsPageProps["updateSetting"];

type HarnessProps = {
  initialSetting: SettingCompat;
  useNullSafeSetting?: boolean;
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
  const [isDark, setIsDark] = useState(false);

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

  return (
    <ThemeSection
      isDark={isDark}
      setIsDark={setIsDark}
      safeSetting={props.useNullSafeSetting ? null : setting}
      updateSetting={updateSetting}
    />
  );
}

type Controller = {
  render: (props?: {
    initialSetting?: SettingCompat;
    useNullSafeSetting?: boolean;
  }) => Promise<void>;
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
            initialSetting={props?.initialSetting ?? createBaseSetting()}
            useNullSafeSetting={props?.useNullSafeSetting}
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

function findTriggerByLabel(label: string): HTMLButtonElement | null {
  const labelElement =
    (Array.from(document.querySelectorAll("label")).find((item) =>
      item.textContent?.includes(label),
    ) as HTMLLabelElement | undefined) ?? null;
  const container = labelElement?.parentElement;
  if (!container) {
    return null;
  }
  return container.querySelector("button");
}

async function clickButtonByText(text: string) {
  const button = findButtonByText(text);
  expect(button).toBeTruthy();
  await act(async () => {
    button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function clickTriggerByLabel(label: string) {
  const button = findTriggerByLabel(label);
  expect(button).toBeTruthy();
  await act(async () => {
    button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("ThemeSection", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("选择 Mermaid 渲染风格和浅色主题会触发持久化更新", async () => {
    const controller = createController();
    await controller.render();

    await clickTriggerByLabel("渲染风格");
    await clickButtonByText("ASCII（Unicode 字符）");
    await clickTriggerByLabel("浅色主题");
    await clickButtonByText("one-dark");

    const latest = controller.latest() as Record<string, unknown>;
    const misc = (latest.misc ?? {}) as Record<string, unknown>;
    const mermaid = (misc.mermaid ?? {}) as Record<string, unknown>;
    expect(mermaid.style).toBe("ascii-unicode");
    expect(mermaid.lightTheme).toBe("one-dark");
    expect(mermaid.darkTheme).toBe("github-dark");
    expect(controller.updates().some((item) => item?.persist === true)).toBe(
      true,
    );
    await controller.cleanup();
  });

  it("safeSetting 为空时仍展示默认值并可更新", async () => {
    const controller = createController();
    await controller.render({
      useNullSafeSetting: true,
    });

    expect(document.body.textContent?.includes("SVG（图形渲染）")).toBe(true);
    expect(document.body.textContent?.includes("github-light")).toBe(true);
    expect(document.body.textContent?.includes("github-dark")).toBe(true);

    await clickTriggerByLabel("渲染风格");
    await clickButtonByText("ASCII（Unicode 字符）");
    await clickTriggerByLabel("深色主题");
    await clickButtonByText("dracula");

    const latest = controller.latest() as Record<string, unknown>;
    const misc = (latest.misc ?? {}) as Record<string, unknown>;
    const mermaid = (misc.mermaid ?? {}) as Record<string, unknown>;
    expect(mermaid.style).toBe("ascii-unicode");
    expect(mermaid.darkTheme).toBe("dracula");
    expect(controller.updates().some((item) => item?.persist === true)).toBe(
      true,
    );
    await controller.cleanup();
  });
});
