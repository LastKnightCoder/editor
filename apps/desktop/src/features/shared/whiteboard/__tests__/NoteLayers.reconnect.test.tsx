import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createWhiteboardSession, WHITEBOARD_DOCUMENT_VERSION } from "@tau/whiteboard";
import { rememberDatabaseConnection } from "@/services/command-context";

const state = vi.hoisted(() => {
  const invoke = vi.fn();
  window.electron = { platform: "darwin", invoke, on: vi.fn() } as unknown as ElectronAPI;
  return { invoke, board: null as unknown, connectionId: "before", rejected: 0 };
});
vi.mock("@tau/whiteboard", async importOriginal => ({
  ...(await importOriginal<typeof import("@tau/whiteboard")>()),
  useBoard: () => state.board,
}));
vi.mock("@/stores/useSettingStore", () => ({
  default: { getState: () => ({ setting: { database: { active: "a" } } }) },
}));
vi.mock("@/commands", async () => import("@/commands/video-notes"));
vi.mock("../components/NotePanel", () => ({ default: () => null }));
vi.mock("@/components/VideoNotePanel/VideoNotePanel", () => ({ default: () => null }));
import { NoteLayers } from "../NoteLayers";

let root: Root;
let host: HTMLDivElement;
let session: ReturnType<typeof createWhiteboardSession>;
beforeEach(() => {
  state.connectionId = "before";
  state.rejected = 0;
  rememberDatabaseConnection({ databaseName: "a", connectionId: state.connectionId });
  state.invoke.mockReset();
  state.invoke.mockImplementation(async (_channel: string, ...args: unknown[]) => {
    const scope = args.at(-1) as { toolDatabaseConnection?: string };
    if (scope.toolDatabaseConnection !== state.connectionId) {
      state.rejected++;
      throw new Error("DATABASE_CONNECTION_CHANGED");
    }
    return { id: 17 };
  });
  session = createWhiteboardSession({
    children: [{ id: "video", type: "video", src: "local.mp4", videoNoteId: 17, children: [] }],
    viewPort: { minX: 0, minY: 0, width: 800, height: 600, zoom: 1 },
    selection: { selectedElements: [], selectArea: null },
    version: WHITEBOARD_DOCUMENT_VERSION,
  });
  state.board = session.api;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  session.dispose();
  host.remove();
});

it("旧嵌入白板只读后打开视频笔记，不再向失效连接发请求", async () => {
  await act(async () => root.render(<NoteLayers />));
  await act(async () => session.api.emit("tau.video-note.open", session.api.children[0]));
  await vi.waitFor(() => expect(state.invoke).toHaveBeenCalled());
  const calls = state.invoke.mock.calls.length;
  await act(async () => {
    state.connectionId = "after";
    rememberDatabaseConnection({ databaseName: "a", connectionId: state.connectionId });
    session.setReadonly(true);
    session.api.emit("tau.video-note.open", session.api.children[0]);
  });
  expect(state.invoke.mock.calls).toHaveLength(calls);
  expect(state.rejected).toBe(0);
});

it.skipIf(process.env.TAU_DATABASE_RECONNECT_STRESS !== "1")(
  "旧笔记面板的重复事件不会访问已替换资料库",
  async () => {
    await act(async () => root.render(<NoteLayers />));
    state.connectionId = "after";
    rememberDatabaseConnection({ databaseName: "a", connectionId: state.connectionId });
    session.setReadonly(true);
    await act(async () => {
      for (let index = 0; index < 1000; index++) {
        session.api.emit("tau.video-note.open", session.api.children[0]);
      }
    });
    expect(state.invoke).not.toHaveBeenCalled();
    expect(state.rejected).toBe(0);
    console.info("[obsolete note panel stress] events=1000, obsoleteCalls=0");
  }
);
