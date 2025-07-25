import {
  writeCacheFile,
  readCacheFile,
  deleteCacheFile,
} from "@/commands/cache";
import useSettingStore from "@/stores/useSettingStore";

interface ThumbnailCacheItem {
  pageNum: number;
  dataURL: string;
}

interface OutlineItem {
  title: string;
  dest: any;
  pageNum?: number;
  children?: OutlineItem[];
}

interface PDFCacheData {
  data: ThumbnailCacheItem[] | OutlineItem[];
  version: string; // 用于缓存版本控制
  timestamp: number; // 缓存时间戳
}

const CACHE_VERSION = "1.0.0";
const CACHE_EXPIRY = 2 * 30 * 24 * 60 * 60 * 1000; // 2个月

/**
 * 生成PDF缓存的文件路径
 */
export const generateCacheFilePath = (
  pdfId: number,
  type: "thumbnails" | "outline",
) => {
  const databaseName = useSettingStore.getState().setting.database.active;
  return `pdf/${databaseName}-pdf-${pdfId}-${type}.json`;
};

/**
 * 保存缩略图到文件缓存
 */
export const saveThumbnailsToCache = async (
  pdfId: number,
  thumbnails: { pageNum: number; canvas: HTMLCanvasElement | null }[],
) => {
  try {
    const cacheData: ThumbnailCacheItem[] = thumbnails.map((item) => ({
      pageNum: item.pageNum,
      dataURL: item.canvas ? item.canvas.toDataURL("image/jpeg", 0.8) : "", // 使用JPEG格式压缩存储
    }));

    const filePath = generateCacheFilePath(pdfId, "thumbnails");
    const cacheContent: PDFCacheData = {
      data: cacheData,
      version: CACHE_VERSION,
      timestamp: Date.now(),
    };

    await writeCacheFile(filePath, cacheContent);

    console.log(`已缓存PDF ${pdfId} 的缩略图，共 ${cacheData.length} 页`);
  } catch (error) {
    console.error("保存缩略图缓存失败:", error);
  }
};

/**
 * 从文件缓存读取缩略图
 */
export const loadThumbnailsFromCache = async (
  pdfId: number,
): Promise<{ pageNum: number; dataURL: string }[] | null> => {
  try {
    const filePath = generateCacheFilePath(pdfId, "thumbnails");
    const cached = await readCacheFile(filePath);

    if (!cached) return null;

    const { data, version, timestamp }: PDFCacheData = cached;

    // 检查版本兼容性
    if (version !== CACHE_VERSION) {
      await deleteCacheFile(filePath);
      return null;
    }

    // 检查缓存是否过期（2个月）
    if (Date.now() - timestamp > CACHE_EXPIRY) {
      await deleteCacheFile(filePath);
      return null;
    }

    console.log(
      `从缓存加载PDF ${pdfId} 的缩略图，共 ${(data as ThumbnailCacheItem[]).length} 页`,
    );
    return data as ThumbnailCacheItem[];
  } catch (error) {
    console.error("读取缩略图缓存失败:", error);
    return null;
  }
};

/**
 * 保存目录到文件缓存
 */
export const saveOutlineToCache = async (
  pdfId: number,
  outline: OutlineItem[],
) => {
  try {
    const filePath = generateCacheFilePath(pdfId, "outline");
    const cacheContent: PDFCacheData = {
      data: outline,
      version: CACHE_VERSION,
      timestamp: Date.now(),
    };

    await writeCacheFile(filePath, cacheContent);

    console.log(`已缓存PDF ${pdfId} 的目录`);
  } catch (error) {
    console.error("保存目录缓存失败:", error);
  }
};

/**
 * 从文件缓存读取目录
 */
export const loadOutlineFromCache = async (
  pdfId: number,
): Promise<OutlineItem[] | null> => {
  try {
    const filePath = generateCacheFilePath(pdfId, "outline");
    const cached = await readCacheFile(filePath);

    if (!cached) return null;

    const { data, version, timestamp }: PDFCacheData = cached;

    // 检查版本兼容性
    if (version !== CACHE_VERSION) {
      await deleteCacheFile(filePath);
      return null;
    }

    // 检查缓存是否过期（2个月）
    if (Date.now() - timestamp > CACHE_EXPIRY) {
      await deleteCacheFile(filePath);
      return null;
    }

    console.log(`从缓存加载PDF ${pdfId} 的目录`);
    return data as OutlineItem[];
  } catch (error) {
    console.error("读取目录缓存失败:", error);
    return null;
  }
};

/**
 * 清除指定PDF的所有缓存
 */
export const clearPDFCache = async (pdfId: number) => {
  try {
    await deleteCacheFile(generateCacheFilePath(pdfId, "thumbnails"));
    await deleteCacheFile(generateCacheFilePath(pdfId, "outline"));
    console.log(`已清除PDF ${pdfId} 的所有缓存`);
  } catch (error) {
    console.error("清除PDF缓存失败:", error);
  }
};
