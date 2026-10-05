import { readBinaryFile } from "@/commands/file";
import manifest from "@/assets/fonts/hand/hand-font.json";

/**
 * 内置字体（白板手绘模式，D-106）导出内嵌。
 *
 * snapdom 的 embedFonts 用 fetch 读 @font-face 的 url；打包后的渲染端是 file://，
 * fetch 本地文件会被拦截，导出产物里就没有字体。这里改为：从 document.fonts 找出
 * 已加载的内置字体分片（unicode-range 按需加载，已加载的正是页面用到的字），
 * 读成 data URL 后经 snapdom 的 localFonts 传入，snapdom 对 data: 不再 fetch。
 * file:// 下样式表规则不可读，分片与地址的对应来自构建期清单 hand-font.json。
 */

export interface LocalFontSpec {
  family: string;
  src: string;
  weight?: string;
  style?: string;
}

interface ManifestEntry {
  family: string;
  file: string;
  start: number;
}

/** 打包后的分片地址：文件名 → url */
const SLICE_URLS = Object.fromEntries(
  Object.entries(
    import.meta.glob<string>("../assets/fonts/hand/*.woff2", {
      query: "?url",
      import: "default",
      eager: true,
    })
  ).map(([path, url]) => [path.split("/").pop() as string, url])
);

const BUNDLED_FAMILIES = new Set((manifest as ManifestEntry[]).map(entry => entry.family));

const unquote = (family: string) => family.replace(/^["']|["']$/g, "");

/** unicode-range 的第一个码位（如 "U+4E00-4E3F, U+5000" → 0x4E00） */
export const rangeStart = (range: string) => {
  const match = range.match(/U\+([0-9A-F]+)/i);
  return match ? parseInt(match[1], 16) : NaN;
};

/** 已加载的内置字体分片（family|起始码位） */
function loadedSliceKeys(): Set<string> {
  const keys = new Set<string>();
  document.fonts.forEach(face => {
    const family = unquote(face.family);
    if (face.status === "loaded" && BUNDLED_FAMILIES.has(family)) {
      keys.add(`${family}|${rangeStart(face.unicodeRange)}`);
    }
  });
  return keys;
}

async function readAsDataUrl(url: string): Promise<string> {
  const absolute = new URL(url, document.baseURI);
  const bytes =
    absolute.protocol === "file:"
      ? await readBinaryFile(decodeURIComponent(absolute.pathname).replace(/^\/([A-Za-z]:)/, "$1"))
      : new Uint8Array(await (await fetch(absolute.href)).arrayBuffer());
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return `data:font/woff2;base64,${btoa(binary)}`;
}

/** 导出前调用：返回已加载内置字体分片的 data URL，交给 snapdom 的 localFonts；没有用到内置字体时为空 */
export async function getBundledLocalFonts(): Promise<LocalFontSpec[]> {
  if (typeof document === "undefined" || typeof document.fonts?.forEach !== "function") return [];
  const loaded = loadedSliceKeys();
  if (loaded.size === 0) return [];
  const used = (manifest as ManifestEntry[]).filter(
    entry => loaded.has(`${entry.family}|${entry.start}`) && SLICE_URLS[entry.file]
  );
  const specs = await Promise.all(
    used.map(async (entry): Promise<LocalFontSpec | null> => {
      try {
        return {
          family: entry.family,
          src: await readAsDataUrl(SLICE_URLS[entry.file]),
          // 拉丁是可变字体，声明字重范围，snapdom 内嵌时保留可变轴
          weight: entry.file === "shantell-sans.woff2" ? "300 800" : "400",
          style: "normal",
        };
      } catch (error) {
        console.warn(
          "[bundled-font-embed] 读取字体分片失败，导出时该分片回落系统字体",
          entry.file,
          error
        );
        return null;
      }
    })
  );
  return specs.filter((spec): spec is LocalFontSpec => spec !== null);
}
