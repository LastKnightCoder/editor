import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { desktopLocaleSource } from "@/app/i18n/runtime";
import { ServerForm } from "../views/ServerForm";
import { emptyDraft, type ServerDraft } from "../serverConfig";

vi.mock("@/commands/extra", () => ({ selectDirectoryWithDialog: vi.fn() }));

let snapshot: ServerDraft;
function Harness() {
  const [draft, setDraft] = useState<ServerDraft>(() => ({
    ...emptyDraft(),
    name: "Original server",
    description: "Owner-provided description",
    command: "node",
    args: ["/original path/script.js"],
    env: [{ key: "API_KEY", value: "fixture-safe" }],
  }));
  snapshot = draft;
  return <ServerForm draft={draft} onChange={setDraft} />;
}
let root: Root;
let host: HTMLDivElement;
function input(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
  act(() => {
    const prototype =
      element instanceof HTMLInputElement
        ? HTMLInputElement.prototype
        : HTMLTextAreaElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
beforeEach(async () => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(<Harness />));
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  desktopLocaleSource.setLocale("zh-CN");
});

it("切换语言保留表单与无效JSON草稿，修正后仍提交原名称和参数", async () => {
  const name = host.querySelector<HTMLInputElement>("input[data-autofocus]");
  const secret = host.querySelector<HTMLInputElement>('input[type="password"]');
  if (!name || !secret) throw new Error("editable fields missing");
  input(name, "  My raw server  ");
  name.focus();
  name.setSelectionRange(2, 5);
  const before = snapshot;
  for (const locale of ["en-US", "zh-TW"] as const) {
    await act(async () => desktopLocaleSource.setLocale(locale));
    expect(snapshot).toBe(before);
    expect(host.querySelector("input[data-autofocus]")).toBe(name);
    expect(document.activeElement).toBe(name);
    expect([name.selectionStart, name.selectionEnd]).toEqual([2, 5]);
    expect(host.querySelector('input[type="password"]')).toBe(secret);
    expect(secret.value).toBe("fixture-safe");
  }
  const mode = host.querySelector<HTMLButtonElement>("button[aria-pressed]");
  if (!mode) throw new Error("JSON mode toggle missing");
  act(() => mode.click());
  expect(mode.getAttribute("aria-pressed")).toBe("true");
  const json = host.querySelector("textarea");
  if (!json) throw new Error("JSON editor missing");
  input(json, "{");
  json.focus();
  json.setSelectionRange(1, 1);
  for (const locale of ["en-US", "zh-CN"] as const) {
    await act(async () => desktopLocaleSource.setLocale(locale));
    expect(host.querySelector("textarea")).toBe(json);
    expect(json.value).toBe("{");
    expect(json.getAttribute("aria-invalid")).toBe("true");
    expect(document.activeElement).toBe(json);
    expect([json.selectionStart, json.selectionEnd]).toEqual([1, 1]);
    expect(snapshot).toBe(before);
  }
  input(
    json,
    JSON.stringify({
      command: "node",
      args: ["/new path/run.js"],
      env: { API_KEY: "fixture-safe" },
    })
  );
  expect(json.hasAttribute("aria-invalid")).toBe(false);
  expect(snapshot).toMatchObject({
    name: "  My raw server  ",
    description: "Owner-provided description",
    command: "node",
    args: ["/new path/run.js"],
    env: [{ key: "API_KEY", value: "fixture-safe" }],
  });
});
