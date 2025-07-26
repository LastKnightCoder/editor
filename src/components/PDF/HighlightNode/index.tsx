import { useState, useEffect, forwardRef, useImperativeHandle } from "react";
import { useMemoizedFn } from "ahooks";
import classnames from "classnames";

import For from "@/components/For";
import If from "@/components/If";
import HighlightTips from "../HighlightTips";

import { HIGHLIGHT_COLOR_CLASS_NAMES } from "../constants";
import { EHighlightType, PdfHighlight, Rect } from "@/types";
import { getHighlightRectsFromTextSelection } from "../utils";

import styles from "./index.module.less";

interface HighlightProps {
  highlight: PdfHighlight;
  onRemoveHighlight?: () => void;
  onHighlightChange?: (highlight: PdfHighlight) => void;
}

const transformPercent = (value: string) => {
  return Number(value.split("%")[0]);
};

export type HighlightNodeRef = {
  onClickHighlight: () => void;
  scrollIntoView: () => void;
};

const HighlightNode = forwardRef<HighlightNodeRef, HighlightProps>(
  (props, ref) => {
    const { highlight, onRemoveHighlight, onHighlightChange } = props;

    const [tipsOpen, setTipsOpen] = useState(false);
    const [textHighlightRects, setTextHighlightRects] = useState<Rect[]>([]);

    const { color, boundingClientRect } = highlight;

    const onClickHighlight = useMemoizedFn(() => {
      setTipsOpen(!tipsOpen);
    });

    const scrollIntoView = useMemoizedFn(() => {
      // 根据 highlightTipTop，设置页面的 scrollTop
      const highlightTip = document.querySelector(
        `[data-highlight-tip-id="${highlight.id}"]`,
      );
      if (highlightTip) {
        highlightTip.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    });

    const onCloseTip = useMemoizedFn(() => {
      setTipsOpen(false);
    });

    useImperativeHandle(ref, () => ({
      onClickHighlight,
      scrollIntoView,
    }));

    // 为基于文本索引的高亮计算精确的矩形区域
    useEffect(() => {
      if (
        highlight.highlightType === EHighlightType.Text &&
        highlight.textSelection
      ) {
        const pageElement = document.querySelector(
          `.pdfViewer .page[data-page-number="${highlight.pageNum}"]`,
        ) as HTMLElement;

        if (!pageElement) return;

        // 获取精确的高亮矩形
        const rects = getHighlightRectsFromTextSelection(
          pageElement,
          highlight.textSelection,
        );
        setTextHighlightRects(rects);
      } else {
        setTextHighlightRects([]);
      }
    }, [highlight]);

    const highlightTipLeft = `calc(${transformPercent(boundingClientRect.left)}% + 20px)`;
    const highlightTipTop = `calc(${transformPercent(boundingClientRect.top) + transformPercent(boundingClientRect.height)}% + 100px)`;

    return (
      <>
        {/* 基于文本索引的精确高亮渲染 */}
        <If
          condition={
            highlight.highlightType === EHighlightType.Text &&
            textHighlightRects.length > 0
          }
        >
          <For
            data={textHighlightRects}
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
                  left: `${rect.left}px`,
                  top: `${rect.top}px`,
                  width: `${rect.width}px`,
                  height: `${rect.height}px`,
                  cursor: "pointer",
                  pointerEvents: "auto",
                }}
                onClick={onClickHighlight}
              />
            )}
          />
        </If>

        {/* 区域高亮 */}
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
        <div
          data-highlight-tip-id={highlight.id}
          style={{
            opacity: 0,
            position: "absolute",
            top: `${transformPercent(boundingClientRect.top)}%`,
            left: `${transformPercent(boundingClientRect.left)}%`,
            width: `${transformPercent(boundingClientRect.width)}%`,
            height: `${transformPercent(boundingClientRect.height)}%`,
            pointerEvents: "none",
          }}
        ></div>

        <HighlightTips
          style={{
            position: "absolute",
            left: highlightTipLeft,
            top: highlightTipTop,
            pointerEvents: "auto",
            transform: "translate(0%, -50%)",
            zIndex: 100,
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
  },
);

export default HighlightNode;
