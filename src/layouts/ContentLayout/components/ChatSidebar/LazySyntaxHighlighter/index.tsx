import React, { useEffect, useState } from "react";
import useTheme from "@/hooks/useTheme";
import { measurePerformance } from "../hooks/usePerformanceMonitor";
import { BiCopy } from "react-icons/bi";
import styles from "./index.module.less";

interface LazySyntaxHighlighterProps {
  language: string;
  children: string;
  className?: string;
}

const LazySyntaxHighlighter: React.FC<LazySyntaxHighlighterProps> = ({
  language,
  children,
  ...rest
}) => {
  const { isDark } = useTheme();
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
          import("react-syntax-highlighter/dist/esm/prism"),
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
      .catch((err) => {
        console.error("Failed to copy code:", err);
      });
  };

  if (isLoading) {
    return <pre className="loading-syntax">Loading code...</pre>;
  }

  if (!SyntaxHighlighter) {
    return <pre {...rest}>{children}</pre>;
  }

  const normalizedLanguage = language === "js" ? "javascript" : language;

  return (
    <div className={styles.syntaxContainer}>
      <button
        className={styles.copyButton}
        onClick={handleCopyCode}
        title="Copy code"
      >
        <BiCopy />
        {isCopied && <span className={styles.copyTooltip}>已复制!</span>}
      </button>
      <SyntaxHighlighter
        language={normalizedLanguage}
        style={theme}
        customStyle={{ margin: 0, borderRadius: "4px" }}
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
