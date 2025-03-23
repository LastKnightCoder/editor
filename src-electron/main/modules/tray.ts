import { app, BrowserWindow, Tray, Menu } from "electron";
import path from "node:path";
import { existsSync } from "node:fs";
import log from "electron-log";

let tray: Tray | null = null;
let windowManager: any = null;

export const init = async (winManager: any, preloadPath: string) => {
  windowManager = winManager;
  createTray(preloadPath);
  return {
    updateTrayMenu,
    destroyTray,
  };
};

// 创建系统托盘
function createTray(preloadPath: string) {
  // 托盘图标路径，根据平台选择适当的图标
  const iconPath = path.join(
    app.isPackaged
      ? process.resourcesPath
      : path.join(process.env.APP_ROOT || "", "build"),
    process.platform === "win32" ? "icon.ico" : "icon.png",
  );

  log.info(`创建系统托盘，图标路径: ${iconPath}`);

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
      log.info(`使用备用托盘图标: ${alternativeIconPath}`);
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
