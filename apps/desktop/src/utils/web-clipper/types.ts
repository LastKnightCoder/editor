export type ClipExtractorType = "full" | "smart";

export interface ClipOptions {
  smartExtractClean?: boolean;
  removeScripts?: boolean;
  removeStyles?: boolean;
  removeInlineStyles?: boolean;
  makeUrlsAbsolute?: boolean;
  debug?: boolean;
}

export interface ClipInput {
  html: string;
  url: string;
  title?: string;
  options?: ClipOptions;
  signal?: AbortSignal;
}

export interface ClipMeta {
  extractorType: ClipExtractorType;
  title?: string;
  author?: string;
  published?: string;
  description?: string;
  site?: string;
  domain?: string;
  wordCount?: number;
  parseTime?: number;
  url?: string;
}

export type ClipStreamChunk = string;

export interface ClipProvider {
  id: string;
  clip(input: ClipInput): AsyncIterable<ClipStreamChunk>;
}

export interface HtmlCleanOptions {
  removeScripts?: boolean;
  removeStyles?: boolean;
  removeInlineStyles?: boolean;
  makeUrlsAbsolute?: boolean;
}

export interface HtmlCleanResult {
  document: Document;
  cleanedHtml: string;
}
