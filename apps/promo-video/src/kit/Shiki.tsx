import { useLayoutEffect, useState } from "react";
import { continueRender, delayRender } from "remotion";
import { codeToHtml } from "shiki";

/**
 * Shiki 高亮（异步）：每换一份代码都用 delayRender 等结果，保证每帧确定性。
 * 结果按代码记，代码变了（逐字敲代码）旧结果不再返回，免得截到上一帧的高亮。
 */
export function useShikiHtml(code: string, lang: string, theme: string) {
  const key = `${theme}\u0000${lang}\u0000${code}`;
  const [result, setResult] = useState<{ key: string; html: string } | null>(null);
  useLayoutEffect(() => {
    const handle = delayRender(`shiki:${lang}`);
    let alive = true;
    codeToHtml(code, { lang, theme })
      .then(html => alive && setResult({ key, html }))
      .finally(() => continueRender(handle));
    return () => {
      alive = false;
    };
  }, [key, code, lang, theme]);
  return result?.key === key ? result.html : null;
}
