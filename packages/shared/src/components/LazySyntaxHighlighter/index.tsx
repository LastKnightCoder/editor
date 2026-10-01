import React, { useEffect, useState } from "react";
import { measurePerformance } from "../../utils/performance";
import { BiCopy } from "react-icons/bi";
import "../animations.css";

const styles = {
  syntaxContainer: "relative",
  copyButton:
    "bg-hover text-ink-2 hover:bg-press absolute right-2 top-2 z-[2] flex size-7 cursor-pointer items-center justify-center rounded-tau-sm border-0 opacity-70 transition-colors hover:opacity-100",
  copyTooltip:
    "bg-accent text-ink-inverse absolute -top-[25px] right-0 whitespace-nowrap rounded-tau-sm px-2 py-0.5 text-tau-sm animate-[tau-shared-copy_0.3s]",
};

interface LazySyntaxHighlighterProps {
  language: string;
  children: string;
  className?: string;
  /** 是否为暗色主题 */
  isDark?: boolean;
}

const CODE_FONT_FAMILY = "var(--mono-font)";

const normalizeLanguage = (language: string) => {
  const normalized = language.trim().toLowerCase();
  const languageAliases: Record<string, string> = {
    "plain text": "text",
    plaintext: "text",
    txt: "text",
    js: "javascript",
    ts: "typescript",
    "html/xml": "markup",
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
    "objective c": "objectivec",
    "objective-c": "objectivec",
    objc: "objectivec",
    pwsh: "powershell",
    ps1: "powershell",
    "protocol buffer": "protobuf",
    proto: "protobuf",
  };

  return languageAliases[normalized] ?? normalized;
};

const LazySyntaxHighlighter: React.FC<LazySyntaxHighlighterProps> = ({
  language,
  children,
  isDark = false,
  ...rest
}) => {
  const [SyntaxHighlighter, setSyntaxHighlighter] = useState<any>(null);
  const [theme, setTheme] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCopied, setIsCopied] = useState(false);

  useEffect(() => {
    const perf = measurePerformance("syntax-highlighter-load");
    let isMounted = true;

    const loadSyntaxHighlighter = async () => {
      try {
        const [syntaxHighlighterModule, stylesModule] = await Promise.all([
          // @ts-ignore
          import("react-syntax-highlighter/dist/esm/prism"),
          // @ts-ignore
          import("react-syntax-highlighter/dist/esm/styles/prism"),
        ]);

        if (isMounted) {
          setSyntaxHighlighter(() => syntaxHighlighterModule.default);
          setTheme(isDark ? stylesModule.oneDark : stylesModule.oneLight);
          setIsLoading(false);
        }
      } catch (error) {
        console.error("Failed to load syntax highlighter:", error);
        setIsLoading(false);
      } finally {
        perf.end();
      }
    };

    loadSyntaxHighlighter();

    return () => {
      isMounted = false;
    };
  }, [isDark]);

  const handleCopyCode = () => {
    navigator.clipboard
      .writeText(children)
      .then(() => {
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2000);
      })
      .catch(err => {
        console.error("Failed to copy code:", err);
      });
  };

  if (isLoading) {
    return (
      <pre className="loading-syntax" style={{ fontFamily: CODE_FONT_FAMILY }}>
        Loading code...
      </pre>
    );
  }

  if (!SyntaxHighlighter) {
    return (
      <pre {...rest} style={{ fontFamily: CODE_FONT_FAMILY }}>
        {children}
      </pre>
    );
  }

  const normalizedLanguage = normalizeLanguage(language);
  const codeBaseStyle =
    theme == null
      ? {}
      : {
          ...(theme['code[class*="language-"]'] ?? {}),
          ...(theme[`code[class*="language-${normalizedLanguage}"]`] ?? {}),
        };

  return (
    <div className={styles.syntaxContainer}>
      <button className={styles.copyButton} onClick={handleCopyCode} title="Copy code">
        <BiCopy />
        {isCopied && <span className={styles.copyTooltip}>已复制!</span>}
      </button>
      <SyntaxHighlighter
        language={normalizedLanguage}
        style={theme}
        customStyle={{
          margin: 0,
          borderRadius: "4px",
          fontFamily: CODE_FONT_FAMILY,
        }}
        codeTagProps={{
          className: normalizedLanguage ? `language-${normalizedLanguage}` : undefined,
          style: {
            ...codeBaseStyle,
            fontFamily: CODE_FONT_FAMILY,
          },
        }}
        showLineNumbers={true}
        wrapLines={true}
        {...rest}
      >
        {children}
      </SyntaxHighlighter>
    </div>
  );
};

export default LazySyntaxHighlighter;
