import type { Descendant } from "slate";
import type { ContentLinkTarget, InitData } from "@blog/types";

export type ContentLinkTargetMap = Record<string, ContentLinkTarget>;

export type ResolvedContentLinkTarget = ContentLinkTarget & {
  key: string;
};

export type PreviewFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export type ContentLinkPreviewData = {
  href: string;
  title: string;
  content: Descendant[];
  pluginRenderers?: InitData["pluginRenderers"];
  baseUrl?: string;
};

type ContentLinkIdentity = {
  contentType?: unknown;
  refId?: unknown;
};

const EMPTY_CONTENT: Descendant[] = [
  {
    type: "paragraph",
    children: [{ type: "formatted", text: "" }],
  } as Descendant,
];

function readText(input: unknown): string {
  return typeof input === "string" ? input.trim() : "";
}

function readNumber(input: unknown): number {
  if (typeof input === "number" && Number.isFinite(input)) {
    return input;
  }
  if (typeof input === "string" && input.trim()) {
    const parsed = Number(input);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return -1;
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return !!input && typeof input === "object";
}

function extractJsonObjectLiteral(source: string, start: number): string | null {
  if (source[start] !== "{") {
    return null;
  }

  let depth = 0;
  let inString = false;
  let escape = false;

  for (let index = start; index < source.length; index++) {
    const char = source[index];

    if (inString) {
      if (escape) {
        escape = false;
        continue;
      }
      if (char === "\\") {
        escape = true;
        continue;
      }
      if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === "{") {
      depth += 1;
      continue;
    }

    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(start, index + 1);
      }
    }
  }

  return null;
}

function resolvePreviewTitle(initData: InitData, fallbackTitle: string): string {
  if (isRecord(initData.content)) {
    const contentTitle = readText(initData.content.title);
    if (contentTitle) {
      return contentTitle;
    }
  }
  const trimmedFallback = readText(fallbackTitle);
  if (trimmedFallback) {
    return trimmedFallback;
  }
  return "内容预览";
}

function resolvePreviewContent(initData: InitData): Descendant[] {
  if (!isRecord(initData.content)) {
    return EMPTY_CONTENT;
  }
  const rawContent = initData.content.content;
  if (!Array.isArray(rawContent) || rawContent.length === 0) {
    return EMPTY_CONTENT;
  }
  return rawContent as Descendant[];
}

async function resolveDevPreviewData(
  href: string,
  fallbackTitle: string
): Promise<ContentLinkPreviewData | null> {
  // @ts-ignore - Vite injects import.meta.env
  if (!import.meta.env.DEV) {
    return null;
  }

  const normalizedHref = href.split("?")[0];
  const mockModule = await import("@blog/mock/data");

  let initData: InitData | null = null;

  if (normalizedHref.endsWith("/src/templates/card/index.html")) {
    initData = mockModule.mockCardPageData;
  } else if (normalizedHref.endsWith("/src/templates/doc/index.html")) {
    initData = mockModule.mockDocPageData;
  } else if (normalizedHref.endsWith("/src/templates/article/index.html")) {
    initData = mockModule.mockArticlePageData;
  } else if (normalizedHref.endsWith("/src/templates/home/index.html")) {
    initData = mockModule.mockHomePageData;
  }

  if (!initData) {
    return null;
  }

  return {
    href,
    title: resolvePreviewTitle(initData, fallbackTitle),
    content: resolvePreviewContent(initData),
  };
}

export function buildContentLinkTargetKey(contentType: string, refId: number): string {
  return `${contentType}:${refId}`;
}

export function resolveContentLinkTarget(
  identity: ContentLinkIdentity,
  targets?: ContentLinkTargetMap
): ResolvedContentLinkTarget | null {
  if (!targets) {
    return null;
  }
  const contentType = readText(identity.contentType);
  const refId = readNumber(identity.refId);
  if (!contentType || refId <= 0) {
    return null;
  }
  const key = buildContentLinkTargetKey(contentType, refId);
  const target = targets[key];
  if (!target || !readText(target.href)) {
    return null;
  }
  return { ...target, key };
}

export function extractInitDataJson(html: string): string | null {
  const marker = "window._INIT_DATA_";
  const markerIndex = html.indexOf(marker);
  if (markerIndex < 0) {
    return null;
  }

  const equalIndex = html.indexOf("=", markerIndex);
  if (equalIndex < 0) {
    return null;
  }

  const objectStart = html.indexOf("{", equalIndex);
  if (objectStart < 0) {
    return null;
  }

  return extractJsonObjectLiteral(html, objectStart);
}

export function parseInitDataFromHtml(html: string): InitData | null {
  const json = extractInitDataJson(html);
  if (!json) {
    return null;
  }
  try {
    return JSON.parse(json) as InitData;
  } catch {
    return null;
  }
}

export function createContentLinkPreviewLoader(fetchImpl: PreviewFetch = fetch) {
  const resolvedCache = new Map<string, ContentLinkPreviewData>();
  const inflightCache = new Map<string, Promise<ContentLinkPreviewData>>();

  const load = async (href: string, fallbackTitle: string): Promise<ContentLinkPreviewData> => {
    const trimmedHref = readText(href);
    if (!trimmedHref) {
      throw new Error("PREVIEW_HREF_EMPTY");
    }

    const cached = resolvedCache.get(trimmedHref);
    if (cached) {
      return cached;
    }

    const existingInflight = inflightCache.get(trimmedHref);
    if (existingInflight) {
      return existingInflight;
    }

    const inflight = (async () => {
      const response = await fetchImpl(trimmedHref, {
        method: "GET",
        credentials: "same-origin",
      });
      if (!response.ok) {
        throw new Error(`PREVIEW_FETCH_FAILED_${response.status}`);
      }
      const html = await response.text();
      const initData = parseInitDataFromHtml(html);
      if (!initData) {
        const devPreviewData = await resolveDevPreviewData(trimmedHref, fallbackTitle);
        if (devPreviewData) {
          resolvedCache.set(trimmedHref, devPreviewData);
          return devPreviewData;
        }
        throw new Error("PREVIEW_PARSE_FAILED");
      }

      const data: ContentLinkPreviewData = {
        href: trimmedHref,
        title: resolvePreviewTitle(initData, fallbackTitle),
        content: resolvePreviewContent(initData),
        ...(initData.pluginRenderers?.length
          ? {
              pluginRenderers: initData.pluginRenderers,
              baseUrl: response.url || new URL(trimmedHref, window.location.href).href,
            }
          : {}),
      };
      resolvedCache.set(trimmedHref, data);
      return data;
    })();

    inflightCache.set(trimmedHref, inflight);

    try {
      return await inflight;
    } finally {
      inflightCache.delete(trimmedHref);
    }
  };

  return {
    load,
    clear: () => {
      resolvedCache.clear();
      inflightCache.clear();
    },
  };
}
