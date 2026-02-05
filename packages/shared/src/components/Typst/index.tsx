import { useEffect, useState } from "react";
import { useDebounceFn } from "ahooks";

interface ITypstProps {
  content: string;
  isDark?: boolean;
  className?: string;
  compileTypst?: (code: string) => Promise<string>;
  initialHtml?: string;
  compiledFrom?: string;
  onCompiled?: (html: string, compiledFrom: string) => void;
}

const Typst = (props: ITypstProps) => {
  const {
    content,
    isDark = false,
    className,
    compileTypst,
    initialHtml = "",
    compiledFrom,
    onCompiled,
  } = props;

  const hasLegacyCache = !compiledFrom && !!initialHtml;
  const cacheMatches = compiledFrom === content && !!initialHtml;
  const [html, setHtml] = useState<string>(
    cacheMatches || hasLegacyCache ? initialHtml : "",
  );
  const [error, setError] = useState<string>("");
  const [compileUnavailable, setCompileUnavailable] = useState(false);

  const { run } = useDebounceFn(
    async (c: string) => {
      if (!compileTypst) {
        setCompileUnavailable(true);
        if (initialHtml) {
          setHtml(initialHtml);
          setError("");
        } else {
          setError("当前环境不支持 Typst 编译");
          setHtml("");
        }
        return;
      }
      try {
        const res = await compileTypst(c);
        const nextHtml = res || "";
        setHtml(nextHtml);
        onCompiled?.(nextHtml, c);
        setError("");
      } catch (e: any) {
        const rawMsg = e?.message || "";
        const msg =
          rawMsg
            .replace(
              "Error invoking remote method 'compile-typst': Error: ",
              "",
            )
            .trim() || "编译 Typst 失败";
        const unsupported =
          /不支持\s*Typst/.test(rawMsg) ||
          /blog\s*模式\s*不支持/i.test(rawMsg) ||
          /not\s*support/i.test(rawMsg);
        if (unsupported) {
          setCompileUnavailable(true);
          if (initialHtml) {
            setHtml(initialHtml);
            setError("");
            return;
          }
        }
        setError(msg);
        setHtml("");
      }
    },
    { wait: 200 },
  );

  useEffect(() => {
    setCompileUnavailable(false);
  }, [compileTypst]);

  useEffect(() => {
    if (!content.trim()) {
      setHtml("");
      setError("");
      return;
    }

    if (compileUnavailable) {
      if (initialHtml) {
        setHtml(initialHtml);
        setError("");
      } else {
        setError("当前环境不支持 Typst 编译");
        setHtml("");
      }
      return;
    }

    if (cacheMatches) {
      setHtml(initialHtml || "");
      setError("");
      return;
    }

    if (hasLegacyCache && !compileTypst) {
      setHtml(initialHtml || "");
      setError("");
      return;
    }

    setHtml("");
    setError("");
    run(content);
  }, [
    cacheMatches,
    compileTypst,
    compileUnavailable,
    content,
    hasLegacyCache,
    initialHtml,
    run,
  ]);

  if (!content.trim()) {
    return (
      <div className={className}>
        <div className="text-gray-400 dark:text-gray-500 py-3 text-center">
          暂无 Typst 内容
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div
        className={`text-red-600 dark:text-red-400 whitespace-pre-wrap font-mono text-sm w-full pl-5 ${className || ""}`}
      >
        {error}
      </div>
    );
  }

  if (!html) {
    return (
      <div className={className}>
        <div className="text-gray-500 dark:text-gray-400 text-center">
          Loading...
        </div>
      </div>
    );
  }

  return (
    <div
      className={className}
      style={{
        filter: isDark ? "invert(1) hue-rotate(180deg)" : "none",
      }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
};

export default Typst;
