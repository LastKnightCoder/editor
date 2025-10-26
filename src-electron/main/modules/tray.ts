import { app, Tray, Menu, nativeImage } from "electron";
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

  if (!iconPath) {
    log.error("无法创建 macOS 状态栏图标，图标路径为空");
    return;
  }

  // 创建较小的状态栏图标
  const image = nativeImage.createFromPath(iconPath);
  const resizedImage = image.resize({ width: 18, height: 18 });

  // 创建状态栏图标
  tray = new Tray(resizedImage);
  tray.setToolTip("笔记应用");

  // 绑定点击事件（只绑定一次）
  tray.on("click", () => {
    if (windowManager) {
      windowManager.showOrCreateMainWindow();
    }
  });

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
  ]);

  app.dock?.setMenu(dockMenu);
}

function createTray(preloadPath: string) {
  let finalIconPath: string | null = null;

  // 托盘图标路径，根据平台选择适当的图标
  const iconPath = path.join(
    app.isPackaged
      ? process.resourcesPath
      : path.join(process.env.APP_ROOT || "", "build"),
    process.platform === "win32" ? "icon.ico" : "icon.png",
  );

  // 检查图标文件是否存在
  if (existsSync(iconPath)) {
    finalIconPath = iconPath;
    log.info(`找到托盘图标: ${iconPath}`);
  } else {
    log.warn(`托盘图标文件不存在: ${iconPath}，尝试使用备用路径`);
    // 尝试备用路径
    const alternativeIconPath = path.join(
      path.dirname(preloadPath),
      "../../build",
      process.platform === "win32" ? "icon.ico" : "icon.png",
    );

    if (existsSync(alternativeIconPath)) {
      finalIconPath = alternativeIconPath;
      log.info(`找到备用托盘图标: ${alternativeIconPath}`);
    } else {
      log.error(`备用托盘图标也不存在: ${alternativeIconPath}`);
      log.error("将尝试创建没有图标的托盘");
    }
  }

  try {
    // 创建托盘实例
    if (finalIconPath) {
      tray = new Tray(finalIconPath);
      log.info(`已创建托盘图标: ${finalIconPath}`);
    } else {
      // 尝试使用空的 nativeImage
      const emptyImage = nativeImage.createEmpty();
      tray = new Tray(emptyImage);
      log.warn("已创建空图标的托盘（图标文件未找到）");
    }

    tray.setToolTip("笔记应用");

    // 绑定点击事件（只绑定一次）
    tray.on("click", () => {
      if (windowManager) {
        windowManager.showOrCreateMainWindow();
      }
    });

    // 创建托盘上下文菜单
    updateTrayMenu();
  } catch (error) {
    log.error("创建托盘失败:", error);
    tray = null;
  }
}

// 更新托盘菜单
function updateTrayMenu() {
  if (!tray) {
    log.warn("托盘未创建，无法更新菜单");
    return;
  }

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
  log.debug("托盘菜单已更新");
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
