import { BrowserWindow, ipcMain } from "electron";
import path from "node:path";
import log from "electron-log";

// 从主进程导入的变量
let VITE_DEV_SERVER_URL: string;
let indexHtml: string;
let preload: string;

// 窗口类型定义
type EditorType =
  | "card"
  | "article"
  | "project-item"
  | "document-item"
  | "markdown";

// 窗口参数定义
interface EditorParams {
  databaseName?: string;
  itemId?: number;
  filePath?: string;
  showTitlebar?: boolean;
  isDefaultTop?: boolean;
}

// 窗口管理器
export class WindowManager {
  // 窗口映射
  private windowsMap = new Map<EditorType, Map<string, BrowserWindow>>();

  constructor(
    viteDevServerUrl: string,
    rendererDistPath: string,
    preloadPath: string,
  ) {
    log.info("初始化窗口管理器");
    VITE_DEV_SERVER_URL = viteDevServerUrl;
    indexHtml = path.join(rendererDistPath, "index.html");
    preload = preloadPath;

    // 初始化窗口映射
    this.windowsMap.set("card", new Map<string, BrowserWindow>());
    this.windowsMap.set("article", new Map<string, BrowserWindow>());
    this.windowsMap.set("project-item", new Map<string, BrowserWindow>());
    this.windowsMap.set("document-item", new Map<string, BrowserWindow>());
    this.windowsMap.set("markdown", new Map<string, BrowserWindow>());

    this.registerIpcHandlers();
  }

  // 注册IPC处理程序
  private registerIpcHandlers() {
    log.info("注册窗口相关IPC处理程序");

    ipcMain.handle("set-always-on-top", (event, flag) => {
      const sender = event.sender;
      const window = BrowserWindow.fromWebContents(sender);
      log.debug(`设置窗口置顶状态: ${flag}`);
      window?.setAlwaysOnTop(flag);
    });

    ipcMain.on("get-full-screen-status", (event) => {
      const sender = event.sender;
      const win = BrowserWindow.fromWebContents(sender);
      event.returnValue = win?.fullScreen || false;
    });

    ipcMain.handle(
      "open-card-in-new-window",
      (
        _event,
        databaseName,
        cardId,
        options: Pick<EditorParams, "showTitlebar" | "isDefaultTop">,
      ) => {
        log.info(`打开卡片编辑器窗口: ${databaseName}, ${cardId}`);
        this.createEditorWindow("card", {
          databaseName,
          itemId: cardId,
          ...options,
        });
      },
    );

    ipcMain.handle(
      "open-article-in-new-window",
      (
        _event,
        databaseName,
        articleId,
        options: Pick<EditorParams, "showTitlebar" | "isDefaultTop">,
      ) => {
        log.info(`打开文章编辑器窗口: ${databaseName}, ${articleId}`);
        this.createEditorWindow("article", {
          databaseName,
          itemId: articleId,
          ...options,
        });
      },
    );

    ipcMain.handle(
      "open-project-item-in-new-window",
      (
        _event,
        databaseName,
        projectItemId,
        options: Pick<EditorParams, "showTitlebar" | "isDefaultTop">,
      ) => {
        log.info(`打开项目编辑器窗口: ${databaseName}, ${projectItemId}`);
        this.createEditorWindow("project-item", {
          databaseName,
          itemId: projectItemId,
          ...options,
        });
      },
    );

    ipcMain.handle(
      "open-document-item-in-new-window",
      (
        _event,
        databaseName,
        documentItemId,
        options: Pick<EditorParams, "showTitlebar" | "isDefaultTop">,
      ) => {
        log.info(`打开文档编辑器窗口: ${databaseName}, ${documentItemId}`);
        this.createEditorWindow("document-item", {
          databaseName,
          itemId: documentItemId,
          ...options,
        });
      },
    );

    ipcMain.handle(
      "open-markdown-in-new-window",
      (
        _event,
        filePath,
        options: Pick<EditorParams, "showTitlebar" | "isDefaultTop">,
      ) => {
        log.info(`打开Markdown编辑器窗口: ${filePath}`);
        this.createEditorWindow("markdown", { filePath, ...options });
      },
    );

    ipcMain.handle("close-window", (event) => {
      const sender = event.sender;
      const win = BrowserWindow.fromWebContents(sender);
      win?.close();
    });
  }

