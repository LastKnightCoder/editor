import { useRef, useEffect } from "react";
import katex from "katex";

import "katex/dist/katex.min.css";

interface IKatexProps {
  tex: string;
  inline?: boolean;
}

const Katex = (props: IKatexProps) => {
  const { tex, inline = false } = props;
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    katex.render(tex, ref.current, {
      throwOnError: false,
      displayMode: !inline,
      errorColor: "#c00",
    });
  }, [tex, inline]);

  return <span ref={ref} />;
};

export default Katex;
