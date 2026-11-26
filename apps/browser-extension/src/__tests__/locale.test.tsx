import { act } from "react";
import { createRoot } from "react-dom/client";
import { I18nRuntimeProvider } from "@tau/i18n/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { resolveExtensionLocale } from "../shared/locale";
import {
  extensionI18n,
  extensionLocaleSource,
  updateExtensionLocale,
  bindExtensionLanguage,
} from "../shared/i18n";
import { useCompanionStatus } from "../shared/extension-page";
import { useCompanion } from "../content/state/store";
const actors = vi.hoisted(() => ({ created: 0, started: 0, disposed: 0 }));
vi.mock("../content/state/controller", () => ({
  CompanionController: class {
    constructor() {
      actors.created++;
    }
    async start() {
      actors.started++;
    }
    dispose() {
      actors.disposed++;
    }
  },
  stripCites: (text: string) => text,
}));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let language = "zh-CN";
const listeners = new Set<(changes: Record<string, { newValue: unknown }>, area: string) => void>();
const get = vi.fn();
let dispose: (() => void) | undefined;
let originalLang: string;
beforeEach(() => {
  actors.created = 0;
  actors.started = 0;
  actors.disposed = 0;
  language = "zh-CN";
  listeners.clear();
  get.mockReset();
  originalLang = document.documentElement.lang;
  vi.stubGlobal("chrome", {
    i18n: { getUILanguage: () => language },
    runtime: { getURL: (url: string) => `chrome-extension://test${url}` },
    storage: {
      local: { get },
      onChanged: {
        addListener: (fn: never) => listeners.add(fn),
        removeListener: (fn: never) => listeners.delete(fn),
      },
    },
  });
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
  updateExtensionLocale({ state: "unpaired" });
});
afterEach(async () => {
  await act(async () => dispose?.());
  dispose = undefined;
  document.body.innerHTML = "";
  document.documentElement.lang = originalLang;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it("只信ready宿主有效语言，旧宿主与离线回浏览器，繁体脚本归一且不支持语种回中文", () => {
  expect(
    resolveExtensionLocale(
      { state: "ready", appearance: { theme: "paper", mode: "light", locale: "en-US" } },
      "zh-HK"
    )
  ).toBe("en-US");
  for (const state of ["unpaired", "offline", "pairing", "revoked"] as const)
    expect(
      resolveExtensionLocale(
        { state, appearance: { theme: "paper", mode: "light", locale: "en-US" } },
        "zh-HK"
      )
    ).toBe("zh-TW");
  expect(resolveExtensionLocale({ state: "ready" }, "en-GB")).toBe("en-US");
  expect(
    resolveExtensionLocale(
      { state: "ready", appearance: { theme: "paper", mode: "light", locale: "invalid" } },
      "zh-Hant"
    )
  ).toBe("zh-TW");
  expect(resolveExtensionLocale({ state: "offline" }, "fr-FR")).toBe("zh-CN");
});
it("网页内语言仅改扩展容器，切换语言保留同一root和controller且不触碰第三方lang", async () => {
  const originalAttach = Element.prototype.attachShadow;
  let shadow: ShadowRoot | undefined;
  vi.spyOn(Element.prototype, "attachShadow").mockImplementation(function (this: Element, init) {
    const result = originalAttach.call(this, init);
    if (this.tagName.toLowerCase() === "tau-companion") shadow = result;
    return result;
  });
  document.documentElement.lang = "fr";
  useCompanion.setState({
    hiddenOnSite: true,
    panelOpen: false,
    coachSeen: true,
    annotations: [],
    selection: null,
    bubble: null,
    status: { state: "unpaired" },
  });
  const { mountCompanion } = await import("../content/mount");
  await act(async () => {
    dispose = mountCompanion("");
  });
  const host = document.querySelector<HTMLElement>("tau-companion"),
    app = shadow?.querySelector(".tau-root");
  if (!host || !app) throw new Error("扩展root未挂载");
  for (const locale of ["zh-TW", "en-US"]) {
    await act(async () =>
      useCompanion.setState({
        status: { state: "ready", appearance: { theme: "paper", mode: "light", locale } },
      })
    );
    expect(host.lang).toBe(locale);
    expect(document.documentElement.lang).toBe("fr");
    expect(shadow?.querySelector(".tau-root")).toBe(app);
    expect(actors).toMatchObject({ created: 1, started: 1, disposed: 0 });
  }
  await act(async () => useCompanion.setState({ status: { state: "offline" } }));
  expect(host.lang).toBe("zh-CN");
  expect(document.documentElement.lang).toBe("fr");
});
it("自有页面晚到存储快照不覆盖新状态，语言更新不重建草稿或增加状态读取", async () => {
  let resolve: ((value: unknown) => void) | undefined;
  get.mockImplementation(
    () =>
      new Promise(done => {
        resolve = done;
      })
  );
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const stop = bindExtensionLanguage(document.documentElement);
  dispose = () => {
    root.unmount();
    stop();
    host.remove();
  };
  function OwnPage() {
    useCompanionStatus();
    return <input defaultValue="用户原始草稿" />;
  }
  await act(async () =>
    root.render(
      <I18nRuntimeProvider runtime={extensionI18n}>
        <OwnPage />
      </I18nRuntimeProvider>
    )
  );
  const input = host.querySelector("input");
  if (!input) throw new Error("草稿未挂载");
  await act(async () => {
    input.focus();
    input.setSelectionRange(1, 4);
    listeners.forEach(listener =>
      listener(
        {
          "companion.status": {
            newValue: {
              state: "ready",
              appearance: { theme: "paper", mode: "light", locale: "zh-TW" },
            },
          },
        },
        "local"
      )
    );
  });
  if (!resolve) throw new Error("状态读取未启动");
  await act(async () =>
    resolve?.({
      "companion.status": {
        state: "ready",
        appearance: { theme: "paper", mode: "light", locale: "en-US" },
      },
    })
  );
  expect(extensionLocaleSource.getSnapshot()).toBe("zh-TW");
  expect(document.documentElement.lang).toBe("zh-TW");
  await act(async () =>
    listeners.forEach(listener =>
      listener(
        {
          "companion.status": {
            newValue: {
              state: "ready",
              appearance: { theme: "paper", mode: "light", locale: "en-US" },
            },
          },
        },
        "local"
      )
    )
  );
  expect(host.querySelector("input")).toBe(input);
  expect(input.value).toBe("用户原始草稿");
  expect(document.activeElement).toBe(input);
  expect([input.selectionStart, input.selectionEnd]).toEqual([1, 4]);
  expect(document.documentElement.lang).toBe("en-US");
  expect(get).toHaveBeenCalledTimes(1);
});
