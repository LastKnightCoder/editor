import { RichTextElement } from "@/components/WhiteBoard/plugins";
import { MdOutlineColorLens } from "react-icons/md";
import { CgArrowsShrinkH, CgArrowsShrinkV } from "react-icons/cg";
import { produce } from "immer";

import styles from "./index.module.less";
import { Popover, Tooltip } from "antd";
import { useMemoizedFn } from "ahooks";
import { useState } from "react";

interface RichTextSetterProps {
  element: RichTextElement;
  onChange: (element: RichTextElement) => void;
}

interface ColorConfig {
  background: string;
  topColor: string;
  color: string;
  theme: "light" | "dark";
}

const colors: ColorConfig[] = [
  {
    background: "#fff",
    topColor: "transparent",
    color: "rgb(38, 38, 40)",
    theme: "light",
  },
  {
    background: "linear-gradient(314.36deg, #3E4347 7.01%, #848C9C 124.82%)",
    topColor: "transparent",
    color: "#fff",
    theme: "dark",
  },
  {
    background: "linear-gradient(311.65deg, #FFE0FC 6.89%, #FFF3F6 101.09%)",
    topColor: "transparent",
    color: "rgb(38, 38, 40)",
    theme: "light",
  },
  {
    background: "linear-gradient(310.93deg, #F3FFD0 6.86%, #FDFBE3 100%)",
    topColor: "transparent",
    color: "rgb(38, 38, 40)",
    theme: "light",
  },
  {
    background: "linear-gradient(312deg, #D9F9F3 6.91%, #EDFEF8 99.85%)",
    topColor: "transparent",
    color: "rgb(38, 38, 40)",
    theme: "light",
  },
  {
    background:
      "linear-gradient(310.93deg, #D6EBFF 6.86%, #E7FBF9 100%, #E4FFFF 100%)",
    topColor: "transparent",
    color: "rgb(38, 38, 40)",
    theme: "light",
  },
  {
    background: "linear-gradient(313.06deg, #EDDEFF 1.85%, #DDEAFF 101.12%)",
    topColor: "transparent",
    color: "rgb(38, 38, 40)",
    theme: "light",
  },
  {
    background: "linear-gradient(311.46deg, #CCCAE9 6.89%, #E2E9E8 100.79%)",
    topColor: "transparent",
    color: "rgb(38, 38, 40)",
    theme: "light",
  },
  {
    background: "#fff",
    topColor: "#F7CE66",
    color: "rgb(38, 38, 40)",
    theme: "light",
  },
  {
    background: "#fff",
    topColor: "#F24A6E",
    color: "rgb(38, 38, 40)",
    theme: "light",
  },
  {
    background: "#fff",
    topColor: "#20CEAE",
    color: "rgb(38, 38, 40)",
    theme: "light",
  },
  {
    background: "#fff",
    topColor: "#9770F6",
    color: "rgb(38, 38, 40)",
    theme: "light",
  },
  {
    background: "#fff",
    topColor: "#5B5D70",
    color: "rgb(38, 38, 40)",
    theme: "light",
  },
];

const RichTextSetter = (props: RichTextSetterProps) => {
  const { element, onChange } = props;

  const [selectColorOpen, setSelectColorOpen] = useState(false);

  const handleOnSelectColor = useMemoizedFn((color: ColorConfig) => {
    const newElement = produce(element, (draft) => {
      draft.background = color.background;
      draft.topColor = color.topColor;
      draft.color = color.color;
      draft.theme = color.theme;
    });
    onChange(newElement);
  });

  const handleFitHeight = useMemoizedFn(() => {
    const richTextContainer = document.getElementById(
      `rich-text-container-${element.id}`,
    );
    if (!richTextContainer) return;
    const editor = richTextContainer.querySelector(
      ":scope > [data-slate-editor]",
    ) as HTMLDivElement;
    if (!editor) return;

    editor.style.height = "auto";

    // 获取滚动高度
    const scrollHeight = editor.scrollHeight;
    const newElement = produce(element, (draft) => {
      draft.height = scrollHeight;
      draft.maxHeight = Math.max(scrollHeight, 3000);
      // 如果宽度大于300，则不进行调整
      draft.resized =
        Math.round(element.width) !== richTextContainer.scrollWidth;
    });
    onChange(newElement);
  });

  const handleFitWidth = useMemoizedFn(() => {
    const richTextContainer = document.getElementById(
      `rich-text-container-${element.id}`,
    );
    if (!richTextContainer) return;
    const editor = richTextContainer.querySelector(
      ":scope > [data-slate-editor]",
    ) as HTMLDivElement;
    if (!editor) return;

    editor.style.width = "fit-content";

    const newElement = produce(element, (draft) => {
      draft.width = editor.scrollWidth;
      draft.maxWidth = Math.max(editor.scrollWidth, 300);
      draft.resized =
        Math.round(element.height) !== richTextContainer.scrollHeight;
    });
    onChange(newElement);
  });

  return (
    <div
      onPointerDown={(e) => {
        e.stopPropagation();
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
      }}
      className={styles.container}
    >
      <Popover
        open={selectColorOpen}
        onOpenChange={setSelectColorOpen}
        styles={{
          body: {
            padding: 0,
            marginLeft: 24,
          },
        }}
        trigger={"click"}
        content={
          <div className={styles.colorSelectContainer}>
            {colors.map((color) => (
              <div
                key={`${color.background}-${color.topColor}-${color.color}`}
                className={styles.colorItem}
                style={{ background: color.background }}
                onClick={() => handleOnSelectColor(color)}
              >
                <div
                  className={styles.topColor}
                  style={{ background: color.topColor }}
                ></div>
              </div>
            ))}
          </div>
        }
        placement={"right"}
        arrow={false}
      >
        <Tooltip title={"背景颜色"} trigger={"hover"} placement={"left"}>
          <div className={styles.item}>
            <MdOutlineColorLens />
          </div>
        </Tooltip>
      </Popover>
      <Tooltip title={"适应高度"} placement={"left"}>
        <div className={styles.item} onClick={handleFitHeight}>
          <CgArrowsShrinkV />
        </div>
      </Tooltip>
      <Tooltip title={"适应宽度"} placement={"left"}>
        <div className={styles.item} onClick={handleFitWidth}>
          <CgArrowsShrinkH />
        </div>
      </Tooltip>
    </div>
  );
};

export default RichTextSetter;
