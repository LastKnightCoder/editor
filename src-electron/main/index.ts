import { app, BrowserWindow, protocol, net, ipcMain } from 'electron';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import resourceModule from './modules/resource';
import databaseModule from './modules/database';
import settingModule from './modules/setting';
import llmModule from './modules/llm';
import streamFetchModule from './modules/stream-fetch';
import aliOssModule from './modules/ali-oss';
import fileModule from './modules/file';
import extraModule from './modules/extra';
import voiceCopyModule from './modules/voice-copy';

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
    voiceCopyModule.init(),
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
  protocol.handle('ltoh', async (req) => {
    const url = new URL(req.url);
    const res = await net.fetch('file://' + url.pathname);

    // 如果是视频或者音频
    if (['video', 'audio'].includes((res.headers.get('content-type') || '').split('/')[0])) {
      // 读取 range，可能没有 end
      const range = req.headers.get('range');
      if (range) {
        // 获取文件大小
        const size = (await fs.stat(url.pathname)).size;
        const [, start, end] = range.match(/bytes=(\d+)-(\d+)?/)!;
        const startNum = parseInt(start);
        const endNum = end ? parseInt(end) : size - 1;
        const chunkSize = endNum - startNum + 1;
        console.log(`Range: ${startNum}-${endNum}`);
        const file = await fs.open(url.pathname, 'r');
        // 读取 start 到 end 的内容
        const buffer = Buffer.alloc(chunkSize);
        await file.read(buffer, 0, chunkSize, startNum);
        // 构建 HTTP Response
        const newRes = new Response(buffer, {
          status: 206,
          headers: {
            'Content-Range': `bytes ${startNum}-${endNum}/${size}`,
            'Content-Length': `${chunkSize}`,
            'Accept-Ranges': 'bytes',
            'Content-Type': 'audio/mpeg',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          },
        });

        return newRes;
      }
    }

    return res;
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
