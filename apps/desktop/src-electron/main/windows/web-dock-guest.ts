import { session, shell, type BrowserWindow } from "electron";
import { WEB_DOCK_ESCAPE, WEB_DOCK_PARTITION, isWebUrl } from "../../../shared/web-dock";

let sessionPrepared = false;

/** HTTP(S) 下载交给系统浏览器，网页生成的文件由创建它的会话保存。 */
function prepareWebDockSession() {
  if (sessionPrepared) return;
  sessionPrepared = true;
  const webSession = session.fromPartition(WEB_DOCK_PARTITION);
  webSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  webSession.setPermissionCheckHandler(() => false);
  webSession.on("will-download", (event, item) => {
    const url = item.getURL();
    if (url.startsWith("blob:") || url.startsWith("data:")) return;
    event.preventDefault();
    if (isWebUrl(url)) void shell.openExternal(url);
  });
}

/**
 * 右栏网页的装载边界：只放行 http(s)，剥掉渲染端可能传入的 preload，强制沙箱；
 * 页内弹窗在同一个网页里打开，跳到其他协议一律拦下。其他分区的 webview 不受影响。
 */
export function guardWebDockGuests(win: BrowserWindow) {
  win.webContents.on("will-attach-webview", (event, webPreferences, params) => {
    if (params.partition !== WEB_DOCK_PARTITION) return;
    if (!isWebUrl(params.src)) {
      event.preventDefault();
      return;
    }
    prepareWebDockSession();
    delete webPreferences.preload;
    webPreferences.nodeIntegration = false;
    webPreferences.contextIsolation = true;
    webPreferences.sandbox = true;
    webPreferences.webSecurity = true;
  });
  win.webContents.on("did-attach-webview", (_event, guest) => {
    if (guest.session !== session.fromPartition(WEB_DOCK_PARTITION)) return;
    let primaryClick = false;
    guest.on("before-mouse-event", (_event, mouse) => {
      if (mouse.type === "mouseDown") primaryClick = mouse.button === "left";
    });
    // Chromium 在 macOS 将 Ctrl + 主键单击解释为鼠标上下文菜单。
    guest.on("context-menu", (event, params) => {
      if (
        process.platform !== "darwin" ||
        params.menuSourceType !== "mouse" ||
        !primaryClick ||
        !isWebUrl(params.linkURL)
      )
        return;
      primaryClick = false;
      event.preventDefault();
      void shell.openExternal(params.linkURL);
    });
    guest.setWindowOpenHandler(({ url, referrer, postBody, disposition }) => {
      if (isWebUrl(url)) {
        if (
          process.platform !== "darwin" &&
          primaryClick &&
          disposition === "background-tab" &&
          !postBody
        ) {
          primaryClick = false;
          void shell.openExternal(url);
          return { action: "deny" };
        }
        const contentType = postBody?.boundary
          ? `${postBody.contentType}; boundary=${postBody.boundary}`
          : postBody?.contentType;
        void guest.loadURL(url, {
          httpReferrer: referrer,
          postData: postBody?.data,
          extraHeaders: contentType ? `Content-Type: ${contentType}` : undefined,
        });
      }
      return { action: "deny" };
    });
    guest.on("before-input-event", (_event, input) => {
      if (
        input.type === "keyDown" &&
        input.key === "Escape" &&
        !input.isComposing &&
        !input.isAutoRepeat
      )
        win.webContents.send(WEB_DOCK_ESCAPE, guest.id);
    });
    guest.on("will-navigate", event => {
      if (!isWebUrl(event.url)) event.preventDefault();
    });
    guest.on("will-redirect", event => {
      if (!isWebUrl(event.url)) event.preventDefault();
    });
  });
}
