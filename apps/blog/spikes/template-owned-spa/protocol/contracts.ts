export type DataKind = "home" | "card" | "article" | "doc" | "quest" | "list";

export interface ContentRef {
  key: string;
  type: DataKind;
  id?: number;
}

export interface ResourceRef {
  href: string;
  integrity: string;
}

export interface ManifestItem extends ContentRef {
  title: string;
  projectId?: number;
  data: string;
  integrity: string;
}

export interface DataManifest {
  version: 1;
  site: { title: string; description: string; basePath: string };
  search: { data: string; integrity: string };
  items: ManifestItem[];
}

export interface ContentNode {
  type: string;
  text?: string;
  initial?: number;
  html?: string;
  contentType?: string;
  refId?: number;
  children?: ContentNode[];
}

export interface PluginManifest {
  formatVersion: 1;
  apiVersion: 1;
  platform: "desktop";
  format: "cjs";
  id: string;
  name: string;
  version: string;
  main: string;
  styles?: string;
  editor: true;
  integrity: Record<string, string>;
}

export interface PublishedPluginRender {
  runtimeVersion: 1;
  manifest: PluginManifest;
  entry: string;
  styles?: string;
  nodeTypes: string[];
}

export interface PublishedData {
  version: 1;
  key: string;
  meta: { type: DataKind; publishTime: number };
  content: {
    title: string;
    content?: ContentNode[];
    description?: ContentNode[];
    answers?: { content: ContentNode[] }[];
    materials?: ContentRef[];
    items?: ContentRef[];
    timeline?: ContentRef[];
    tree?: { title: string; target: ContentRef }[];
    projectId?: number;
  };
  contentLinkTargets?: Record<string, ContentRef>;
  pluginRenderers?: PublishedPluginRender[];
  contentStyles?: ResourceRef[];
}

export interface DataResult {
  data: PublishedData;
  dataUrl: string;
}

export interface SearchDocument extends ContentRef {
  type: "card" | "article" | "doc" | "quest";
  title: string;
  summary: string;
  content: string;
  tags: string[];
}

export interface SearchFile {
  version: 1;
  documents: SearchDocument[];
}

export interface SearchMatch {
  field: "title" | "summary" | "content" | "tags";
  text: string;
  ranges: [number, number][];
}

export interface SearchHit extends Omit<SearchDocument, "content"> {
  matches?: SearchMatch[];
}

export interface DataClient {
  readManifest(options?: { signal?: AbortSignal }): Promise<DataManifest>;
  readData(options: { key: string; signal?: AbortSignal }): Promise<DataResult>;
  search(query: string, options?: { limit?: number; signal?: AbortSignal }): Promise<SearchHit[]>;
}
