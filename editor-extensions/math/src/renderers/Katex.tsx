import { useRef, useEffect } from "react";
import katex from "katex";

import "katex/dist/katex.min.css";

interface IKatexProps {
  tex: string;
  inline?: boolean;
  /**
   * 传入时改为严格解析：出错回调错误信息（hasPrevious 表示是否还留着上一次成功的公式），成功回调 null；
   * 不传时沿用 KaTeX 的容错渲染（错误片段以红色源码原地显示）。
   */
  onError?: (error: string | null, hasPrevious?: boolean) => void;
}

const Katex = (props: IKatexProps) => {
  const { tex, inline = false, onError } = props;
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    if (!onError) {
      katex.render(tex, ref.current, {
        throwOnError: false,
        displayMode: !inline,
        errorColor: "#c00",
      });
      return;
    }
    try {
      ref.current.innerHTML = katex.renderToString(tex, {
        throwOnError: true,
        displayMode: !inline,
      });
      onError(null);
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error), ref.current.hasChildNodes());
    }
  }, [tex, inline, onError]);

  return <span ref={ref} />;
};

export default Katex;
