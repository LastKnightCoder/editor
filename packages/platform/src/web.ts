import { supportsWith, unsupported, unsupportedSync, type CapabilityId } from "./capabilities";
import type {
  FileDialogApi,
  LocalFileApi,
  NotificationApi,
  NotificationRoute,
  Platform,
  PlatformOs,
  ShellApi,
  SystemApi,
  WindowApi,
} from "./types";

/**
 * Web 环境实现。
 *
 * 仅落地有浏览器等价物的能力（外链打开、下载、页面焦点事件），
 * 其余方法统一抛 UnsupportedError；UI 是否渲染入口由 supports() 预判，
 * 抛错作为漏网调用的运行时兜底。
 */

function detectWebOs(): PlatformOs {
  // node 测试环境无 navigator，防御性返回 unknown
  if (typeof navigator === "undefined") {
    return "unknown";
  }
  const value = navigator.platform.toLowerCase();
  if (value.includes("mac")) {
    return "darwin";
  }
  if (value.includes("win")) {
    return "win32";
  }
  if (value.includes("linux")) {
    return "linux";
  }
  return "unknown";
}

const WEB_SUPPORTED: ReadonlySet<CapabilityId> = new Set([
  "shell.open-external",
  "fileDialog.download-file",
  "window.focus-events",
]);

class WebWindowApi implements WindowApi {
  close = unsupported("window.close");
  minimize = unsupported("window.minimize");
  maximize = unsupported("window.maximize");
  toggleFullScreen = unsupported("window.toggle-fullscreen");
  setAlwaysOnTop = unsupported("window.always-on-top");
  getState = unsupported("window.state");
  showAndFocus = unsupported("window.show-focus");
  openMarkdownWindow = unsupported("window.open-markdown");
  openEditorWindow = unsupported("window.open-editor");
  closeEditorWindow = unsupported("window.open-editor");
  openPomodoroMiniWindow = unsupported("window.pomodoro-mini");
  hidePomodoroMiniWindow = unsupported("window.pomodoro-mini");
  openPomodoroImmersiveWindow = unsupported("window.pomodoro-immersive");
  hidePomodoroImmersiveWindow = unsupported("window.pomodoro-immersive");
  onMaximizedChange = unsupportedSync("window.maximized-events");
  onFullScreenChange = unsupportedSync("window.fullscreen-events");

  onFocusChange(callback: (focused: boolean) => void): () => void {
    const handleFocus = () => callback(true);
    const handleBlur = () => callback(false);
    window.addEventListener("focus", handleFocus);
    window.addEventListener("blur", handleBlur);
    return () => {
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("blur", handleBlur);
    };
  }
}

class WebFileDialogApi implements FileDialogApi {
  selectFile = unsupported("fileDialog.select-file");
  selectDirectory = unsupported("fileDialog.select-directory");
  saveFile = unsupported("fileDialog.save-file");

  async downloadFile(url: string, defaultFileName?: string): Promise<null> {
    // 跨域资源浏览器会忽略 download 属性而直接导航打开，属已知局限
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = defaultFileName ?? "";
    anchor.rel = "noopener";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    return null;
  }
}

class WebLocalFileApi implements LocalFileApi {
  readTextFile = unsupported("localFile.read-text");
  writeTextFile = unsupported("localFile.write-text");
  readBinaryFile = unsupported("localFile.read-binary");
  writeBinaryFile = unsupported("localFile.write-binary");
  createTextFileExclusive = unsupported("localFile.create-exclusive");
  removeFile = unsupported("localFile.remove");
  rename = unsupported("localFile.rename");
  createDir = unsupported("localFile.create-dir");
  exists = unsupported("localFile.exists");
  readDirectory = unsupported("localFile.read-dir");
  watchTextFile = unsupported("localFile.watch");
  unwatchTextFile = unsupported("localFile.watch");
  watchDirectory = unsupported("localFile.watch");
  unwatchDirectory = unsupported("localFile.watch");
  onTextFileChanged = unsupportedSync("localFile.watch");
  onDirectoryChanged = unsupportedSync("localFile.watch");
}

class WebShellApi implements ShellApi {
  async openExternal(url: string): Promise<void> {
    window.open(url, "_blank", "noopener,noreferrer");
  }
  showInFolder = unsupported("shell.show-in-folder");
  openFileWithDefaultApp = unsupported("shell.open-with-default-app");
}

class WebSystemApi implements SystemApi {
  getFonts = unsupported("system.fonts");
  getHomeDir = unsupported("system.home-dir");
  getAppDir = unsupported("system.app-dir");
  getUserDataDir = unsupported("system.user-data-dir");
}

/**
 * Web 下无系统通知窗口：通知恒留在应用内（route 恒 "in-app"），
 * 其余通道均无对端，静默 no-op 而非抛错——通知是旁路体验，不应打断 Web 功能。
 */
const noopAsync = (): Promise<void> => Promise.resolve();
const noopSubscribe = (): (() => void) => () => undefined;

class WebNotificationApi implements NotificationApi {
  async route(): Promise<NotificationRoute> {
    return "in-app";
  }
  dismiss = noopAsync;
  action = noopAsync;
  closed = noopAsync;
  activate = noopAsync;
  setInteractive = noopAsync;
  empty = noopAsync;
  ready = noopAsync;
  inAppAction = noopAsync;
  inAppClosed = noopAsync;
  onPush = noopSubscribe;
  onDismiss = noopSubscribe;
  onRunAction = noopSubscribe;
  onInApp = noopSubscribe;
}

export const webPlatform: Platform = {
  kind: "web",
  os: detectWebOs(),
  supports: supportsWith(WEB_SUPPORTED),
  window: new WebWindowApi(),
  fileDialog: new WebFileDialogApi(),
  localFile: new WebLocalFileApi(),
  shell: new WebShellApi(),
  system: new WebSystemApi(),
  notification: new WebNotificationApi(),
};
