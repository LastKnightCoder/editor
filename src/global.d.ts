declare module 'github-api';
declare module 'reactjs-calendar-heatmap';

interface Window {
  checkUpdate: () => Promise<void>;
  electron: {
    invoke: (command: string, ...args: any[]) => Promise<any>;
    on: (command: string, callback: (...args: any[]) => void) => void;
    off: (command: string, callback: (...args: any[]) => void) => void;
    send: (command: string, ...args: any[]) => void;
    sendSync: (command: string, ...args: any[]) => any;
    platform: string;
  };
}