export enum ModalKey {
  WebVideo = "webVideo",
  Webview = "webview",
  OnlineVideo = "onlineVideo",
  RemotePdf = "remotePdf",
  SelectPdf = "selectPdf",
}

export type ModalStates = Record<ModalKey, boolean>;