  // 创建主窗口
  public createMainWindow() {
    const win = new BrowserWindow({
      width: 1200,
      height: 800,
      autoHideMenuBar: true,
      icon: path.join(path.dirname(preload), "../../build/icon.png"),
      webPreferences: {
        preload,
        spellcheck: false,
        webviewTag: true,
      },
      trafficLightPosition: { x: 12, y: 23 },
      // Mac 专属配置
      ...(process.platform === "darwin" && {
        titleBarStyle: "hidden" as const,
        frame: false,
      }),
      // Windows 配置（保持默认标题栏）
      ...(process.platform === "win32" && {
        frame: true,
      }),
    });

    if (VITE_DEV_SERVER_URL) {
      log.debug("开发模式：加载开发服务器URL");
      win.loadURL(VITE_DEV_SERVER_URL);
      win.webContents.openDevTools();
    } else {
      log.debug("生产模式：加载本地HTML文件");
      win.loadFile(indexHtml);
    }

    // 监听最大化事件
    win.on("enter-full-screen", () => {
      win.webContents.send("full-screen-change");
    });
    win.on("leave-full-screen", () => {
      win.webContents.send("full-screen-change");
    });

    win.on("focus", () => {
      win.webContents.send("window-focus");
    });

    win.on("blur", () => {
      win.webContents.send("window-blur");
    });

    win.webContents.on(
      "did-fail-load",
      (_event, errorCode, errorDescription, validatedURL) => {
        log.error(
          `主窗口加载失败: ${errorCode} - ${errorDescription}, URL: ${validatedURL}`,
        );
      },
    );

    return win;
  }

  // 创建基础窗口配置
  private createBaseWindowConfig() {
    return {
      width: 800,
      height: 600,
      autoHideMenuBar: true,
      icon: path.join(path.dirname(preload), "../../build/icon.png"),
      webPreferences: {
        preload,
        spellcheck: false,
      },
      trafficLightPosition: { x: 12, y: 17 },
      // Mac 专属配置
      ...(process.platform === "darwin" && {
        titleBarStyle: "hidden" as const,
        frame: false,
      }),
      // Windows 配置（保持默认标题栏）
      ...(process.platform === "win32" && {
        frame: true,
      }),
    };
  }

  // 设置窗口公共事件
  private setupWindowEvents(win: BrowserWindow) {
    win.on("enter-full-screen", () => {
      win.webContents.send("full-screen-change");
    });
    win.on("leave-full-screen", () => {
      win.webContents.send("full-screen-change");
    });

    win.on("focus", () => {
      win.webContents.send("window-focus");
    });

    win.on("blur", () => {
      win.webContents.send("window-blur");
    });

    // 添加错误处理
    win.webContents.on(
      "did-fail-load",
      (_event, errorCode, errorDescription, validatedURL) => {
        log.error(
          `主窗口加载失败: ${errorCode} - ${errorDescription}, URL: ${validatedURL}`,
        );
      },
    );

    if (VITE_DEV_SERVER_URL) {
      win.webContents.openDevTools();
    }
  }

  // 获取编辑器路由路径
  private getEditorRoute(type: EditorType): string {
    const routes: Record<EditorType, string> = {
      card: "single-card-editor",
      article: "single-article-editor",
      "project-item": "single-project-item-editor",
      "document-item": "single-document-item-editor",
      markdown: "single-markdown-editor",
    };
    return routes[type];
  }

  // 获取参数名称
  private getParamName(type: EditorType): string {
    const paramNames: Record<EditorType, string> = {
      card: "cardId",
      article: "articleId",
      "project-item": "projectItemId",
      "document-item": "documentItemId",
      markdown: "filePath",
    };
    return paramNames[type];
  }

  // 获取编辑器名称
  private getEditorName(type: EditorType): string {
    const editorNames: Record<EditorType, string> = {
      card: "卡片",
      article: "文章",
      "project-item": "项目",
      "document-item": "知识库",
      markdown: "Markdown",
    };
    return editorNames[type];
  }

  // 创建快速卡片窗口
  public createQuickCardWindow() {
    log.info("创建快速卡片窗口");
    const win = new BrowserWindow(this.createBaseWindowConfig());

    this.setupWindowEvents(win);

    const params = `showTitlebar=true&isDefaultTop=true`;

    if (VITE_DEV_SERVER_URL) {
      log.debug("开发模式：加载开发服务器URL");
      win.loadURL(`${VITE_DEV_SERVER_URL}#/quick-card?${params}`);
    } else {
      log.debug("生产模式：加载本地HTML文件");
      win.loadFile(indexHtml, {
        hash: `/quick-card?${params}`,
      });
    }

    win.setAlwaysOnTop(true);

    return win;
  }

