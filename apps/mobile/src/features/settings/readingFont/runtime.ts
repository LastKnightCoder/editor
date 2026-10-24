// 正文字体运行时：所选字体已安装时读出字节注册 FontFace，加载完成后才在根上切换
// --mobile-reading-font，加载前与失败时都显示系统字体。根上这两个变量只由本模块写入。

import { useEffect } from "react";
import { toast } from "../../../components/toast";
import { readReadingFontFile, type ReadingFontRelease } from "./api";
import {
  readingFontFamily,
  readingFontOption,
  type ReadingFontId,
  type ReadingFontOption,
} from "./fonts";
import { useInstalledReadingFonts } from "./queries";

type LoadedFont = { version: string; faces: Promise<FontFace[]> };

const loaded = new Map<string, LoadedFont>();

function dropFaces(entry: LoadedFont) {
  void entry.faces.then(faces => faces.forEach(face => document.fonts.delete(face)));
}

async function registerFaces(font: ReadingFontRelease): Promise<FontFace[]> {
  const family = readingFontFamily(font.id as ReadingFontId);
  return Promise.all(
    font.files.map(async file => {
      const face = new FontFace(family, await readReadingFontFile(font.id, file.style), {
        weight: file.weight,
      });
      await face.load();
      document.fonts.add(face);
      return face;
    })
  );
}

/** 同一字体同一版本只注册一次；换版本时先撤下旧字形，避免同名同字重的两份并存 */
export function loadReadingFontFaces(font: ReadingFontRelease): Promise<FontFace[]> {
  const current = loaded.get(font.id);
  if (current?.version === font.version) return current.faces;
  if (current) dropFaces(current);
  const faces = registerFaces(font);
  loaded.set(font.id, { version: font.version, faces });
  faces.catch(() => loaded.delete(font.id));
  return faces;
}

/** 移除字体文件后撤下已注册的字形 */
export function forgetReadingFontFaces(id: string) {
  const current = loaded.get(id);
  if (!current) return;
  dropFaces(current);
  loaded.delete(id);
}

export function applyReadingFontVars(option: ReadingFontOption | null) {
  const style = document.documentElement.style;
  if (!option || option.id === "system") {
    style.removeProperty("--mobile-reading-font");
    style.removeProperty("--mobile-reading-font-synthesis");
    return;
  }
  style.setProperty("--mobile-reading-font", `"${readingFontFamily(option.id)}", var(--tau-font)`);
  if (option.synthesizeBold) style.setProperty("--mobile-reading-font-synthesis", "weight");
  else style.removeProperty("--mobile-reading-font-synthesis");
}

/** 壳层挂载：所选字体或已安装列表变化时重新应用 */
export function useReadingFontRuntime(selected: ReadingFontId) {
  const installed = useInstalledReadingFonts().data;
  useEffect(() => {
    const font = selected === "system" ? undefined : installed?.find(item => item.id === selected);
    if (!font) {
      applyReadingFontVars(null);
      return;
    }
    let active = true;
    loadReadingFontFaces(font).then(
      () => {
        if (active) applyReadingFontVars(readingFontOption(selected));
      },
      error => {
        if (!active) return;
        console.warn("[readingFont] 加载字体失败", error);
        applyReadingFontVars(null);
        toast.warning({ id: "reading-font-load", text: "正文字体加载失败，已改用系统字体" });
      }
    );
    return () => {
      active = false;
    };
  }, [selected, installed]);
}
