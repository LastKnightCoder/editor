import { supportsWith, unsupported, unsupportedSync, type CapabilityId } from "./capabilities";
import type {
  FileDialogApi,
  LocalFileApi,
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
  openPomodoroWindow = unsupported("window.pomodoro-main");
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

export const webPlatform: Platform = {
  kind: "web",
  os: detectWebOs(),
  supports: supportsWith(WEB_SUPPORTED),
  window: new WebWindowApi(),
  fileDialog: new WebFileDialogApi(),
  localFile: new WebLocalFileApi(),
  shell: new WebShellApi(),
  system: new WebSystemApi(),
};
