declare module 'github-api';


interface Window {
  checkUpdate: () => Promise<void>;
}