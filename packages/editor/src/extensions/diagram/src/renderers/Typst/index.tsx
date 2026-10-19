import { useEffect, useState } from "react";
import { useDebounceFn } from "ahooks";

export interface ITypstProps {
  content: string;
  isDark?: boolean;
  className?: string;
  compileTypst?: (code: string) => Promise<string>;
  initialHtml?: string;
  compiledFrom?: string;
  onCompiled?: (html: string, compiledFrom: string) => void;
  /** 传入时由调用方展示错误：编译失败回调错误信息并保留上一次成功的结果（hasPrevious），恢复时回调 null */
  onError?: (error: string | null, hasPrevious?: boolean) => void;
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
    onError,
  } = props;

  const hasLegacyCache = !compiledFrom && !!initialHtml;
  const cacheMatches = compiledFrom === content && !!initialHtml;
  const [html, setHtml] = useState<string>(cacheMatches || hasLegacyCache ? initialHtml : "");
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
          rawMsg.replace("Error invoking remote method 'compile-typst': Error: ", "").trim() ||
          "编译 Typst 失败";
        const unsupported =
          /不支持\s*Typst/.test(rawMsg) ||
          /blog\s*模式\s*不支持/i.test(rawMsg) ||
          /not\s*support/i.test(rawMsg) ||
          /移动端不支持该功能/i.test(rawMsg);
        if (unsupported) {
          setCompileUnavailable(true);
          if (initialHtml) {
            setHtml(initialHtml);
            setError("");
            return;
          }
        }
        setError(msg);
        if (!onError) setHtml("");
      }
    },
    { wait: 200 }
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

    if (!onError) setHtml("");
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
    onError,
  ]);

  useEffect(() => {
    onError?.(error || null, !!html);
  }, [error, html, onError]);

  if (!content.trim()) {
    return (
      <div className={className}>
        <div className="py-3 text-center text-gray-400 dark:text-gray-500">暂无 Typst 内容</div>
      </div>
    );
  }

  if (error && !onError) {
    return (
      <div
        className={`w-full whitespace-pre-wrap pl-5 font-mono text-sm text-red-600 dark:text-red-400 ${className || ""}`}
      >
        {error}
      </div>
    );
  }

  // 交给调用方展示错误、又没有可保留的旧结果时留空，不显示「Loading」
  if (!html && error) return <div className={className} />;

  if (!html) {
    return (
      <div className={className}>
        <div className="text-center text-gray-500 dark:text-gray-400">Loading...</div>
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
