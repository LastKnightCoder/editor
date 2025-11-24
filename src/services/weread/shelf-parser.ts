import type { ShelfData, ShelfArchive, ShelfBook } from "@/types/weread";

interface ShelfInitialState {
  shelf: {
    archive: Array<{
      archiveId: number;
      name: string;
      bookIds: string[];
      first4Books?: ShelfBook[];
    }>;
  };
}

/**
 * 书架 HTML 解析服务
 * 从微信读书书架页面的 SSR HTML 中提取书籍和分类信息
 */
export class ShelfParserService {
  /**
   * 解析书架 HTML
   * @param html 书架页面的 HTML 内容
   * @returns 书架数据，包含分类、书籍和映射关系
   */
  parseShelfHTML(html: string): ShelfData {
    try {
      // 创建 DOM 对象解析 HTML
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, "text/html");

      // 找到有 nonce 属性的 script 标签
      const scripts = doc.querySelectorAll("script[nonce]");
      let initialStateScript: HTMLScriptElement | null = null;

      for (const script of scripts) {
        const textContent = script.textContent || "";
        if (textContent.includes("window.__INITIAL_STATE__")) {
          initialStateScript = script as HTMLScriptElement;
          break;
        }
      }

      if (!initialStateScript || !initialStateScript.textContent) {
        throw new Error("未找到书架数据");
      }

      // 提取 JSON 数据
      const scriptContent = initialStateScript.textContent;

      // 找到第一个 { 的位置
      const startIndex = scriptContent.indexOf("{");
      if (startIndex === -1) {
        throw new Error("未找到 JSON 数据起始位置");
      }

      // 从第一个 { 开始，找到匹配的最后一个 }
      let braceCount = 0;
      let endIndex = -1;

      for (let i = startIndex; i < scriptContent.length; i++) {
        if (scriptContent[i] === "{") {
          braceCount++;
        } else if (scriptContent[i] === "}") {
          braceCount--;
          if (braceCount === 0) {
            endIndex = i;
            break;
          }
        }
      }

      if (endIndex === -1) {
        throw new Error("未找到 JSON 数据结束位置");
      }

      const cleanJsonStr = scriptContent.substring(startIndex, endIndex + 1);

      const initialState: ShelfInitialState = JSON.parse(cleanJsonStr);
      const archives = initialState.shelf?.archive || [];

      // 提取所有分类信息
      const shelfArchives: ShelfArchive[] = archives.map((archive) => ({
        archiveId: archive.archiveId,
        name: archive.name,
        bookIds: archive.bookIds || [],
      }));

      // 提取所有书籍信息（从 first4Books 中）
      const booksMap = new Map<string, ShelfBook>();
      const bookArchiveMap = new Map<string, string>();

      archives.forEach((archive) => {
        const first4Books = archive.first4Books || [];

        // 将该分类下的所有书籍添加到映射中
        (archive.bookIds || []).forEach((bookId) => {
          bookArchiveMap.set(bookId, archive.name);
        });

        // 添加详细书籍信息（目前只有 first4Books 有详细信息）
        first4Books.forEach((book) => {
          if (!booksMap.has(book.bookId)) {
            booksMap.set(book.bookId, {
              bookId: book.bookId,
              title: book.title,
              author: book.author,
              cover: book.cover,
              version: book.version,
              format: book.format,
              type: book.type,
              category: book.category,
              totalWords: book.totalWords,
            });
          }
        });
      });

      return {
        archives: shelfArchives,
        books: booksMap,
        bookArchiveMap,
      };
    } catch (error) {
      console.error("解析书架 HTML 失败:", error);
      throw new Error(
        `解析书架数据失败: ${error instanceof Error ? error.message : "未知错误"}`,
      );
    }
  }

  /**
   * 获取书籍所属的分类名称
   * @param bookId 书籍ID
   * @param shelfData 书架数据
   * @returns 分类名称，如果未找到则返回 undefined
   */
  getBookArchive(bookId: string, shelfData: ShelfData): string | undefined {
    return shelfData.bookArchiveMap.get(bookId);
  }

  /**
   * 获取分类下的所有书籍ID
   * @param archiveName 分类名称
   * @param shelfData 书架数据
   * @returns 书籍ID数组
   */
  getArchiveBooks(archiveName: string, shelfData: ShelfData): string[] {
    const archive = shelfData.archives.find((a) => a.name === archiveName);
    return archive?.bookIds || [];
  }

  /**
   * 统计各分类的书籍数量
   * @param shelfData 书架数据
   * @returns 分类名称到书籍数量的映射
   */
  getArchiveStats(shelfData: ShelfData): Map<string, number> {
    const stats = new Map<string, number>();

    shelfData.archives.forEach((archive) => {
      stats.set(archive.name, archive.bookIds.length);
    });

    return stats;
  }
}

const shelfParserService = new ShelfParserService();
export default shelfParserService;
