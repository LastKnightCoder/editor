import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import type { SettingCompat } from "../../types";
import { setMobileSettingSnapshot } from "../../services/mobileSettingsBridge";
import {
  normalizeEditorOpenMode,
  useEditorOpenMode,
  withEditorOpenMode,
  type EditorOpenMode,
} from "../useEditorOpenMode";

describe("useEditorOpenMode", () => {
  let root: Root | null = null;

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    root = null;
    document.body.innerHTML = "";
    setMobileSettingSnapshot(null);
  });

  async function renderProbe(): Promise<{ current: EditorOpenMode | null }> {
    const result = { current: null as EditorOpenMode | null };
    function Probe() {
      result.current = useEditorOpenMode();
      return null;
    }
    const host = document.createElement("div");
    document.body.appendChild(host);
    const probeRoot = createRoot(host);
    root = probeRoot;
    await act(async () => {
      probeRoot.render(<Probe />);
    });
    return result;
  }

  it("设置未加载或缺省时为阅读态", async () => {
    const result = await renderProbe();
    expect(result.current).toBe("read");
    await act(async () => {
      setMobileSettingSnapshot({} as SettingCompat);
    });
    expect(result.current).toBe("read");
  });

  it("设置快照更新为 edit 后随之切换", async () => {
    const result = await renderProbe();
    await act(async () => {
      setMobileSettingSnapshot({ editor: { openMode: "edit" } } as SettingCompat);
    });
    expect(result.current).toBe("edit");
  });

  it("非法值归一为 read", () => {
    expect(normalizeEditorOpenMode("edit")).toBe("edit");
    expect(normalizeEditorOpenMode("write")).toBe("read");
    expect(normalizeEditorOpenMode(undefined)).toBe("read");
  });

  it("withEditorOpenMode 只改 editor.openMode，其余字段保留", () => {
    const prev = {
      appearance: { image: { borderRadius: "md" } },
      editor: { openMode: "read" },
    } as SettingCompat;
    const next = withEditorOpenMode(prev, "edit");
    expect(next.editor?.openMode).toBe("edit");
    expect(next.appearance).toBe(prev.appearance);
    expect(prev.editor?.openMode).toBe("read");
  });
});
