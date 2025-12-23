import { TabType } from "@/types/tab";
import {
  getEpubById,
  getEpubAnnotations,
  getEpubBookmarks,
} from "@/commands/epub";
import { BaseTabContentProvider } from "./base-provider";
import type { ITab } from "@/types/tab";
import type { TabContentResponse, TabContentOptions } from "../types";

export class EpubDetailProvider extends BaseTabContentProvider<TabType.EpubDetail> {
  readonly tabType = TabType.EpubDetail;

  validateParams(params?: { id: number }): boolean {
    return !!(params?.id && typeof params.id === "number");
  }

  async getContent(
    tab: ITab<TabType.EpubDetail>,
    _options?: TabContentOptions,
  ): Promise<TabContentResponse> {
    const metadata = this.buildMetadata(tab);

    if (!tab.params?.id) {
      throw new Error("EPUB ID is required");
    }

    // 获取 EPUB 详情、标注和书签
    const [epub, annotations, bookmarks] = await Promise.all([
      getEpubById(tab.params.id),
      getEpubAnnotations(tab.params.id),
      getEpubBookmarks(tab.params.id),
    ]);

    const content = {
      epub: {
        id: epub.id,
        fileName: epub.fileName,
        filePath: epub.filePath,
        category: epub.category,
        tags: epub.tags,
        progressCfi: epub.progressCfi,
        progressPercentage: epub.progressPercentage,
        createTime: epub.createTime,
      },
      annotations: annotations.map((a) => ({
        id: a.id,
        cfi: a.cfi,
        type: a.type,
        text: a.text,
        color: a.color,
        notesCount: a.notes.length,
        chapterTitle: a.chapterTitle,
        createTime: a.createTime,
      })),
      bookmarks: bookmarks.map((b) => ({
        id: b.id,
        cfi: b.cfi,
        title: b.title,
        chapterTitle: b.chapterTitle,
        createTime: b.createTime,
      })),
      statistics: {
        annotationCount: annotations.length,
        bookmarkCount: bookmarks.length,
        progressPercentage: epub.progressPercentage,
      },
    };

    return {
      metadata,
      content,
      contentType: "object",
      truncated: false,
      originalLength: 0,
      totalLength: 0,
    };
  }
}
