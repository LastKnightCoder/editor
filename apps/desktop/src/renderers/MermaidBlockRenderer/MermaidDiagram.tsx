/**
 * Mermaid 图（D-057）：模型生成的图按 strict 安全级渲染（无点击回调 / HTML 标签）。
 * 内容防抖 300ms；渲染失败时保留上一次成功的图（生成中的半截语法很常见），
 * 从未成功过才抛出，交给预览框的错误边界。
 */

import { forwardRef, useEffect, useId, useState } from "react";
import { useDebounce } from "ahooks";
import { renderMermaidSvg } from "@tau/shared";
import useTheme from "@/hooks/useTheme";

export const MermaidDiagram = forwardRef<HTMLDivElement, { code: string; generating: boolean }>(
  ({ code, generating }, ref) => {
    const { isDark } = useTheme();
    const debounced = useDebounce(code, { wait: 300 });
    const id = `mermaid-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
    const [svg, setSvg] = useState("");
    const [error, setError] = useState<Error | null>(null);

    useEffect(() => {
      let alive = true;
      if (!debounced.trim()) return;
      renderMermaidSvg({ code: debounced, mermaidId: id, isDark, securityLevel: "strict" })
        .then(out => alive && (setSvg(out), setError(null)))
        .catch(err => alive && setError(err instanceof Error ? err : new Error(String(err))));
      return () => {
        alive = false;
      };
    }, [debounced, id, isDark]);

    if (error && !svg && !generating) throw error;
    if (!svg)
      return (
        <div className="text-tau-sm text-ink-3 grid min-h-[160px] place-items-center">
          正在绘制图表…
        </div>
      );
    return (
      <div
        ref={ref}
        className="[&_svg]:mx-auto [&_svg]:h-auto [&_svg]:max-w-full"
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    );
  }
);
MermaidDiagram.displayName = "MermaidDiagram";