  // 通用创建编辑器窗口方法
  public createEditorWindow(type: EditorType, params: EditorParams) {
    const {
      databaseName,
      itemId,
      filePath,
      showTitlebar = false,
      isDefaultTop = false,
    } = params;
    let windowKey = "";

    if (type === "markdown") {
      windowKey = filePath || "";
    } else {
      windowKey = `${databaseName}-${itemId}`;
    }

    const editorName = this.getEditorName(type);
    const windowMap = this.windowsMap.get(type)!;

    log.debug(
      `尝试创建${editorName}编辑器窗口: ${type === "markdown" ? filePath : `${databaseName}, ${itemId}`}`,
    );

    // 检查窗口是否已存在
    if (windowMap.has(windowKey)) {
      const existingWindow = windowMap.get(windowKey);
      if (existingWindow && !existingWindow.isDestroyed()) {
        log.debug(`${editorName}窗口已存在，聚焦窗口: ${windowKey}`);
        existingWindow.show();
        existingWindow.focus();
        return;
      }
    }

    const win = new BrowserWindow(this.createBaseWindowConfig());

    // 存储窗口引用
    windowMap.set(windowKey, win);
    win.setAlwaysOnTop(isDefaultTop);
    this.setupWindowEvents(win);

    // 构建URL
    const route = this.getEditorRoute(type);
    const paramName = this.getParamName(type);

    let url = "";

    let urlParams = "";
    if (type === "markdown") {
      const encodedFilePath = encodeURIComponent(filePath || "");
      urlParams = `${paramName}=${encodedFilePath}&showTitlebar=${showTitlebar}&isDefaultTop=${isDefaultTop}`;
    } else {
      urlParams = `databaseName=${databaseName}&${paramName}=${itemId}&showTitlebar=${showTitlebar}&isDefaultTop=${isDefaultTop}`;
    }

    log.info(`加载${editorName}编辑器URL: ${url}`);
    if (VITE_DEV_SERVER_URL) {
      log.info(`开发模式: 加载URL: ${url}`);
      url = `${VITE_DEV_SERVER_URL}#/${route}?${urlParams}`;
      win.loadURL(url);
    } else {
      log.info(`生产模式: 加载文件: ${url}`);
      win.loadFile(indexHtml, {
        hash: `/${route}?${urlParams}`,
      });
    }

    win.on("closed", () => {
      log.debug(`${editorName}编辑器窗口关闭: ${windowKey}`);
      windowMap.delete(windowKey);
    });
  }

  // 为向后兼容而保留的方法
  public createCardEditorWindow(
    databaseName: string,
    cardId: number,
    options: Pick<EditorParams, "showTitlebar" | "isDefaultTop">,
  ) {
    return this.createEditorWindow("card", {
      databaseName,
      itemId: cardId,
      ...options,
    });
  }

  // 为向后兼容而保留的方法
  public createArticleEditorWindow(
    databaseName: string,
    articleId: number,
    options: Pick<EditorParams, "showTitlebar" | "isDefaultTop">,
  ) {
    return this.createEditorWindow("article", {
      databaseName,
      itemId: articleId,
      ...options,
    });
  }

  // 为向后兼容而保留的方法
  public createProjectItemEditorWindow(
    databaseName: string,
    projectItemId: number,
    options: Pick<EditorParams, "showTitlebar" | "isDefaultTop">,
  ) {
    return this.createEditorWindow("project-item", {
      databaseName,
      itemId: projectItemId,
      ...options,
    });
  }

  // 为向后兼容而保留的方法
  public createDocumentItemEditorWindow(
    databaseName: string,
    documentItemId: number,
    options: Pick<EditorParams, "showTitlebar" | "isDefaultTop">,
  ) {
    return this.createEditorWindow("document-item", {
      databaseName,
      itemId: documentItemId,
      ...options,
    });
  }
}

export default {
  init: async (
    viteDevServerUrl: string,
    rendererDistPath: string,
    preloadPath: string,
  ) => {
    return new WindowManager(viteDevServerUrl, rendererDistPath, preloadPath);
  },
};
