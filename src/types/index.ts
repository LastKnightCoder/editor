export * from "./card";
export * from "./article";
export * from "./document";
export * from "./time_record";
export * from "./project";
export * from "./pdf";
export * from "./white-board";
export * from "./voice-copy";
export * from "./llm";
export * from "./chat-message";
export * from "./vec-document";
export * from "./operation";
export * from "./statistic";
export * from "./search";
export * from "./video-note";

export interface WebviewRef {
  getTitle: () => string;
  getURL: () => string;
  getHTML: () => Promise<string>;
  reload: () => void;
  stop: () => void;
  goBack: () => void;
  goForward: () => void;
  canGoBack: () => boolean;
  canGoForward: () => boolean;
}
