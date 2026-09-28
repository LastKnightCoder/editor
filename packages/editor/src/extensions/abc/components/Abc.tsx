import { useEffect, useRef } from "react";
import abcjs from "abcjs";
import { useCreation } from "ahooks";
import { useEditorTheme } from "../../../theme/context";
import { v4 as uuid } from "uuid";

interface IAbcProps {
  content: string;
}

const Abc = (props: IAbcProps) => {
  const { content } = props;
  // 乐谱由 abcjs 画进 SVG，颜色必须传实际取值，不能用 CSS 变量
  const { token, mode } = useEditorTheme();
  const ref = useRef<HTMLDivElement>(null);

  const abcId = useCreation(() => {
    return `abc-${uuid()}`;
  }, []);

  useEffect(() => {
    if (ref.current) {
      abcjs.renderAbc(abcId, content, {
        responsive: "resize",
        foregroundColor: token("text") || "#000000",
      });
    }
  }, [content, abcId, token, mode]);

  return (
    <div
      id={abcId}
      ref={ref}
      style={{ width: "100%", padding: "10px 0", overflow: "hidden" }}
    ></div>
  );
};

export default Abc;
