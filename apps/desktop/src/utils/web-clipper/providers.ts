import Defuddle from "defuddle";
import {
  cleanHtml,
  parseHtmlDocument,
  cleanHtmlDocument,
} from "./html-cleaner";
import { createMarkdownContent } from "./markdown-converter";
import { createSingleChunkStream } from "./stream";
import { getDomain } from "./url-utils";
import { ClipInput, ClipMeta, ClipOptions, ClipProvider } from "./types";

const DEFAULT_OPTIONS: Required<
  Pick<
    ClipOptions,
    | "smartExtractClean"
    | "removeScripts"
    | "removeStyles"
    | "removeInlineStyles"
    | "makeUrlsAbsolute"
    | "debug"
  >
> = {
  smartExtractClean: true,
  removeScripts: true,
  removeStyles: true,
  removeInlineStyles: true,
  makeUrlsAbsolute: true,
  debug: false,
};

function resolveOptions(input?: ClipOptions): ClipOptions {
  return { ...DEFAULT_OPTIONS, ...input };
}

function logMeta(options: ClipOptions | undefined, meta: ClipMeta) {
  if (options?.debug) {
    console.info("[WebClip] meta:", meta);
  }
}

export function createFullPageProvider(): ClipProvider {
  return {
    id: "full-page",
    async *clip(input: ClipInput) {
      const options = resolveOptions(input.options);
      if (input.signal?.aborted) {
        throw new Error("aborted");
      }
      const cleaned = cleanHtml(input.html, input.url, {
        removeScripts: options.removeScripts,
        removeStyles: options.removeStyles,
        removeInlineStyles: options.removeInlineStyles,
        makeUrlsAbsolute: options.makeUrlsAbsolute,
      });
      const markdown = createMarkdownContent(cleaned.cleanedHtml, input.url, {
        debug: options.debug,
      });
      const meta: ClipMeta = {
        extractorType: "full",
        title: input.title,
        url: input.url,
        domain: getDomain(input.url),
      };
      logMeta(options, meta);
      yield* createSingleChunkStream(markdown, input.signal);
    },
  };
}

export function createSmartExtractProvider(): ClipProvider {
  return {
    id: "smart-extract",
    async *clip(input: ClipInput) {
      const options = resolveOptions(input.options);
      if (input.signal?.aborted) {
        throw new Error("aborted");
      }
      const doc = parseHtmlDocument(input.html, input.url);
      const defuddleDoc = options.smartExtractClean
        ? cleanHtmlDocument(doc, {
            removeScripts: options.removeScripts,
            removeStyles: options.removeStyles,
            removeInlineStyles: options.removeInlineStyles,
            makeUrlsAbsolute: options.makeUrlsAbsolute,
          })
        : doc;

      const defuddled = new Defuddle(defuddleDoc, {
        url: input.url,
      }).parse();

      const contentHtml =
        defuddled.content || defuddleDoc.body?.innerHTML || input.html || "";

      const markdown = createMarkdownContent(contentHtml, input.url, {
        debug: options.debug,
      });

      const meta: ClipMeta = {
        extractorType: "smart",
        title: defuddled.title || input.title,
        author: defuddled.author,
        published: defuddled.published,
        description: defuddled.description,
        site: defuddled.site,
        domain: getDomain(input.url),
        wordCount: defuddled.wordCount,
        parseTime: defuddled.parseTime,
        url: input.url,
      };
      logMeta(options, meta);
      yield* createSingleChunkStream(markdown, input.signal);
    },
  };
}

export function createClipProviders() {
  return {
    fullPage: createFullPageProvider(),
    smartExtract: createSmartExtractProvider(),
  };
}
