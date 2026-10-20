import os from "node:os";
import { app, BrowserWindow, ipcMain, net, screen, shell, type IpcMainInvokeEvent } from "electron";
import log from "electron-log";
import type {
  AppFeedbackEnvironment,
  AppFeedbackLogInfo,
  AppFeedbackOpenOptions,
  AppFeedbackResult,
  AppFeedbackSubmitInput,
  FeedbackCapture,
  FeedbackCaptureSource,
} from "@/types/app-feedback";
import { findFeedbackWindow, getMainWindows, showFeedbackWindow } from "../windows";
import { API_ORIGIN } from "../services/plugin-center";
import { visitorHeaders } from "../services/plugin-center-visitor";
import {
  collectAppLog,
  compressPerfSnapshot,
  encodeFeedback,
  logFileBytes,
  readFeedbackResponse,
  validateInput,
} from "../services/app-feedback";
import { setupLogger } from "./logger";
import { buildSnapshot } from "./perf-monitor";

/**
 * 用户反馈：独立反馈窗口的主进程侧——截图、环境信息、日志收集与提交。
 * 匿名凭证只在主进程使用（与插件中心共用安装级身份），渲染端只拿到提交结果。
 */

// 不可截取的窗口：反馈窗口自身与常驻的隐藏/透明窗口
const HIDDEN_ROUTES = ["/feedback", "/notification-host", "/background-audio"];
const ANNOTATE_SIZE = { width: 880, height: 680 };

const pendingCaptures: FeedbackCapture[] = [];
let sourcePage: string | null = null;
const boundsBeforeAnnotate = new WeakMap<BrowserWindow, Electron.Rectangle>();

const routeOf = (win: BrowserWindow) => {
  try {
    return new URL(win.webContents.getURL()).hash.slice(1).split("?")[0];
  } catch {
    return "";
  }
};

function labelOf(win: BrowserWindow) {
  const mains = getMainWindows();
  if (mains.includes(win)) return mains.length > 1 ? `主窗口 ${mains.indexOf(win) + 1}` : "主窗口";
  return win.getTitle() || "窗口";
}

function capturable(): BrowserWindow[] {
  return BrowserWindow.getAllWindows().filter(
    win =>
      !win.isDestroyed() &&
      win.isVisible() &&
      !win.isMinimized() &&
      !HIDDEN_ROUTES.includes(routeOf(win))
  );
}

async function capture(win: BrowserWindow): Promise<FeedbackCapture> {
  const image = await win.webContents.capturePage();
  if (image.isEmpty()) throw new Error("没能截取这个窗口，请确认它没有最小化");
  return { png: new Uint8Array(image.toPNG()), source: labelOf(win) };
}

async function openFeedback(source: BrowserWindow | null, options: AppFeedbackOpenOptions = {}) {
  if (options.page !== undefined) sourcePage = options.page;
  if (options.capture && source && !source.isDestroyed())
    pendingCaptures.push(await capture(source));
  const win = showFeedbackWindow(source);
  // 新建的窗口挂载时会主动拉取；已打开的窗口靠这个事件得知有新截图
  if (pendingCaptures.length && !win.webContents.isLoading())
    win.webContents.send("app-feedback:pending");
}

/** 从托盘等非窗口入口打开 */
export function openFeedbackWindow() {
  void openFeedback(getMainWindows()[0] ?? null, { page: null }).catch(error =>
    log.error("[app-feedback] 打开反馈窗口失败:", error)
  );
}

function environment(): AppFeedbackEnvironment {
  return {
    appVersion: app.getVersion(),
    platform: process.platform,
    osVersion: process.getSystemVersion?.() ?? os.release(),
    arch: process.arch,
    page: sourcePage,
    locale: app.getLocale(),
  };
}

