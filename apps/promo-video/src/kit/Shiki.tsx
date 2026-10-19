import { useEffect, useState } from "react";
import { continueRender, delayRender } from "remotion";
import { codeToHtml } from "shiki";

/** Shiki 高亮（异步）：首帧前用 delayRender 等待结果，保证每帧确定性 */
export function useShikiHtml(code: string, lang: string, theme: string) {
  const [html, setHtml] = useState<string | null>(null);
  const [handle] = useState(() => delayRender(`shiki:${lang}`));
  useEffect(() => {
    codeToHtml(code, { lang, theme })
      .then(setHtml)
      .finally(() => continueRender(handle));
  }, [code, lang, theme, handle]);
  return html;
}
