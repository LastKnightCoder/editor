import { app, BrowserWindow, ipcMain, protocol } from 'electron';
import path, { extname } from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { createReadStream, existsSync, statSync } from 'node:fs';
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
    height: 800,
    autoHideMenuBar: true,
    icon: path.join(__dirname, '../../build/icon.png'),
    webPreferences: {
      preload,
      spellcheck: false,
    },
    trafficLightPosition: { x: 12, y: 9 },
    // Mac 专属配置
    ...(process.platform === 'darwin' && {
      titleBarStyle: 'hidden', // 隐藏标题栏但保留交通灯按钮
      frame: false // 隐藏默认窗口框架
    }),
    // Windows 配置（保持默认标题栏）
    ...(process.platform === 'win32' && {
      frame: true // 显式保留默认框架
    })
  });

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL);
    win.webContents.openDevTools();
  } else {
    win.loadFile(indexHtml);
  }
  
  // 监听最大化事件
  win.on('enter-full-screen', () => {
    win.webContents.send('full-screen-change');
  });
  win.on('leave-full-screen', () => {
    win.webContents.send('full-screen-change');
  });

  win.webContents.on('did-finish-load', () => {
    win.webContents.setZoomFactor(1);
    win.webContents.setVisualZoomLevelLimits(1, 1);
  })
};

function getMimeType(ext: string): string {
  const mimeTypes: Record<string, string> = {
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.ogg': 'video/ogg',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.bmp': 'image/bmp',
  }
  return mimeTypes[ext.toLowerCase()] || 'application/octet-stream'
}

function streamResponse(
  path: string,
  options: { status: number; headers: Record<string, string> },
  streamOptions?: { start?: number; end?: number }
) {
  const stream = createReadStream(path, streamOptions);
  return new Response(stream as unknown as ReadableStream, options);
}

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
  
  ipcMain.on('get-full-screen-status', (event) => {
    const sender = event.sender;
    const win = BrowserWindow.fromWebContents(sender);
    event.returnValue = win?.fullScreen || false;
  })

  initModules().then(() => {
    createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    })
  });

  protocol.handle('ltoh', async (request) => {
    const startTime = Date.now()
    try {
      // 转换URL为文件路径
      const parsedUrl = new URL(request.url);
      const filePath = parsedUrl.pathname.slice(process.platform === 'win32' ? 1 : 0);

      // 验证文件存在
      if (!existsSync(filePath) || !statSync(filePath).isFile()) {
        return new Response('Not Found', { status: 404 });
      }

      // 获取文件信息
      const stats = statSync(filePath);
      const fileSize = stats.size;
      const rangeHeader = request.headers.get('range') || '';
      const mimeType = getMimeType(extname(filePath));

      // 处理范围请求
      if (rangeHeader && mimeType.startsWith('video/') || mimeType.startsWith('audio/')) {
        const ranges = rangeHeader.replace(/bytes=/, '').split('-');
        const start = parseInt(ranges[0], 10);
        const end = ranges[1] ? parseInt(ranges[1], 10) : fileSize - 1;
        return streamResponse(filePath, {
          status: 206,
          headers: {
            'Content-Type': mimeType,
            'Content-Length': (end - start + 1).toString(),
            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
            'Accept-Ranges': 'bytes',
            'Cache-Control': 'public, max-age=31536000'
          }
        }, { start, end });
      }

      // 完整文件请求
      return streamResponse(filePath, {
        status: 200,
        headers: {
          'Content-Type': mimeType,
          'Content-Length': fileSize.toString(),
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'max-age=604800' // 7天缓存
        }
      });
    } catch (error) {
      console.error(`❌ 请求失败 [${Date.now() - startTime}ms]:`, error)
      return new Response('Internal Error', { status: 500 });
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
