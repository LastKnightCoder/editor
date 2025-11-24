import { useMemoizedFn } from "ahooks";
import dayjs from "dayjs";
import type { Descendant } from "slate";
import type { RowData } from "@/components/Database/types";
import type { Notebook, Metadata } from "@/types/weread";
import type { NotebookSnapshot } from "../types";
import { getPcUrl } from "@/services/weread/parser";
import { importFromMarkdown } from "@/utils/markdown";

const DEFAULT_DETAIL_CONTENT: Descendant[] = [
  {
    type: "paragraph",
    children: [
      {
        type: "formatted",
        text: "",
      },
    ],
  },
];

export const useWeReadData = () => {
  const createSnapshot = useMemoizedFn(
    (metaData: Metadata): NotebookSnapshot => ({
      noteCount: metaData.noteCount ?? 0,
      reviewCount: metaData.reviewCount ?? 0,
      lastReadDate: metaData.lastReadDate ?? "",
      synckeys: metaData.synckeys ?? {},
    }),
  );

  const buildNotebookRow = useMemoizedFn((notebook: Notebook): RowData => {
    const { metaData } = notebook;
    const readInfo = metaData.readInfo;
    const rawProgress = readInfo?.readingProgress ?? 0;
    const resolvedProgress =
      rawProgress <= 1 ? Math.round(rawProgress * 100) : rawProgress;

    const readingTimeMinutes = Math.round((readInfo?.readingTime ?? 0) / 60);

    let readingStatus = "not_started";
    if (readInfo) {
      if (readInfo.finishedDate && readInfo.finishedDate > 0) {
        readingStatus = "finished";
      } else if (readInfo.readingBookDate && readInfo.readingBookDate > 0) {
        readingStatus = "reading";
      }
    }

    const wereadLink =
      metaData.pcUrl ??
      (metaData.encodeId
        ? `https://weread.qq.com/web/reader/${metaData.encodeId}`
        : getPcUrl(metaData.bookId));

    const finishedDate =
      readInfo?.finishedDate && readInfo.finishedDate > 0
        ? dayjs(readInfo.finishedDate * 1000).format("YYYY-MM-DD HH:mm")
        : "";

    const archiveName = metaData.archiveName || "";

    return {
      id: metaData.bookId,
      title: metaData.title,
      author: metaData.author || "",
      cover: metaData.cover
        ? [
            {
              id: `cover-${metaData.bookId}`,
              url: metaData.cover,
              alt: metaData.title,
            },
          ]
        : [],
      link: wereadLink,
      reading_status: readingStatus,
      publisher: metaData.publisher || "",
      archive: archiveName,
      description: metaData.intro || "暂无简介",
      progress: {
        current: Math.min(100, Math.max(0, resolvedProgress)),
        target: 100,
      },
      reading_time: Math.max(0, readingTimeMinutes),
      finished_date: finishedDate,
    };
  });

  const buildNotebookMarkdown = useMemoizedFn((notebook: Notebook): string => {
    const { metaData, chapterHighlights, bookReview } = notebook;
    const readInfo = metaData.readInfo;
    const lines: string[] = [];
    lines.push(`# ${metaData.title}`);
    lines.push("");
    lines.push(`- 作者：${metaData.author}`);
    if (metaData.category) {
      lines.push(`- 分类：${metaData.category}`);
    }
    if (metaData.totalWords) {
      lines.push(`- 字数：${metaData.totalWords}`);
    }
    if (readInfo?.readingProgress !== undefined) {
      const percent =
        readInfo.readingProgress <= 1
          ? (readInfo.readingProgress * 100).toFixed(1)
          : readInfo.readingProgress.toFixed(1);
      lines.push(`- 阅读进度：${percent}%`);
    }
    if (readInfo?.readingTime) {
      const hours = Math.floor(readInfo.readingTime / 3600);
      const minutes = Math.round((readInfo.readingTime % 3600) / 60);
      lines.push(`- 阅读时长：${hours} 小时 ${minutes} 分钟`);
    }
    if (readInfo?.readingBookDate) {
      lines.push(
        `- 最近阅读：${dayjs(readInfo.readingBookDate * 1000).format("YYYY-MM-DD HH:mm")}`,
      );
    }
    lines.push("");
    if (metaData.intro) {
      lines.push(metaData.intro.trim());
      lines.push("");
    }

    if (chapterHighlights?.length) {
      lines.push("## 划线摘录");
      chapterHighlights.forEach((chapter) => {
        lines.push(`### ${chapter.chapterTitle}`);
        chapter.highlights?.forEach((highlight) => {
          if (highlight.markText) {
            lines.push(
              highlight.markText
                .split("\n")
                .map((line) => `> ${line}`)
                .join("\n"),
            );
          }
          if (highlight.reviewContent) {
            lines.push(`- 思考：${highlight.reviewContent}`);
          }
          lines.push("");
        });
        chapter.chapterReviews?.forEach((review) => {
          lines.push(`- 章节感想：${review.content}`);
        });
      });
    }

    if (bookReview.bookReviews?.length) {
      lines.push("## 全书笔记");
      bookReview.bookReviews.forEach((review, index) => {
        lines.push(`### 书评 ${index + 1}`);
        if (review.abstract) {
          lines.push(`> ${review.abstract}`);
        }
        if (review.content) {
          lines.push(review.content);
        }
      });
    }

    return lines.join("\n").trim();
  });

  const convertMarkdownToSlate = useMemoizedFn(
    (markdown: string): Descendant[] => {
      return markdown ? importFromMarkdown(markdown) : DEFAULT_DETAIL_CONTENT;
    },
  );

  return {
    createSnapshot,
    buildNotebookRow,
    buildNotebookMarkdown,
    convertMarkdownToSlate,
  };
};
