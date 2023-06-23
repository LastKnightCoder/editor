import {ElectronAPI} from "@electron-toolkit/preload";

declare module 'github-api';
declare module 'mdx-mermaid/lib/Mermaid';

interface Window {
  api: any;
  electron: ElectronAPI;
}
