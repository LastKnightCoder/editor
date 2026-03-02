export interface EpubMetadataInput {
  title: string;
  author: string;
  language: string;
  description: string;
  coverImageSrc?: string;
}

export interface EpubChapter {
  id: string;
  title: string;
  xhtml: string;
}

export interface EpubAsset {
  id: string;
  fileName: string;
  mimeType: string;
  bytes: Uint8Array;
}

export interface EpubExportPayload {
  metadata: EpubMetadataInput;
  chapters: EpubChapter[];
  assets: EpubAsset[];
  defaultFileName: string;
}

export interface EpubExportResult {
  canceled: boolean;
  filePath: string | null;
  warnings: string[];
}
