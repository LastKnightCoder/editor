import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it } from "vitest";
import type { EditorKit } from "@tau/editor";
import { mobilePluginState } from "../../app/plugins/content";
import { useMobileContentKit } from "../editorKit";

afterEach(() => mobilePluginState.set({ phase: "starting", message: "" }));

it("编辑模式在插件落定前返回 null，落定后锁定首个 kit；只读模式始终有 kit", async () => {
  mobilePluginState.set({ phase: "starting", message: "" });
  const seen: { edit: EditorKit | null; read: EditorKit }[] = [];
  function Probe() {
    seen.push({ edit: useMobileContentKit("edit"), read: useMobileContentKit("read") });
    return null;
  }
  const root = createRoot(document.createElement("div"));
  await act(async () => root.render(<Probe />));
  expect(seen.at(-1)?.edit).toBeNull();
  expect(seen.at(-1)?.read).toBeTruthy();
  await act(async () => mobilePluginState.set({ phase: "ready", message: "" }));
  const locked = seen.at(-1)?.edit;
  expect(locked).toBeTruthy();
  // 会话重载期间编辑模式保持同一个 kit，不让正在编辑的编辑器重建
  await act(async () => mobilePluginState.set({ phase: "starting", message: "" }));
  await act(async () => mobilePluginState.set({ phase: "safe", message: "" }));
  expect(seen.at(-1)?.edit).toBe(locked);
  await act(async () => root.unmount());
});
