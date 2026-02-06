/**
 * 章节拆分模块
 * 将大型 Markdown 文档按标题拆分为多个章节
 */

export interface Chapter {
  index: number; // 0-based
  title: string; // 标题文本
  headingLevel: number; // 1=#, 2=##, etc.
  content: string; // 该章节完整 markdown
}

const CHUNK_THRESHOLD = 50000; // 50K 字符触发拆分
const FALLBACK_CHUNK_SIZE = 30000; // 无标题时按 ~30K 字符拆分
const MIN_CHAPTER_LENGTH = 500; // 过短章节合并阈值
const MAX_CHAPTER_LENGTH = 100000; // 单章超过 100K 递归拆分

/**
 * 按章节拆分 Markdown 内容
 * - 阈值：> 50,000 字符时触发拆分
 * - 优先按 # 和 ## 标题拆分
 * - 无标题时回退到 ###；仍无标题则按 ~30K 字符在段落边界拆分
 * - 第一个标题前的内容作为 chapter-0（前言）
 * - 过短章节（< 500 字符）合并到前一章
 * - 单章超过 100K 字符时，递归按下一级标题拆分
 */
export function splitMarkdownByChapters(content: string): Chapter[] {
  if (content.length <= CHUNK_THRESHOLD) {
    return [];
  }

  // 尝试按 # 和 ## 拆分
  let chapters = splitByHeadingLevel(content, [1, 2]);

  // 如果只得到一个章节，回退到 ###
  if (chapters.length <= 1) {
    chapters = splitByHeadingLevel(content, [1, 2, 3]);
  }

  // 仍然只有一个章节，按段落边界拆分
  if (chapters.length <= 1) {
    chapters = splitByParagraphBoundary(content);
  }

  // 合并过短章节
  chapters = mergeShortChapters(chapters);

  // 递归拆分过长章节
  chapters = splitLongChapters(chapters);

  // 重新编号
  chapters = chapters.map((ch, idx) => ({ ...ch, index: idx }));

  return chapters;
}

/**
 * 按指定标题级别拆分
 */
function splitByHeadingLevel(content: string, levels: number[]): Chapter[] {
  const lines = content.split("\n");
  const chapters: Chapter[] = [];
  let currentLines: string[] = [];
  let currentTitle = "前言";
  let currentLevel = 0;

  // 构建匹配正则：匹配指定级别的标题
  const headingRegex = new RegExp(`^(#{1,${Math.max(...levels)}})\\s+(.+)$`);

  for (const line of lines) {
    const match = headingRegex.exec(line);
    if (match) {
      const level = match[1].length;
      if (levels.includes(level)) {
        // 保存前一个章节
        if (currentLines.length > 0) {
          chapters.push({
            index: chapters.length,
            title: currentTitle,
            headingLevel: currentLevel,
            content: currentLines.join("\n"),
          });
        }
        currentTitle = match[2].trim();
        currentLevel = level;
        currentLines = [line];
        continue;
      }
    }
    currentLines.push(line);
  }

  // 保存最后一个章节
  if (currentLines.length > 0) {
    chapters.push({
      index: chapters.length,
      title: currentTitle,
      headingLevel: currentLevel,
      content: currentLines.join("\n"),
    });
  }

  return chapters;
}

/**
 * 按段落边界拆分（无标题时的回退方案）
 */
function splitByParagraphBoundary(content: string): Chapter[] {
  const chapters: Chapter[] = [];
  const paragraphs = content.split(/\n\n+/);
  let currentContent = "";
  let chapterIndex = 0;

  for (const paragraph of paragraphs) {
    if (
      currentContent.length + paragraph.length > FALLBACK_CHUNK_SIZE &&
      currentContent.length > 0
    ) {
      chapters.push({
        index: chapterIndex,
        title: `第 ${chapterIndex + 1} 部分`,
        headingLevel: 0,
        content: currentContent.trim(),
      });
      chapterIndex++;
      currentContent = paragraph;
    } else {
      currentContent += (currentContent ? "\n\n" : "") + paragraph;
    }
  }

  if (currentContent.trim().length > 0) {
    chapters.push({
      index: chapterIndex,
      title: `第 ${chapterIndex + 1} 部分`,
      headingLevel: 0,
      content: currentContent.trim(),
    });
  }

  return chapters;
}

/**
 * 合并过短章节到前一章
 */
function mergeShortChapters(chapters: Chapter[]): Chapter[] {
  if (chapters.length <= 1) return chapters;

  const merged: Chapter[] = [];
  for (const chapter of chapters) {
    if (merged.length > 0 && chapter.content.length < MIN_CHAPTER_LENGTH) {
      // 合并到前一章
      const prev = merged[merged.length - 1];
      prev.content += "\n\n" + chapter.content;
    } else {
      merged.push({ ...chapter });
    }
  }

  return merged;
}

/**
 * 递归拆分过长章节
 */
function splitLongChapters(chapters: Chapter[]): Chapter[] {
  const result: Chapter[] = [];

  for (const chapter of chapters) {
    if (chapter.content.length > MAX_CHAPTER_LENGTH) {
      // 尝试按下一级标题拆分
      const nextLevel = chapter.headingLevel + 1;
      if (nextLevel <= 6) {
        const subChapters = splitByHeadingLevel(chapter.content, [nextLevel]);
        if (subChapters.length > 1) {
          // 给子章节加上父标题前缀
          for (const sub of subChapters) {
            result.push({
              ...sub,
              title:
                sub.title === "前言"
                  ? chapter.title
                  : `${chapter.title} - ${sub.title}`,
            });
          }
          continue;
        }
      }
      // 无法按标题拆分，按段落边界拆分
      const subChapters = splitByParagraphBoundary(chapter.content);
      for (const sub of subChapters) {
        result.push({
          ...sub,
          title: `${chapter.title} - ${sub.title}`,
        });
      }
    } else {
      result.push(chapter);
    }
  }

  return result;
}

export default splitMarkdownByChapters;
