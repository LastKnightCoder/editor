import { contextBridge } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import {
  insertCard,
  deleteCard,
  updateCard,
  getAllCards,
} from './card';

const api = {
  insertCard,
  deleteCard,
  updateCard,
  getAllCards,
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore (define in dts)
  window.api = api
}