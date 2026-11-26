import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { desktopLocaleSource } from "@/app/i18n/runtime";
import { notebookTranslator } from "../i18n";
import { GenerateDialog } from "../views/VibeLearningView/generate/GenerateDialog";
import type { VLResource } from "@/types/vibe-learning";

const mocks = vi.hoisted(() => ({ resources: vi.fn(), start: vi.fn() }));
vi.mock("@/commands/vibe-learning", () => ({ getVLResourcesByProjectId: mocks.resources }));
vi.mock("../views/VibeLearningView/tasks/runner", () => ({ startVLTask: mocks.start }));
vi.mock("@/app/plugins/notebook-outputs", () => ({ useGrantNotebook: () => vi.fn() }));

it("生成配置换语保留资料、风格与草稿，开始后只提交原值一次", async () => {
  const original = desktopLocaleSource.getSnapshot();
  mocks.resources.mockResolvedValue([
    { id: 17, name: "原始资料一", markdownPath: "/a" },
    { id: 29, name: "原始资料二", markdownPath: "/b" },
  ] as VLResource[]);
  let finish!: (value: { taskId: string }) => void;
  mocks.start.mockImplementation(
    () =>
      new Promise(resolve => {
        finish = resolve;
      })
  );
  const started = vi.fn(),
    close = vi.fn();
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () =>
      root.render(
        <GenerateDialog
          kind="article"
          projectId={7}
          mainDbName="main"
          notebookTitle="原始Notebook"
          onClose={close}
          onStarted={started}
        />
      )
    );
    const dialog = document.querySelector('[role="dialog"]');
    const input = dialog?.querySelector("textarea");
    const checkboxes = dialog?.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
    const styles = dialog?.querySelectorAll<HTMLButtonElement>('[role="radio"]');
    if (!dialog || !input || !checkboxes?.[0] || !styles?.[1])
      throw new Error("Generation form did not mount");
    const resource = checkboxes[0],
      style = styles[1];
    await act(async () => {
      resource.click();
      style.click();
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set?.call(
        input,
        "原始生成要求"
      );
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.focus();
    });
    input.setSelectionRange(1, 4);
    const getStart = () =>
      [...dialog.querySelectorAll("button")].find(
        button => button.textContent?.trim() === notebookTranslator.t("generate.start")
      );
    const start = getStart();
    if (!start) throw new Error("Generation action did not mount");
    for (const locale of ["zh-TW", "en-US"]) {
      await act(async () => desktopLocaleSource.setLocale(locale));
      expect(dialog.querySelector("textarea")).toBe(input);
      expect(getStart()).toBe(start);
      expect(input.value).toBe("原始生成要求");
      expect([input.selectionStart, input.selectionEnd]).toEqual([1, 4]);
      expect(document.activeElement).toBe(input);
      expect(resource.checked).toBe(false);
      expect(style.getAttribute("aria-checked")).toBe("true");
      expect(mocks.resources).toHaveBeenCalledTimes(1);
      expect(mocks.start).not.toHaveBeenCalled();
    }
    await act(async () => start.click());
    expect(mocks.start).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        kind: "article",
        projectId: 7,
        mainDbName: "main",
        resourceIds: [29],
        resourceNames: ["原始资料二"],
        style: "academic",
        userPrompt: "原始生成要求",
      })
    );
    await act(async () => desktopLocaleSource.setLocale("zh-CN"));
    expect(mocks.start).toHaveBeenCalledTimes(1);
    expect(started).not.toHaveBeenCalled();
    await act(async () => finish({ taskId: "original-task" }));
    expect(started).toHaveBeenCalledExactlyOnceWith({ taskId: "original-task" });
  } finally {
    await act(async () => root.unmount());
    host.remove();
    desktopLocaleSource.setLocale(original);
  }
});
