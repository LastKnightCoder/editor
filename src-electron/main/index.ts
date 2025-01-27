import { app, BrowserWindow, protocol, net, ipcMain } from 'electron';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import resourceModule from './modules/resource';
import databaseModule from './modules/database';
import settingModule from './modules/setting';
import llmModule from './modules/llm';
import streamFetchModule from './modules/stream-fetch';
import aliOssModule from './modules/ali-oss';
import fileModule from './modules/file';
import extraModule from './modules/extra';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true'
process.env.APP_ROOT = path.join(__dirname, '../..');

export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron');
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist');
export const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
  ? path.join(process.env.APP_ROOT, 'public')
  : RENDERER_DIST

const preload = path.join(__dirname, '../preload/index.js')
const indexHtml = path.join(RENDERER_DIST, 'index.html')

// Disable GPU Acceleration for Windows 7
if (os.release().startsWith('6.1')) app.disableHardwareAcceleration()

// Set application name for Windows 10+ notifications
if (process.platform === 'win32') app.setAppUserModelId(app.getName())

const createWindow = () => {
  const win = new BrowserWindow({
    width: 1200,
    height: 600,
    autoHideMenuBar: true,
    webPreferences: {
      preload,
    },
  });

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(indexHtml);
  }
  win.webContents.openDevTools();
};

const initModules = async () => {
  Promise.all([
    settingModule.init(),
    resourceModule.init(),
    databaseModule.init(),
    llmModule.init(),
    streamFetchModule.init(),
    aliOssModule.init(),
    fileModule.init(),
    extraModule.init(),
  ]).catch(e => {
    console.error(e);
  });
}

app.whenReady().then(() => {
  ipcMain.handle('set-always-on-top', (event, flag) => {
    const sender = event.sender;
    const window = BrowserWindow.fromWebContents(sender);
    window?.setAlwaysOnTop(flag);
  });

  initModules().then(() => {
    createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    })
  });
  protocol.handle('ltoh', (req) => {
    console.log(req);
    const url = new URL(req.url);
    return net.fetch('file://' + url.pathname);
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
