import { app, BrowserWindow, Tray, Menu, nativeImage } from "electron";
import path from "node:path";
import { existsSync } from "node:fs";
import log from "electron-log";

let tray: Tray | null = null;
let windowManager: any = null;

export const init = async (winManager: any, preloadPath: string) => {
  windowManager = winManager;

  // macOS 使用 Dock 和状态栏图标
  if (process.platform === "darwin") {
    createDockMenu();
    createMacOSStatusBarIcon(preloadPath);
  } else {
    // 其他平台使用系统托盘
    createTray(preloadPath);
  }

  return {
    updateTrayMenu,
    destroyTray,
  };
};

// 创建 macOS 状态栏图标
function createMacOSStatusBarIcon(preloadPath: string) {
  // 获取图标路径
  const iconPath = getMacOSStatusBarIconPath(preloadPath);

  // 创建较小的状态栏图标
  const image = nativeImage.createFromPath(iconPath);
  const resizedImage = image.resize({ width: 18, height: 18 });

  // 创建状态栏图标
  tray = new Tray(resizedImage);
  tray.setToolTip("笔记应用");

  // 设置菜单
  updateTrayMenu();

  log.info("已创建 macOS 状态栏图标");
}

// 获取 macOS 状态栏图标路径
function getMacOSStatusBarIconPath(preloadPath: string) {
  // 首选模板图标，macOS 状态栏建议使用模板图标
  const templateIconPath = path.join(
    app.isPackaged
      ? process.resourcesPath
      : path.join(process.env.APP_ROOT || "", "build"),
    "icon-template.png",
  );

  // 检查模板图标是否存在
  if (existsSync(templateIconPath)) {
    return templateIconPath;
  }

  // 使用标准图标作为备选
  const standardIconPath = path.join(
    app.isPackaged
      ? process.resourcesPath
      : path.join(process.env.APP_ROOT || "", "build"),
    "icon.png",
  );

  // 检查标准图标是否存在
  if (existsSync(standardIconPath)) {
    return standardIconPath;
  }

  // 尝试备用路径
  const alternativeIconPath = path.join(
    path.dirname(preloadPath),
    "../../build",
    "icon.png",
  );

  if (existsSync(alternativeIconPath)) {
    return alternativeIconPath;
  }

  log.error("无法找到状态栏图标文件");
  return "";
}

function createDockMenu() {
  const dockMenu = Menu.buildFromTemplate([
    {
      label: "打开新窗口",
      click: () => {
        if (windowManager) {
          windowManager.createMainWindow();
        }
      },
    },
    {
      label: "任务清单",
      click: () => {
        if (windowManager) {
          if (typeof windowManager.createTodoWindow === "function") {
            windowManager.createTodoWindow();
          }
        }
      },
    },
    {
      label: "问题管理",
      click: () => {
        if (windowManager) {
          if (typeof windowManager.createQuestionWindow === "function") {
            windowManager.createQuestionWindow();
          }
        }
      },
    },
    {
      label: "进度管理",
      click: () => {
        if (windowManager) {
          if (typeof windowManager.createGoalWindow === "function") {
            windowManager.createGoalWindow();
          }
        }
      },
    },
    {
      label: "番茄专注",
      click: () => {
        if (windowManager) {
          if (typeof windowManager.createPomodoroWindow === "function") {
            windowManager.createPomodoroWindow();
          }
        }
      },
    },
    {
      label: "打开笔记应用",
      click: () => {
        const mainWindow = BrowserWindow.getAllWindows()[0];
        if (mainWindow) {
          if (mainWindow.isMinimized()) mainWindow.restore();
          mainWindow.show();
          mainWindow.focus();
        } else if (windowManager) {
          windowManager.createMainWindow();
        }
      },
    },
  ]);

  app.dock?.setMenu(dockMenu);
}

function createTray(preloadPath: string) {
  // 托盘图标路径，根据平台选择适当的图标
  const iconPath = path.join(
    app.isPackaged
      ? process.resourcesPath
      : path.join(process.env.APP_ROOT || "", "build"),
    process.platform === "win32" ? "icon.ico" : "icon.png",
  );

  // 检查图标文件是否存在
  if (!existsSync(iconPath)) {
    log.warn(`托盘图标文件不存在: ${iconPath}，尝试使用备用路径`);
    // 尝试备用路径
    const alternativeIconPath = path.join(
      path.dirname(preloadPath),
      "../../build",
      process.platform === "win32" ? "icon.ico" : "icon.png",
    );

    if (existsSync(alternativeIconPath)) {
      // 创建托盘实例
      tray = new Tray(alternativeIconPath);
    } else {
      log.error(`备用托盘图标也不存在: ${alternativeIconPath}`);
      // 使用默认图标
      tray = new Tray("");
    }
  } else {
    // 创建托盘实例
    tray = new Tray(iconPath);
  }

  tray.setToolTip("笔记应用");

  // 创建托盘上下文菜单
  updateTrayMenu();
}

// 更新托盘菜单
function updateTrayMenu() {
  if (!tray) return;

  const contextMenu = Menu.buildFromTemplate([
    {
      label: "打开新窗口",
      click: () => {
        log.info("从托盘菜单打开新窗口");
        if (windowManager) {
          windowManager.createMainWindow();
        }
      },
    },
    {
      label: "任务清单",
      click: () => {
        if (windowManager) {
          if (typeof windowManager.createTodoWindow === "function") {
            windowManager.createTodoWindow();
          }
        }
      },
    },
    {
      label: "问题管理",
      click: () => {
        if (windowManager) {
          if (typeof windowManager.createQuestionWindow === "function") {
            windowManager.createQuestionWindow();
          }
        }
      },
    },
    {
      label: "进度管理",
      click: () => {
        if (windowManager) {
          if (typeof windowManager.createGoalWindow === "function") {
            windowManager.createGoalWindow();
          }
        }
      },
    },
    {
      label: "番茄专注",
      click: () => {
        if (windowManager) {
          if (typeof windowManager.createPomodoroWindow === "function") {
            windowManager.createPomodoroWindow();
          }
        }
      },
    },
    {
      label: "打开笔记应用",
      click: () => {
        const mainWindow = BrowserWindow.getAllWindows()[0];
        if (mainWindow) {
          if (mainWindow.isMinimized()) mainWindow.restore();
          mainWindow.show();
          mainWindow.focus();
        } else if (windowManager) {
          windowManager.createMainWindow();
        }
      },
    },
    {
      label: "番茄专注小窗",
      click: () => {
        if (
          windowManager &&
          typeof windowManager.createPomodoroMiniWindow === "function"
        ) {
          windowManager.createPomodoroMiniWindow();
        }
      },
    },
    { type: "separator" },
    {
      label: "退出",
      click: () => {
        log.info("从托盘菜单退出应用");
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);

  // 添加点击托盘图标事件
  tray.on("click", () => {
    const mainWindow = BrowserWindow.getAllWindows()[0];
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

// 清理托盘
function destroyTray() {
  if (tray) {
    tray.destroy();
    tray = null;
  }
}

export default {
  init,
};
