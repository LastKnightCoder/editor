import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { CollaborationBackground } from "../CollaborationBackground";
import { useCollaborationRuntime } from "../hooks/useCollaborationRuntime";

const io = vi.hoisted(() => ({
  cached: vi.fn(),
  start: vi.fn(async () => {}),
  refresh: vi.fn(async () => {}),
  retain: vi.fn(),
  release: vi.fn(),
  phase: { phase: "ready", message: "" },
}));
vi.mock("../../../app/AppContext", () => ({
  useAppContext: () => ({ syncSettings: { safeSetting: { collaboration: { nickname: "作者" } } } }),
}));
vi.mock("../../../app/plugins/content", () => ({
  mobilePluginState: { subscribe: () => () => {}, get: () => io.phase },
}));
vi.mock("../../../services/tauri", () => ({ collabListCache: io.cached }));
vi.mock("../core/manager", () => ({
  collaborationManager: {
    start: io.start,
    refresh: io.refresh,
    retain: io.retain,
    release: io.release,
  },
}));
afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

it("隐藏面板不持有运行时，开关与卸载只释放各自取得的持有", async () => {
  function Panel({ open }: { open: boolean }) {
    useCollaborationRuntime(open);
    return null;
  }
  const root = createRoot(document.createElement("div"));
  try {
    await act(async () => root.render(<Panel open={false} />));
    expect(io.start).not.toHaveBeenCalled();
    expect(io.retain).not.toHaveBeenCalled();
    await act(async () => root.render(<Panel open />));
    expect(io.start).toHaveBeenCalledTimes(1);
    expect(io.retain).toHaveBeenCalledTimes(1);
    await act(async () => root.render(<Panel open={false} />));
    expect(io.release).toHaveBeenCalledTimes(1);
  } finally {
    await act(async () => root.unmount());
  }
  expect(io.release).toHaveBeenCalledTimes(1);
});

it.each(["none", "local", "shared", "closing"])(
  "只有已有作者共享时才在无正文视图下恢复协作（会话=%s）",
  async mode => {
    const owner = mode === "shared" || mode === "closing";
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    io.cached.mockResolvedValue(
      mode === "none"
        ? []
        : [
            {
              mode: owner ? "shared" : "local",
              serverUrl: owner ? "https://collab.test" : "",
              role: "owner",
              status: mode === "closing" ? "closed" : "active",
              ...(mode === "closing" ? { close: { revision: "r", confirmed: true } } : {}),
            },
          ]
    );
    const root = createRoot(document.createElement("div"));
    try {
      await act(async () => root.render(<CollaborationBackground />));
      await vi.waitFor(() => expect(io.cached).toHaveBeenCalled());
      if (owner)
        await vi.waitFor(() => expect(io.start).toHaveBeenCalledWith({ nickname: "作者" }));
      else expect(io.start).not.toHaveBeenCalled();
    } finally {
      await act(async () => root.unmount());
    }
    expect(io.retain).toHaveBeenCalledTimes(owner ? 1 : 0);
    expect(io.release).toHaveBeenCalledTimes(owner ? 1 : 0);
  }
);
