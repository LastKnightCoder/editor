import { useEffect, useState } from "react";
import { continueRender, delayRender, random } from "remotion";

export type GlyphText = { text: string; font: string; size: number; width: number; height: number; baseline: number };

const cache = new Map<string, { x: number; y: number }[]>();

/**
 * 把一段文字栅格化后取样成点（坐标以文字框左上为原点），供「光点织成字」使用。
 * 在浏览器里用 canvas 取样，首帧前用 delayRender 等字体就绪；结果按参数缓存。
 */
export function useTextPoints(glyph: GlyphText, count: number, step = 6): { x: number; y: number }[] | null {
  const key = JSON.stringify([glyph, count, step]);
  const [points, setPoints] = useState(() => cache.get(key) ?? null);
  const [handle] = useState(() => (cache.has(key) ? null : delayRender(`采样文字点：${glyph.text}`)));
  useEffect(() => {
    if (cache.has(key)) {
      setPoints(cache.get(key)!);
      if (handle !== null) continueRender(handle);
      return;
    }
    document.fonts
      .load(`${glyph.size}px ${glyph.font}`, glyph.text)
      .catch(() => undefined)
      .then(() => {
        const canvas = document.createElement("canvas");
        canvas.width = glyph.width;
        canvas.height = glyph.height;
        const ctx = canvas.getContext("2d")!;
        ctx.font = `${glyph.size}px ${glyph.font}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "alphabetic";
        ctx.fillStyle = "#000";
        ctx.fillText(glyph.text, glyph.width / 2, glyph.baseline);
        const data = ctx.getImageData(0, 0, glyph.width, glyph.height).data;
        const all: { x: number; y: number }[] = [];
        for (let y = 0; y < glyph.height; y += step) {
          for (let x = 0; x < glyph.width; x += step) {
            if (data[(y * glyph.width + x) * 4 + 3] > 140) all.push({ x, y });
          }
        }
        // 均匀抽样到 count 个点（确定性）
        const picked = all
          .map((p, i) => ({ p, r: random(`tp-${glyph.text}-${i}`) }))
          .sort((a, b) => a.r - b.r)
          .slice(0, count)
          .map(item => item.p);
        cache.set(key, picked);
        setPoints(picked);
        if (handle !== null) continueRender(handle);
      });
  }, [key, glyph, count, step, handle]);
  return points;
}
