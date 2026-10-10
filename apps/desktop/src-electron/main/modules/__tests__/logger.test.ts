import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// logger 模块在 import 期即执行 setupLogger（console 代理 + transport 配置），
// 这里 mock 掉 electron / electron-log，并把 HOME 指向临时目录以隔离文件系统副作用

const rendererLogMock = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
};

vi.mock("electron", () => ({
  ipcMain: { on: vi.fn() },
}));

vi.mock("electron-log", () => {
  const logFn = vi.fn();
  const mockedLog = {
    info: logFn,
    warn: logFn,
    error: logFn,
    debug: logFn,
    scope: vi.fn(() => rendererLogMock),
    errorHandler: { startCatching: vi.fn() },
    transports: {
      file: { level: "", maxSize: 0, resolvePathFn: null },
      console: { level: "" },
    },
  };
  return { default: mockedLog };
});

const originalConsole = {
  log: console.log,
  info: console.info,
  warn: console.warn,
  error: console.error,
  debug: console.debug,
};

const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), "logger-test-"));
const appDir = path.join(tempHome, ".editor");
const logsDir = path.join(appDir, "logs");
const previousHome = process.env.HOME;

let loggerModule: typeof import("../logger");
let ipcMainOn: ReturnType<typeof vi.fn>;

const FOUR_DAYS_AGO = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000);

function writeFile(filePath: string, mtime: Date) {
  fs.writeFileSync(filePath, "test");
  fs.utimesSync(filePath, mtime, mtime);
}

beforeAll(async () => {
  process.env.HOME = tempHome;
  const electron = await import("electron");
  ipcMainOn = electron.ipcMain.on as unknown as ReturnType<typeof vi.fn>;
  loggerModule = await import("../logger");
});

afterAll(() => {
  process.env.HOME = previousHome;
  Object.assign(console, originalConsole);
  fs.rmSync(tempHome, { recursive: true, force: true });
});

describe("logger 模块", () => {
  it("import 期完成安装：session 日志目录、console 代理与渲染端日志通道", () => {
    expect(fs.existsSync(logsDir)).toBe(true);

    // console.log 已被代理到 electron-log（mock 后为空函数）
    expect(console.log === originalConsole.log).toBe(false);

    expect(ipcMainOn).toHaveBeenCalledWith("logger:renderer-log", expect.any(Function));
  });

  it("渲染端日志按级别落盘并标注来源窗口，非法 payload 被忽略", () => {
    const handler = ipcMainOn.mock.calls[0][1] as (event: unknown, payload: unknown) => void;
    const sender = {
      isDestroyed: () => false,
      getTitle: () => "主窗口",
    };

    handler({ sender }, { level: "error", message: "渲染出错" });
    expect(rendererLogMock.error).toHaveBeenCalledWith("[主窗口] 渲染出错");

    handler({ sender }, { level: "log", message: "归并为 info" });
    expect(rendererLogMock.info).toHaveBeenCalledWith("[主窗口] 归并为 info");

    handler({ sender }, "不是对象");
    handler({ sender }, { level: "info" });
    expect(rendererLogMock.info).toHaveBeenCalledTimes(1);
  });

  it("清理超过 3 天的 session 日志（含轮转产物），保留近期文件", async () => {
    const expiredSession = path.join(logsDir, "session-2026-01-01_00-00-00-abcd.log");
    const rotatedExpired = path.join(logsDir, "session-2026-01-01_00-00-00-abcd.old.log");
    const freshSession = path.join(logsDir, "session-2099-01-01_00-00-00-ffff.log");
    const unrelated = path.join(logsDir, "readme.txt");
    const legacyNotes = path.join(appDir, "notes.log");

    writeFile(expiredSession, FOUR_DAYS_AGO);
    writeFile(rotatedExpired, FOUR_DAYS_AGO);
    writeFile(freshSession, new Date());
    writeFile(unrelated, FOUR_DAYS_AGO);
    writeFile(legacyNotes, FOUR_DAYS_AGO);

    await loggerModule.default.init();

    expect(fs.existsSync(expiredSession)).toBe(false);
    expect(fs.existsSync(rotatedExpired)).toBe(false);
    expect(fs.existsSync(freshSession)).toBe(true);
    // 非 session 前缀的文件不清理
    expect(fs.existsSync(unrelated)).toBe(true);
    // 清洁版（D-091）收尾后旧版单文件日志的清理兼容已删除，logs 目录外的遗留文件不再动
    expect(fs.existsSync(legacyNotes)).toBe(true);
  });
});
