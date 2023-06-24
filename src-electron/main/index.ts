import {app, BrowserWindow, shell, ipcMain} from 'electron'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import BetterSqlite3 from 'better-sqlite3';

import * as path from 'path'
import {initDatabase} from "./database";
import { insertCard, getAllCards, updateCard, deleteCard } from "./database/card";

const createWindow = () => {
  const win = new BrowserWindow({
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: false
    },
  });

  win.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  win.on('ready-to-show', () => {
    win.show()
  })

  // Load the local URL for development or the local
  // html file for production
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(path.join(__dirname, '../../index.html'))
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.tao.editor')
  const db = new BetterSqlite3('test.db');
  initDatabase(db);

  ipcMain.handle('insert_card', async (event, card) => {
    return await insertCard(db, card);
  });
  ipcMain.handle('find_all_cards', async () => {
    return await getAllCards(db);
  });
  ipcMain.handle('delete_one_card', async (event, id) => {
    return await deleteCard(db, id);
  });
  ipcMain.handle('update_one_card', async (event, card) => {
    return await updateCard(db, card);
  });

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})