import { useEffect, useMemo, useRef, useState } from "react";

import "./tikz.css";

interface ITikZProps {
  content: string;
  isDark?: boolean;
  className?: string;
  /** 编译失败回调错误信息、成功回调 null；传入时由调用方展示错误 */
  onError?: (error: string | null, hasPrevious?: boolean) => void;
}

const COMPILE_ERROR = "TikZ 编译失败，请检查语法与宏包";

/** tikzjax 编译失败时不抛错，而是把加载占位换成这张不存在的图 */
const isFailurePlaceholder = (node: ParentNode) => !!node.querySelector('img[src*="invalid.site"]');

const TikZ = (props: ITikZProps) => {
  const { content, isDark = false, className, onError } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  const stagingRef = useRef<HTMLDivElement>(null);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const [failed, setFailed] = useState(false);
  // 还没有成功结果时隐藏区保持可见，让 tikzjax 的加载占位露出来
  const [hasResult, setHasResult] = useState(false);

  const cleanedCode = useMemo(() => {
    const tikzSource = content.split("&nbsp;").join("");

    let lines = tikzSource.split("\n");
    lines = lines.map(line => line.trim());
    lines = lines.filter(line => line);

    return lines.join("\n");
  }, [content]);

  useEffect(() => {
    const container = containerRef.current;
    const staging = stagingRef.current;
    if (!container || !staging || !cleanedCode) {
      return;
    }

    // 先在隐藏区编译，成功后才替换显示区：编译中与失败时都保留上一次成功的图
    const settle = (error: string | null) => {
      setFailed(!!error);
      onErrorRef.current?.(error, container.hasChildNodes());
    };
    const onFinished = () => {
      container.replaceChildren(...Array.from(staging.childNodes));
      setHasResult(true);
      settle(null);
    };
    const observer = new MutationObserver(() => {
      if (!isFailurePlaceholder(staging)) return;
      staging.replaceChildren();
      settle(COMPILE_ERROR);
    });
    staging.addEventListener("tikzjax-load-finished", onFinished);
    observer.observe(staging, { childList: true, subtree: true });

    // tikzjax 为超大体积（transform 后 20MB+）的浏览器脚本，静态 import 会拖入首屏
    // 模块图，Electron 渲染进程编译该模块时永久挂起导致整页白屏，故改为按需加载
    let cancelled = false;
    void import("./tikzjax.js").then(() => {
      if (cancelled) {
        return;
      }
      staging.replaceChildren();
      const script = document.createElement("script");
      script.type = "text/tikz";
      script.textContent = cleanedCode;
      staging.appendChild(script);
    });

    return () => {
      cancelled = true;
      observer.disconnect();
      staging.removeEventListener("tikzjax-load-finished", onFinished);
      staging.replaceChildren();
    };
  }, [cleanedCode]);

  if (!content.trim()) {
    return (
      <div className={className}>
        <div className="py-4 text-center text-gray-400 dark:text-gray-500">暂无 TikZ 内容</div>
      </div>
    );
  }

  return (
    <>
      <div
        ref={containerRef}
        className={className}
        style={{
          filter: isDark ? "invert(1) hue-rotate(180deg)" : "none",
        }}
      />
      <div ref={stagingRef} hidden={hasResult} aria-hidden={hasResult} />
      {failed && !onError && (
        <div className="py-2 text-center text-sm text-[var(--tau-danger)]">{COMPILE_ERROR}</div>
      )}
    </>
  );
};

export default TikZ;
