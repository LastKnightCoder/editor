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
  RemoteAudio = "remoteAudio",
  XiaoyuzhouPodcast = "xiaoyuzhouPodcast",
  BilibiliAudio = "bilibiliAudio",
  YoutubeAudio = "youtubeAudio",
}

export type ModalStates = Record<ModalKey, boolean>;