function setAnnotating(win: BrowserWindow, annotating: boolean) {
  if (annotating) {
    if (boundsBeforeAnnotate.has(win)) return;
    const bounds = win.getBounds();
    boundsBeforeAnnotate.set(win, bounds);
    const area = screen.getDisplayMatching(bounds).workArea;
    const width = Math.min(Math.max(bounds.width, ANNOTATE_SIZE.width), area.width);
    const height = Math.min(Math.max(bounds.height, ANNOTATE_SIZE.height), area.height);
    // 向左展开为主：反馈窗口通常贴在屏幕右侧
    const x = Math.max(
      area.x,
      Math.min(bounds.x + bounds.width - width, area.x + area.width - width)
    );
    const y = Math.max(area.y, Math.min(bounds.y, area.y + area.height - height));
    win.setBounds({ x, y, width, height }, true);
    return;
  }
  const previous = boundsBeforeAnnotate.get(win);
  boundsBeforeAnnotate.delete(win);
  if (previous) win.setBounds(previous, true);
}

async function submit(input: AppFeedbackSubmitInput): Promise<AppFeedbackResult> {
  const { message, contact } = validateInput(input);
  const { logDir, sessionLogPath } = setupLogger();
  const env = environment();
  const page = input.page === undefined ? env.page : input.page;
  const context = input.includeContext
    ? Object.fromEntries(
        Object.entries({ ...env, page, theme: input.theme }).filter(
          (entry): entry is [string, string] => typeof entry[1] === "string" && !!entry[1]
        )
      )
    : null;
  const encoded = await encodeFeedback({
    meta: { kind: input.kind, message, contact, context, clientRequestId: input.clientRequestId },
    images: input.images,
    log: input.logs.app ? await collectAppLog(logDir, sessionLogPath) : null,
    perf: input.logs.perf ? await compressPerfSnapshot(buildSnapshot()) : null,
  });
  let headers: Record<string, string>;
  try {
    headers = await visitorHeaders(API_ORIGIN, true);
  } catch {
    return { ok: false, reason: "network", message: "没能连上反馈服务，请检查网络后重试" };
  }
  let response: Response;
  try {
    response = await net.fetch(`${API_ORIGIN}/v1/app-feedback`, {
      method: "POST",
      headers: { ...headers, "X-Tau-Visitor": "1", "Content-Type": encoded.contentType },
      body: encoded.body,
      signal: AbortSignal.timeout(60_000),
    });
  } catch {
    return {
      ok: false,
      reason: "network",
      message: "没能连上服务器，内容已保留，联网后再发一次就行",
    };
  }
  const result = await readFeedbackResponse(response);
  if (result.ok) log.info(`[app-feedback] 反馈已提交 ${result.id}`);
  else log.warn(`[app-feedback] 反馈提交失败 ${response.status} ${result.reason}`);
  return result;
}

const senderWindow = (event: IpcMainInvokeEvent) => BrowserWindow.fromWebContents(event.sender);

const init = async () => {
  ipcMain.handle("app-feedback:open", (event, options?: AppFeedbackOpenOptions) =>
    openFeedback(senderWindow(event), options)
  );
  ipcMain.handle("app-feedback:take-pending", () => pendingCaptures.splice(0));
  ipcMain.handle("app-feedback:list-windows", (): FeedbackCaptureSource[] => {
    const mains = getMainWindows();
    return capturable()
      .sort((a, b) => Number(mains.includes(b)) - Number(mains.includes(a)))
      .map(win => ({ id: win.id, label: labelOf(win) }));
  });
  ipcMain.handle("app-feedback:capture", async (_event, windowId: number) => {
    const win = capturable().find(item => item.id === windowId);
    if (!win) throw new Error("这个窗口已经关闭或最小化");
    return capture(win);
  });
  ipcMain.handle("app-feedback:environment", environment);
  ipcMain.handle("app-feedback:log-info", async (): Promise<AppFeedbackLogInfo> => {
    const { logDir, sessionLogPath } = setupLogger();
    return { appLogBytes: await logFileBytes(logDir, sessionLogPath) };
  });
  ipcMain.handle("app-feedback:reveal-logs", () =>
    shell.showItemInFolder(setupLogger().sessionLogPath)
  );
  ipcMain.handle("app-feedback:set-annotating", (event, annotating: boolean) => {
    const win = senderWindow(event);
    if (win && win === findFeedbackWindow()) setAnnotating(win, annotating);
  });
  ipcMain.handle("app-feedback:submit", (_event, input: AppFeedbackSubmitInput) => submit(input));
  log.info("[app-feedback] 反馈模块已初始化");
};

export default { init };
