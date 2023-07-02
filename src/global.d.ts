import {ElectronAPI} from "@electron-toolkit/preload";

declare module 'github-api';
declare module 'mdx-mermaid/lib/Mermaid' {
  export default class Mermaid extends React.Component<{ chart: string }> {}
}
interface Window {
  api: any;
  electron: ElectronAPI;
}
