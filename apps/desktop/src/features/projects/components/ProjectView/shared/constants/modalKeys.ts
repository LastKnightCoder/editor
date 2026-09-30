export enum ModalKey {
  WebVideo = "webVideo",
  Webview = "webview",
  Bilibili = "bilibili",
  Youtube = "youtube",
  RemotePdf = "remotePdf",
  SelectPdf = "selectPdf",
}

export type ModalStates = Record<ModalKey, boolean>;
