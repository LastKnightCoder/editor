export enum ModalKey {
  WebVideo = "webVideo",
  Webview = "webview",
  Bilibili = "bilibili",
  Youtube = "youtube",
  Notion = "notion",
  NotionSync = "notionSync",
}

export type ModalStates = Record<ModalKey, boolean>;
