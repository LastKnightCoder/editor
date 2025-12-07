import { useEffect, useRef } from "react";
import abcjs from "abcjs";
import { useCreation } from "ahooks";
import useTheme from "../../../hooks/useTheme";
import { v4 as uuid } from "uuid";

interface IAbcProps {
  content: string;
}

const Abc = (props: IAbcProps) => {
  const { content } = props;
  const { isDark } = useTheme();
  const ref = useRef<HTMLDivElement>(null);

  const abcId = useCreation(() => {
    return `abc-${uuid()}`;
  }, []);

  useEffect(() => {
    if (ref.current) {
      abcjs.renderAbc(abcId, content, {
        responsive: "resize",
        foregroundColor: isDark ? "#e5e7eb" : "#000000",
      });
    }
  }, [content, abcId, isDark]);

  return (
    <div
      id={abcId}
      ref={ref}
      style={{ width: "100%", padding: "10px 0", overflow: "hidden" }}
    ></div>
  );
};

export default Abc;
