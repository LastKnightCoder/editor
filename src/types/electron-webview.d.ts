declare namespace Electron {
  interface WebviewTag extends HTMLElement {
    // Properties
    src: string;
    nodeintegration: boolean;
    disablewebsecurity: boolean;
    allowpopups: boolean;
    preload: string;
    httpreferrer: string;
    useragent: string;

    // Methods
    getURL(): string;
    getTitle(): string;
    isLoading(): boolean;
    isWaitingForResponse(): boolean;
    stop(): void;
    reload(): void;
    reloadIgnoringCache(): void;
    canGoBack(): boolean;
    canGoForward(): boolean;
    goBack(): void;
    goForward(): void;
    executeJavaScript(code: string): Promise<any>;

    // Events
    addEventListener(
      event: "dom-ready",
      listener: (event: Event) => void,
    ): void;
    addEventListener(
      event: "did-finish-load",
      listener: (event: Event) => void,
    ): void;
    addEventListener(
      event: "did-fail-load",
      listener: (event: {
        errorCode: number;
        errorDescription: string;
        validatedURL: string;
        isMainFrame: boolean;
      }) => void,
    ): void;
    addEventListener(
      event: "did-frame-finish-load",
      listener: (event: { isMainFrame: boolean }) => void,
    ): void;
    addEventListener(
      event: "did-start-loading",
      listener: (event: Event) => void,
    ): void;
    addEventListener(
      event: "did-stop-loading",
      listener: (event: Event) => void,
    ): void;
    addEventListener(
      event: "did-navigate",
      listener: (event: { url: string }) => void,
    ): void;
    addEventListener(
      event: "did-navigate-in-page",
      listener: (event: { url: string; isMainFrame: boolean }) => void,
    ): void;
    addEventListener(
      event: "console-message",
      listener: (event: {
        level: number;
        message: string;
        line: number;
        sourceId: string;
      }) => void,
    ): void;
    addEventListener(
      event: "page-title-updated",
      listener: (event: { title: string; explicitSet: boolean }) => void,
    ): void;
    addEventListener(
      event: "new-window",
      listener: (event: {
        url: string;
        frameName: string;
        disposition: string;
        options: any;
      }) => void,
    ): void;
    addEventListener(event: string, listener: (event: any) => void): void;

    removeEventListener(event: string, listener: (event: any) => void): void;
  }
}
