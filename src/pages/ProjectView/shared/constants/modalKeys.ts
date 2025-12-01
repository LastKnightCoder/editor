export enum ModalKey {
  WebVideo = "webVideo",
  Webview = "webview",
  Bilibili = "bilibili",
  Youtube = "youtube",
  Notion = "notion",
  NotionSync = "notionSync",
  RemotePdf = "remotePdf",
  RemoteEpub = "remoteEpub",
  SelectPdf = "selectPdf",
  SelectEpub = "selectEpub",
}

export type ModalStates = Record<ModalKey, boolean>;
