/**
 * 对话里的代码块（D-048）：surface 亮底 + line-1 描边（D-009 / D-032 代码块口径），
 * 头行 = 语言 + 复制；高亮器按需懒加载，加载前以纯文本等高占位（不闪「Loading」字样）。
 */

import { useEffect, useState, type ComponentType } from "react";
import { Check, Copy } from "lucide-react";
import { IconButton, cn } from "@tau/ui";
import { tauPrismTheme } from "./prismTheme";

const ALIASES: Record<string, string> = {
  "plain text": "text",
  plaintext: "text",
  txt: "text",
  js: "javascript",
  ts: "typescript",
  html: "markup",
  xml: "markup",
  sh: "bash",
  shell: "bash",
  zsh: "bash",
  yml: "yaml",
  md: "markdown",
  dockerfile: "docker",
  "c++": "cpp",
  "c#": "csharp",
  objc: "objectivec",
  pwsh: "powershell",
  ps1: "powershell",
  proto: "protobuf",
};

export const normalizeCodeLanguage = (language: string) => {
  const key = language.trim().toLowerCase();
  return ALIASES[key] ?? key;
};

type Highlighter = ComponentType<Record<string, unknown>>;
let highlighterPromise: Promise<Highlighter> | null = null;
let highlighter: Highlighter | null = null;

function loadHighlighter() {
  // 与 @tau/shared 同一入口（esm/prism 无类型声明）：只带 prism 语法，按需加载
  // @ts-expect-error 缺少子路径类型声明
  highlighterPromise ??= import("react-syntax-highlighter/dist/esm/prism").then(mod => {
    highlighter = mod.default as unknown as Highlighter;
    return highlighter;
  });
  return highlighterPromise;
}

/** 懒加载的 Prism 高亮器（首次调用触发加载；块预览源码视图共用） */
export function usePrismHighlighter(): Highlighter | null {
  const [Prism, setPrism] = useState<Highlighter | null>(() => highlighter);
  useEffect(() => {
    if (Prism) return;
    let alive = true;
    void loadHighlighter().then(h => alive && setPrism(() => h));
    return () => {
      alive = false;
    };
  }, [Prism]);
  return Prism;
}

export function CodeBlock({
  code,
  language = "text",
  className,
}: {
  code: string;
  language?: string;
  className?: string;
}) {
  const Prism = usePrismHighlighter();
  const [copied, setCopied] = useState(false);
  const lang = normalizeCodeLanguage(language || "text");

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const copy = () => {
    void navigator.clipboard.writeText(code).then(() => setCopied(true));
  };

  return (
    <div
      className={cn(
        "border-line-1 bg-page rounded-tau-md group/code my-3 min-w-0 overflow-hidden border first:mt-0 last:mb-0",
        className
      )}
    >
      <div className="flex h-8 items-center justify-between pl-3.5 pr-1">
        <span className="text-tau-tiny text-ink-3 font-tau-mono">
          {lang === "text" ? "文本" : lang}
        </span>
        <IconButton
          className="size-[26px]"
          title={copied ? "已复制" : "复制代码"}
          aria-label="复制代码"
          onClick={copy}
        >
          {copied ? (
            <Check size={14} strokeWidth={1.75} className="text-ok" />
          ) : (
            <Copy size={14} strokeWidth={1.75} />
          )}
        </IconButton>
      </div>
      <div className="overflow-x-auto px-3.5 pb-3">
        {Prism ? (
          <Prism
            language={lang}
            style={tauPrismTheme}
            PreTag="div"
            customStyle={{ margin: 0, padding: 0, background: "transparent" }}
            codeTagProps={{ style: { fontFamily: "var(--tau-font-mono)" } }}
          >
            {code}
          </Prism>
        ) : (
          <pre className="font-tau-mono text-ink-1 m-0 whitespace-pre text-[12.5px] leading-[1.7]">
            {code}
          </pre>
        )}
      </div>
    </div>
  );
}
