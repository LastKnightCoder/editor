import { ipcMain, shell } from 'electron';
import axios from 'axios';
import { Module } from '../types/module';

class Extra implements Module {
  name: string;
  constructor() {
    this.name = 'extra';
  }
  async init() {
    ipcMain.handle('open-external', async (_event, url) => {
      shell.openExternal(url);
    });
    ipcMain.handle('node-fetch', async (_event, url, options) => {
      return await this.nodeFetch(url, options);
    });
  }

  nodeFetch(url: string, options: any) {
    return axios.request({
      url,
      ...options,
    }).then(res => res.data);
  }
}

export default new Extra();