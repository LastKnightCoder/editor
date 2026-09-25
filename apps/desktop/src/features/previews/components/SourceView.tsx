/**
 * 源码视图（D-057）：Prism 高亮 + 行号，代码底色。生成中自动跟随到末尾
 * （用户向上滚动后停止跟随，回到底部再恢复）。
 */

import { useEffect, useRef } from "react";
import { normalizeCodeLanguage, tauPrismTheme, usePrismHighlighter } from "@/components/ChatUI";

export function SourceView({
  code,
  language = "text",
  follow = false,
}: {
  code: string;
  language?: string;
  follow?: boolean;
}) {
  const Prism = usePrismHighlighter();
  const scrollRef = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);

  useEffect(() => {
    const el = scrollRef.current;
    if (follow && el && pinned.current) el.scrollTop = el.scrollHeight;
  }, [code, follow, Prism]);

  return (
    <div
      ref={scrollRef}
      onScroll={e => {
        const el = e.currentTarget;
        pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
      }}
      className="bg-page h-full overflow-auto py-3 text-[12.5px] leading-[1.75]"
    >
      {Prism ? (
        <Prism
          language={normalizeCodeLanguage(language)}
          style={tauPrismTheme}
          PreTag="div"
          showLineNumbers
          lineNumberStyle={{
            minWidth: "3em",
            paddingRight: "1.2em",
            color: "var(--tau-ink-3)",
            userSelect: "none",
          }}
          customStyle={{ margin: 0, padding: "0 16px 0 4px", background: "transparent" }}
          codeTagProps={{ style: { fontFamily: "var(--tau-font-mono)" } }}
        >
          {code}
        </Prism>
      ) : (
        <pre className="font-tau-mono text-ink-1 m-0 whitespace-pre px-4">{code}</pre>
      )}
    </div>
  );
}
