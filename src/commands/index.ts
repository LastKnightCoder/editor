import {invoke} from "@tauri-apps/api";

export * from './card';

export const getAppPath = () => {
  invoke('get_app_data_path').then((path) => {
    console.log('path', path);
    alert(path)
  });
}