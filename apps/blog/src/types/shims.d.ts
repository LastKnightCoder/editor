declare global {
  namespace Electron {
    interface WebviewEvent extends Event {
      readonly url?: string;
      readonly title?: string;
      readonly errorDescription?: string;
    }

    interface WebviewTag extends HTMLElement {
      getTitle(): string;
      getURL(): string;
      reload(): void;
      stop(): void;
      goBack(): void;
      goForward(): void;
      canGoBack(): boolean;
      canGoForward(): boolean;
      executeJavaScript<T>(code: string): Promise<T>;
      addEventListener(
        type: 'dom-ready' | 'did-fail-load' | 'page-title-updated' | 'did-navigate',
        listener: (event: WebviewEvent) => void,
        options?: boolean | AddEventListenerOptions,
      ): void;
      removeEventListener(
        type: 'dom-ready' | 'did-fail-load' | 'page-title-updated' | 'did-navigate',
        listener: (event: WebviewEvent) => void,
        options?: boolean | EventListenerOptions,
      ): void;
    }
  }

  interface ElectronAPI {
    invoke: (channel: string, ...args: any[]) => Promise<any>;
    on: (channel: string, listener: (...args: any[]) => void) => void;
    off: (channel: string, listener: (...args: any[]) => void) => void;
    send: (channel: string, ...args: any[]) => void;
    sendSync: (channel: string, ...args: any[]) => any;
    platform: string;
  }

  interface Window {
    electron?: ElectronAPI;
  }
}

export {};
