// @vitest-environment node
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { localContentCommands } from "@/commands/contracts/collaboration";
import { getLocalContentRuntime, initLocalContent, shutdownLocalContent } from "./composition";

const host = vi.hoisted(() => {
  const handlers = new Map<string, unknown>();
  return {
    directory: "",
    handlers,
    registered: [] as string[],
    removeHandler: vi.fn((channel: string) => handlers.delete(channel)),
    stopReconnect: vi.fn(),
  };
});

vi.mock("electron", () => ({
  app: { getPath: () => host.directory, on: vi.fn(), off: vi.fn() },
  BrowserWindow: { getAllWindows: () => [] },
  ipcMain: {
    handle(channel: string, handler: unknown) {
      if (host.handlers.has(channel))
        throw new Error(`Attempted to register a second handler for '${channel}'`);
      host.handlers.set(channel, handler);
      host.registered.push(channel);
    },
    removeHandler: host.removeHandler,
  },
}));
vi.mock("../../utils/PathUtil", () => ({ default: { getAppDir: () => host.directory } }));
vi.mock("../database", () => ({
  default: {
    databases: new Map(),
    onDatabaseConnected: () => host.stopReconnect,
  },
}));
vi.mock("../video-note-index-queue");

it("本机正文注册部分 IPC 失败时撤销本轮注册并允许重试", () => {
  host.directory = mkdtempSync(join(tmpdir(), "tau-content-composition-"));
  const { subscribe } = localContentCommands;
  const existing = vi.fn();
  host.handlers.set(subscribe.channel, existing);
  let closeStore: (() => void) | undefined;
  try {
    expect(initLocalContent).toThrow(/second handler/);
    expect(getLocalContentRuntime).toThrow("本机正文尚未就绪");
    expect([...host.handlers]).toEqual([[subscribe.channel, existing]]);
    expect(host.removeHandler.mock.calls.flat().sort()).toEqual([...host.registered].sort());
    expect(host.stopReconnect).toHaveBeenCalledTimes(1);

    host.handlers.delete(subscribe.channel);
    initLocalContent();
    const db = getLocalContentRuntime()["store"].db;
    closeStore = () => {
      if (db.open) db.close();
    };
    expect([...host.handlers.keys()].sort()).toEqual(
      Object.values(localContentCommands)
        .map(command => command.channel)
        .sort()
    );
    expect(db.pragma("journal_mode", { simple: true })).toBe("wal");
    expect(db.prepare("SELECT count(*) FROM content_suggestions").pluck().get()).toBe(0);

    shutdownLocalContent();
    expect(host.handlers.size).toBe(0);
    expect(host.stopReconnect).toHaveBeenCalledTimes(2);
  } finally {
    shutdownLocalContent();
    closeStore?.();
    host.handlers.clear();
    rmSync(host.directory, { recursive: true, force: true });
  }
});
