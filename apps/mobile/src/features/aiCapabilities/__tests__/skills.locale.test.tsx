import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { I18nRuntimeProvider } from "@tau/i18n/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { AiSkillDescriptor } from "@tau/ai/skills";
import { RouterProvider, definePage } from "../../../router";
import { mobileI18n, mobileLocaleSource } from "../../../services/i18n";
import {
  useCapabilityPreferences,
  libraryPreferences,
} from "../../../services/aiChat/capabilityPreferences";
import { SkillsPage } from "../SkillsPage";
import { SkillDetailPage } from "../SkillDetailPage";
import { skillsTranslator } from "../skills.i18n";

const mocks = vi.hoisted(() => ({ list: vi.fn(), read: vi.fn() }));
vi.mock("../../../services/aiChat/chatController", () => ({
  listAllSkills: mocks.list,
  readSkillDocument: mocks.read,
  chatCapabilities: vi.fn(),
}));
vi.mock("../../../app/AppContext", () => ({
  useAppContext: () => ({
    syncSettings: { safeSetting: { database: { active: "skill-original.db" } } },
    bootstrap: {},
  }),
}));
definePage({ key: "skills-locale-test-root", params: {}, component: () => null });

const skill: AiSkillDescriptor = {
  id: "original:skill",
  name: "用户原始技能名",
  description: "用户原始描述，不属于界面翻译",
  sourceId: "internal",
  sourceRevision: "1",
  allowedTools: [],
  disableModelInvocation: true,
};
let host: HTMLDivElement;
let root: Root;
let client: QueryClient;
const render = (node: React.ReactNode) =>
  act(() =>
    root.render(
      <I18nRuntimeProvider runtime={mobileI18n}>
        <QueryClientProvider client={client}>
          <RouterProvider rootKey="skills-locale-test-root">{node}</RouterProvider>
        </QueryClientProvider>
      </I18nRuntimeProvider>
    )
  );
const byText = (text: string) =>
  [...document.querySelectorAll<HTMLElement>('button,[role="button"]')].find(
    button => button.textContent?.trim() === text
  );
beforeEach(() => {
  vi.clearAllMocks();
  mobileLocaleSource.setLocale("zh-CN");
  useCapabilityPreferences.setState({ libraries: {} });
  mocks.list.mockResolvedValue([skill]);
  mocks.read.mockResolvedValue({ ...skill, instructions: "# 原始Skill正文\n\n保留真实提示词。" });
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  client.clear();
  host.remove();
  mobileLocaleSource.setLocale("zh-CN");
});

it("切换语言保留筛选和真实Skill元数据，不重拉目录或改本机偏好", async () => {
  render(<SkillsPage />);
  await act(async () => vi.waitFor(() => expect(host.textContent).toContain(skill.name)));
  const manual = [...host.querySelectorAll<HTMLButtonElement>("button[aria-pressed]")].find(
    button => button.textContent?.startsWith(skillsTranslator.t("mode.manual.label"))
  );
  if (!manual) throw new Error("manual filter missing");
  await act(async () => manual.click());
  const preferences = libraryPreferences("skill-original.db");
  const writes = vi.fn();
  const stop = useCapabilityPreferences.subscribe(writes);
  try {
    for (const locale of ["zh-TW", "en-US"] as const) {
      await act(async () => mobileLocaleSource.setLocale(locale));
      expect([...host.querySelectorAll("button[aria-pressed]")]).toContain(manual);
      expect(manual.getAttribute("aria-pressed")).toBe("true");
      expect(host.textContent).toContain(skill.name);
      expect(host.textContent).toContain(skill.description);
      expect(mocks.list).toHaveBeenCalledOnce();
      expect(libraryPreferences("skill-original.db")).toBe(preferences);
      expect(writes).not.toHaveBeenCalled();
    }
  } finally {
    stop();
  }
});

it("切换语言保留正文展开和使用方式面板，选择仍只写原Skill身份与稳定mode", async () => {
  render(<SkillDetailPage skillId={skill.id} />);
  await act(async () =>
    vi.waitFor(() => expect(byText(skillsTranslator.t("body.expand"))).not.toBeUndefined())
  );
  await act(async () => byText(skillsTranslator.t("body.expand"))?.click());
  const collapse = byText(skillsTranslator.t("body.collapse"));
  const heading = [...host.querySelectorAll("h1")].find(
    node => node.textContent === "原始Skill正文"
  );
  const mode = byText(skillsTranslator.t("mode.manual.label"));
  if (!mode || !heading) throw new Error("skill detail missing");
  await act(async () => mode.click());
  const selected = document.querySelector<HTMLButtonElement>('button[aria-pressed="true"]');
  if (!selected) throw new Error("selected mode missing");
  const preferences = libraryPreferences("skill-original.db");
  for (const locale of ["zh-TW", "en-US"] as const) {
    await act(async () => mobileLocaleSource.setLocale(locale));
    expect(byText(skillsTranslator.t("body.collapse"))).toBe(collapse);
    expect([...host.querySelectorAll("h1")]).toContain(heading);
    expect(document.querySelector('button[aria-pressed="true"]')).toBe(selected);
    expect(host.textContent).toContain(skill.name);
    expect(host.textContent).toContain(skill.description);
    expect(libraryPreferences("skill-original.db")).toBe(preferences);
    expect(mocks.list).toHaveBeenCalledOnce();
    expect(mocks.read).toHaveBeenCalledOnce();
  }
  const automatic = [...document.querySelectorAll<HTMLButtonElement>("button[aria-pressed]")].find(
    button => button.textContent?.startsWith(skillsTranslator.t("mode.auto.label"))
  );
  if (!automatic) throw new Error("automatic mode missing");
  await act(async () => automatic.click());
  expect(libraryPreferences("skill-original.db").skills).toEqual({ [skill.id]: "auto" });
  expect(mocks.read).toHaveBeenCalledWith("skill-original.db", skill.id, expect.any(AbortSignal));
});
