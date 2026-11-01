import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { CollaborationBackground } from "../CollaborationBackground";

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
