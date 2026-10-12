import type {
  DirectoryChangedPayload,
  DirectoryEntry,
  FileSelectOptions,
  LocalFileApi,
  NotificationActionResult,
  NotificationApi,
  NotificationRunActionRequest,
  NotificationRoute,
  NotificationRouteOptions,
  Platform,
  PlatformOs,
  SaveFilePayload,
  SaveFileResult,
  EditorWindowTarget,
  SystemNotificationPayload,
  TextFileChangedPayload,
  WindowState,
} from "./types";

/**
 * RPC 通道注入协议：宿主应用把渲染进程的 invoke/on/off 网关传入，
 * 使本包不反向依赖应用代码（未来 Web Server 独立 app 同样可复用）。
 */
export interface PlatformInvoker {
  invoke<T = unknown>(channel: string, ...args: unknown[]): Promise<T>;
  on(channel: string, listener: (...args: unknown[]) => void): void;
  off(channel: string, listener: (...args: unknown[]) => void): void;
}

/**
 * 构造 Electron 平台实现。channel 与主进程 modules 的 handler 一一对应，
 * 全部能力可用（supports 恒真）。
 */
export function createElectronPlatform(rpc: PlatformInvoker, os: PlatformOs): Platform {
  const { invoke, on, off } = rpc;

  // 事件通道的推送格式为 (占位 event, payload)，payload 在第二参
  const subscribe = (channel: string, emit: (...args: unknown[]) => void): (() => void) => {
    on(channel, emit);
    return () => off(channel, emit);
  };

  return {
    kind: "electron",
    os,
    supports: () => true,
    window: {
      close: () => invoke<void>("close-window"),
      minimize: () => invoke<void>("minimize-window"),
      maximize: () => invoke<void>("maximize-window"),
      toggleFullScreen: () => invoke<void>("toggle-fullscreen"),
      setAlwaysOnTop: (flag: boolean) => invoke<void>("set-always-on-top", flag),
      getState: () => invoke<WindowState>("get-window-state"),
      showAndFocus: () => invoke<void>("show-and-focus-window"),
      openMarkdownWindow: (path?: string) => invoke<void>("open-markdown-window", path),
      openEditorWindow: (target: EditorWindowTarget) => invoke<void>("open-editor-window", target),
      closeEditorWindow: (target: EditorWindowTarget) =>
        invoke<void>("close-editor-window", target),
      openPomodoroMiniWindow: () => invoke<void>("open-pomodoro-mini-window"),
      hidePomodoroMiniWindow: () => invoke<void>("hide-pomodoro-mini-window"),
      openPomodoroImmersiveWindow: () => invoke<void>("open-pomodoro-immersive-window"),
      hidePomodoroImmersiveWindow: () => invoke<void>("hide-pomodoro-immersive-window"),
      onMaximizedChange: (callback: (maximized: boolean) => void) => {
        const dispose = [
          subscribe("window-maximized", () => callback(true)),
          subscribe("window-unmaximized", () => callback(false)),
        ];
        return () => dispose.forEach(fn => fn());
      },
      // 主进程 full-screen-change 为单通道无 payload，收到后回查状态取真值
      onFullScreenChange: (callback: (fullScreen: boolean) => void) =>
        subscribe("full-screen-change", () => {
          invoke<WindowState>("get-window-state").then(
            state => callback(state.isFullScreen),
            () => callback(false)
          );
        }),
      onFocusChange: (callback: (focused: boolean) => void) => {
        const dispose = [
          subscribe("window-focus", () => callback(true)),
          subscribe("window-blur", () => callback(false)),
        ];
        return () => dispose.forEach(fn => fn());
      },
    },
    fileDialog: {
      selectFile: (options?: FileSelectOptions) => invoke<string[] | null>("select-file", options),
      selectDirectory: () => invoke<string | null>("select-directory-with-dialog"),
      saveFile: (payload: SaveFilePayload) =>
        invoke<SaveFileResult>("save-file-with-dialog", payload),
      downloadFile: (url: string, defaultFileName?: string) =>
        invoke<string | null>("download-file-with-dialog", url, defaultFileName),
    },
    localFile: {
      readTextFile: (path: string) => invoke<string>("read-text-file", path),
      writeTextFile: (path: string, contents: string) =>
        invoke<void>("write-text-file", path, contents),
      readBinaryFile: (path: string) => invoke<Uint8Array>("read-binary-file", path),
      writeBinaryFile: (path: string, contents: Uint8Array) =>
        invoke<void>("write-binary-file", path, contents),
      createTextFileExclusive: (path: string, contents: string) =>
        invoke<void>("create-text-file-exclusive", path, contents),
      removeFile: (path: string) => invoke<void>("remove-file", path),
      rename: (oldPath: string, newPath: string) =>
        invoke<void>("rename-file-or-directory", oldPath, newPath),
      createDir: (path: string) => invoke<void>("create-dir", path),
      exists: (path: string) => invoke<boolean>("path-exists", path),
      readDirectory: (path: string) => invoke<DirectoryEntry[]>("read-directory", path),
      watchTextFile: (path: string) => invoke<void>("watch-text-file", path),
      unwatchTextFile: (path: string) => invoke<void>("unwatch-text-file", path),
      watchDirectory: (path: string) => invoke<void>("watch-directory", path),
      unwatchDirectory: (path: string) => invoke<void>("unwatch-directory", path),
      onTextFileChanged: (callback: (payload: TextFileChangedPayload) => void) =>
        subscribe("text-file-changed", (...args) => callback(args[1] as TextFileChangedPayload)),
      onDirectoryChanged: (callback: (payload: DirectoryChangedPayload) => void) =>
        subscribe("directory-changed", (...args) => callback(args[1] as DirectoryChangedPayload)),
    } satisfies LocalFileApi,
    shell: {
      openExternal: (url: string) => invoke<void>("open-external", url),
      showInFolder: (path: string) => invoke<void>("show-in-folder", path),
      openFileWithDefaultApp: (path: string) => invoke<string>("open-file-with-default-app", path),
    },
    system: {
      getFonts: () => invoke<string[]>("get-all-fonts"),
      getHomeDir: () => invoke<string>("get-home-dir"),
      getAppDir: () => invoke<string>("get-app-dir"),
      getUserDataDir: () => invoke<string>("get-user-data-dir"),
    },
    notification: {
      route: (payload: SystemNotificationPayload, options?: NotificationRouteOptions) =>
        invoke<NotificationRoute>("notification:route", payload, options),
      dismiss: (id: string) => invoke<void>("notification:dismiss", id),
      action: (id: string, index: number) => invoke<void>("notification:action", id, index),
      closed: (id: string) => invoke<void>("notification:closed", id),
      activate: (id: string) => invoke<void>("notification:activate", id),
      setInteractive: (interactive: boolean) =>
        invoke<void>("notification-window:set-interactive", interactive),
      empty: () => invoke<void>("notification-window:empty"),
      ready: () => invoke<void>("notification-window:ready"),
      inAppAction: (id: string, index: number) =>
        invoke<void>("notification:in-app-action", id, index),
      inAppClosed: (id: string) => invoke<void>("notification:in-app-closed", id),
      onPush: (callback: (payload: SystemNotificationPayload) => void) =>
        subscribe("notification-window:push", (...args) =>
          callback(args[1] as SystemNotificationPayload)
        ),
      onDismiss: (callback: (id?: string) => void) =>
        subscribe("notification-window:dismiss", (...args) =>
          callback(args[1] as string | undefined)
        ),
      onRunAction: (callback: (request: NotificationRunActionRequest) => Promise<void> | void) =>
        subscribe("notification:run-action", (...args) => {
          const request = args[1] as NotificationRunActionRequest;
          // 回调由调用方执行，成败都在此回报，调用方无须感知 action-result 通道
          Promise.resolve(callback(request)).then(
            () =>
              invoke<void>("notification:action-result", {
                requestId: request.requestId,
                ok: true,
              } satisfies NotificationActionResult).catch(() => undefined),
            error => {
              const message =
                error instanceof Error && error.message
                  ? error.message
                  : typeof error === "string" && error
                    ? error
                    : "操作失败";
              invoke<void>("notification:action-result", {
                requestId: request.requestId,
                ok: false,
                error: message,
              } satisfies NotificationActionResult).catch(() => undefined);
            }
          );
        }),
      onInApp: (callback: (payload: SystemNotificationPayload) => void) =>
        subscribe("notification:in-app", (...args) =>
          callback(args[1] as SystemNotificationPayload)
        ),
    } satisfies NotificationApi,
  };
}
