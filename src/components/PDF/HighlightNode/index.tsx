import { useState } from "react";
import { useMemoizedFn } from "ahooks";
import classnames from "classnames";

import For from "@/components/For";
import If from "@/components/If";
import HighlightTips from "../HighlightTips";

import { HIGHLIGHT_COLOR_CLASS_NAMES } from "../constants";
import { EHighlightType, PdfHighlight } from "@/types";

import styles from "./index.module.less";

interface HighlightProps {
  highlight: PdfHighlight;
  onRemoveHighlight?: () => void;
  onHighlightChange?: (highlight: PdfHighlight) => void;
}

const transformPercent = (value: string) => {
  return Number(value.split("%")[0]);
};

const HighlightNode = (props: HighlightProps) => {
  const { highlight, onRemoveHighlight, onHighlightChange } = props;

  const [tipsOpen, setTipsOpen] = useState(false);

  const { rects, color, boundingClientRect } = highlight;

  const onClickHighlight = useMemoizedFn(() => {
    setTipsOpen(!tipsOpen);
  });

  const onCloseTip = useMemoizedFn(() => {
    setTipsOpen(false);
  });

  const highlightTipLeft = `calc(${transformPercent(boundingClientRect.left)}% + 20px)`;
  const highlightTipTop = `calc(${transformPercent(boundingClientRect.top) + transformPercent(boundingClientRect.height)}% + 100px)`;

  return (
    <>
      <If condition={highlight.highlightType === EHighlightType.Text}>
        <For
          data={rects}
          renderItem={(rect, index) => (
            <div
              key={index}
              className={classnames(
                styles[HIGHLIGHT_COLOR_CLASS_NAMES[color]],
                styles.highlightRect,
                styles[highlight.highlightTextStyle],
              )}
              style={{
                position: "absolute",
                ...rect,
                cursor: "pointer",
                pointerEvents: "auto",
              }}
              onClick={onClickHighlight}
            />
          )}
        />
      </If>
      <If condition={highlight.highlightType === EHighlightType.Area}>
        <div
          className={classnames(
            styles[HIGHLIGHT_COLOR_CLASS_NAMES[color]],
            styles.highlightRect,
            styles.area,
          )}
          style={{
            position: "absolute",
            ...boundingClientRect,
            cursor: "pointer",
            pointerEvents: "auto",
          }}
          onClick={onClickHighlight}
        />
      </If>
      <HighlightTips
        style={{
          position: "absolute",
          left: highlightTipLeft,
          top: highlightTipTop,
          pointerEvents: "auto",
          transform: "translate(0%, -50%)",
          zIndex: 1,
        }}
        arrowDirection={"left"}
        open={tipsOpen}
        highlight={highlight}
        onHighlightChange={onHighlightChange}
        removeHighlight={onRemoveHighlight}
        onClose={onCloseTip}
      />
    </>
  );
};

export default HighlightNode;
