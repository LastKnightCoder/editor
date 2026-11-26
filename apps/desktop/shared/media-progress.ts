/** Display semantics are opaque to native/transport layers. */
export interface MediaProgressSemantic {
  code?: string;
  params?: Record<string, string | number | boolean | null>;
}

export interface TranscriptionProgress extends MediaProgressSemantic {
  message?: string;
  stage?: "uploading" | "recognizing";
  fraction?: number;
}

export interface MediaProgress extends MediaProgressSemantic {
  message?: string;
  stage?: string;
  fraction?: number;
  progress?: number;
  percent?: number;
  downloaded?: number;
  total?: number;
  videoDownloaded?: number;
  videoTotal?: number;
  audioDownloaded?: number;
  audioTotal?: number;
}
