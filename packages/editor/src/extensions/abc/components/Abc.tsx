import { useEffect, useRef, useState } from "react";
import abcjs from "abcjs";
import { useCreation } from "ahooks";
import { useEditorTheme } from "../../../theme/context";
import { v4 as uuid } from "uuid";
import { useReportPreviewError } from "../../../components/PreviewWithEditor/previewError";

interface IAbcProps {
  content: string;
}

const Abc = (props: IAbcProps) => {
  const { content } = props;
  // 乐谱由 abcjs 画进 SVG，颜色必须传实际取值，不能用 CSS 变量
  const { token, mode } = useEditorTheme();
  const ref = useRef<HTMLDivElement>(null);
  // abcjs 遇到错误仍会尽量画出乐谱，只把问题写进 warnings；乐谱是当前内容，不算过期
  const [warning, setWarning] = useState<string | null>(null);
  useReportPreviewError(warning, { stale: false });

  const abcId = useCreation(() => {
    return `abc-${uuid()}`;
  }, []);

  useEffect(() => {
    if (ref.current) {
      const tunes = abcjs.renderAbc(abcId, content, {
        responsive: "resize",
        foregroundColor: token("text") || "#000000",
      });
      const warnings = tunes.flatMap(tune => tune.warnings ?? []);
      setWarning(
        warnings.length ? warnings.map(text => text.replace(/<[^>]+>/g, "")).join("\n") : null
      );
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
