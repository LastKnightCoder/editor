import type { EpubChapter } from "@/types";

type ChapterSplitTag = "h1" | "h2" | null;

export interface BuildChaptersOptions {
  fallbackTitle?: string;
}

export interface BuildChaptersResult {
  chapters: EpubChapter[];
  strategy: ChapterSplitTag | "single";
}

const DEFAULT_CHAPTER_TITLE_PREFIX = "第";

const normalizeText = (value?: string) => (value || "").trim();

const hasMeaningfulElement = (root: ParentNode) => {
  return Boolean(
    root.querySelector(
      [
        "img",
        "svg",
        "math",
        "mjx-container",
        "table",
        "pre",
        "code",
        "blockquote",
        "hr",
        "audio",
        "video",
        "iframe",
        ".media-placeholder",
        ".image-placeholder",
        ".diagram-svg",
        ".block-math",
        ".inline-math",
      ].join(","),
    ),
  );
};

export const isMeaningfulHtmlFragment = (html: string) => {
  const doc = new DOMParser().parseFromString(
    `<div id="epub-fragment-root">${html || ""}</div>`,
    "text/html",
  );
  const root = doc.getElementById("epub-fragment-root");
  if (!root) {
    return false;
  }
  const text = normalizeText((root.textContent || "").replace(/\u00a0/g, " "));
  if (text) {
    return true;
  }
  return hasMeaningfulElement(root);
};

const getSafeChapterTitle = (
  rawTitle: string,
  index: number,
  fallbackTitle?: string,
) => {
  const normalized = normalizeText(rawTitle);
  if (normalized) {
    return normalized;
  }
  if (index === 0 && normalizeText(fallbackTitle)) {
    return normalizeText(fallbackTitle);
  }
  return `${DEFAULT_CHAPTER_TITLE_PREFIX}${index + 1}章`;
};

const fragmentToHtml = (doc: Document, fragment: DocumentFragment) => {
  const container = doc.createElement("div");
  container.appendChild(fragment);
  const html = container.innerHTML.trim();
  return html || "<p></p>";
};

const extractRangeHtml = (
  doc: Document,
  root: HTMLElement,
  start: { atRootStart?: boolean; node?: Element },
  end: { atRootEnd?: boolean; node?: Element },
) => {
  const range = doc.createRange();
  if (start.atRootStart) {
    range.setStart(root, 0);
  } else if (start.node) {
    range.setStartBefore(start.node);
  } else {
    range.setStart(root, 0);
  }

  if (end.atRootEnd) {
    range.setEnd(root, root.childNodes.length);
  } else if (end.node) {
    range.setEndBefore(end.node);
  } else {
    range.setEnd(root, root.childNodes.length);
  }

  return fragmentToHtml(doc, range.cloneContents());
};

const detectChapterSplitTag = (root: HTMLElement): ChapterSplitTag => {
  const h1Count = root.querySelectorAll("h1").length;
  if (h1Count > 1) {
    return "h1";
  }

  const h2Count = root.querySelectorAll("h2").length;
  if (h2Count > 0) {
    return "h2";
  }

  return null;
};

export const buildEpubChapters = (
  html: string,
  options?: BuildChaptersOptions,
): BuildChaptersResult => {
  const doc = new DOMParser().parseFromString(
    `<div id="epub-root">${html || ""}</div>`,
    "text/html",
  );
  const root = doc.getElementById("epub-root");
  const fallbackTitle = options?.fallbackTitle || "未命名文档";

  if (!root) {
    return {
      strategy: "single",
      chapters: [
        {
          id: "chapter-1",
          title: fallbackTitle,
          xhtml: "<p></p>",
        },
      ],
    };
  }

  const splitTag = detectChapterSplitTag(root);
  if (!splitTag) {
    return {
      strategy: "single",
      chapters: [
        {
          id: "chapter-1",
          title: fallbackTitle,
          xhtml: root.innerHTML.trim() || "<p></p>",
        },
      ],
    };
  }

  const chapterHeadings = Array.from(root.querySelectorAll(splitTag));
  if (chapterHeadings.length === 0) {
    return {
      strategy: "single",
      chapters: [
        {
          id: "chapter-1",
          title: fallbackTitle,
          xhtml: root.innerHTML.trim() || "<p></p>",
        },
      ],
    };
  }

  const chapters: EpubChapter[] = [];

  const firstHeading = chapterHeadings[0];
  const hasPreface = firstHeading !== root.firstElementChild;
  if (hasPreface) {
    const prefaceHtml = extractRangeHtml(
      doc,
      root,
      { atRootStart: true },
      { node: firstHeading },
    );
    if (isMeaningfulHtmlFragment(prefaceHtml)) {
      chapters.push({
        id: `chapter-${chapters.length + 1}`,
        title: getSafeChapterTitle("", chapters.length, fallbackTitle),
        xhtml: prefaceHtml,
      });
    }
  }

  chapterHeadings.forEach((heading, index) => {
    const nextHeading = chapterHeadings[index + 1];
    const chapterHtml = extractRangeHtml(
      doc,
      root,
      { node: heading },
      nextHeading ? { node: nextHeading } : { atRootEnd: true },
    );

    const chapterTitle = getSafeChapterTitle(
      normalizeText(heading.textContent || ""),
      chapters.length,
      fallbackTitle,
    );

    chapters.push({
      id: `chapter-${chapters.length + 1}`,
      title: chapterTitle,
      xhtml: chapterHtml,
    });
  });

  if (chapters.length === 0) {
    chapters.push({
      id: "chapter-1",
      title: fallbackTitle,
      xhtml: root.innerHTML.trim() || "<p></p>",
    });
  }

  return {
    strategy: splitTag,
    chapters,
  };
};
