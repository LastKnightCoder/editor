import { useState, useEffect, forwardRef, useImperativeHandle } from "react";
import { useMemoizedFn } from "ahooks";
import classnames from "classnames";
import { CommentOutlined } from "@ant-design/icons";

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

    // 动态计算 Tips 面板的位置
    const getTipsPosition = useMemoizedFn(() => {
      const left = parseFloat(boundingClientRect.left);
      const top = parseFloat(boundingClientRect.top);
      const width = parseFloat(boundingClientRect.width);
      const height = parseFloat(boundingClientRect.height);

      // 计算高亮区域的中心点
      const centerX = left + width / 2;
      const centerY = top + height / 2;

      let tipsLeft = "";
      let tipsTop = "";
      let transform = "";
      let arrowDirection: "left" | "right" | "top" | "bottom" = "left";

      // 根据位置决定 Tips 面板的位置
      if (centerX > 65) {
        // 右侧区域，Tips 在左侧
        tipsLeft = `calc(${transformPercent(boundingClientRect.left)}% - 20px)`;
        tipsTop = `calc(${transformPercent(boundingClientRect.top) + transformPercent(boundingClientRect.height) / 2}%)`;
        transform = "translate(-100%, -50%)";
        arrowDirection = "right";
      } else if (centerX < 35) {
        // 左侧区域，Tips 在右侧
        tipsLeft = `calc(${transformPercent(boundingClientRect.left) + transformPercent(boundingClientRect.width)}% + 20px)`;
        tipsTop = `calc(${transformPercent(boundingClientRect.top) + transformPercent(boundingClientRect.height) / 2}%)`;
        transform = "translate(0%, -50%)";
        arrowDirection = "left";
      } else {
        // 中间区域，考虑垂直位置
        if (centerY > 75) {
          // 下方区域，Tips 在上方
          tipsLeft = `calc(${transformPercent(boundingClientRect.left) + transformPercent(boundingClientRect.width) / 2}%)`;
          tipsTop = `calc(${transformPercent(boundingClientRect.top)}% - 20px)`;
          transform = "translate(-50%, -100%)";
          arrowDirection = "bottom";
        } else if (centerY < 25) {
          // 上方区域，Tips 在下方
          tipsLeft = `calc(${transformPercent(boundingClientRect.left) + transformPercent(boundingClientRect.width) / 2}%)`;
          tipsTop = `calc(${transformPercent(boundingClientRect.top) + transformPercent(boundingClientRect.height)}% + 20px)`;
          transform = "translate(-50%, 0%)";
          arrowDirection = "top";
        } else {
          // 中间位置，默认使用右侧
          tipsLeft = `calc(${transformPercent(boundingClientRect.left) + transformPercent(boundingClientRect.width)}% + 20px)`;
          tipsTop = `calc(${transformPercent(boundingClientRect.top) + transformPercent(boundingClientRect.height) / 2}%)`;
          transform = "translate(0%, -50%)";
          arrowDirection = "left";
        }
      }

      return { tipsLeft, tipsTop, transform, arrowDirection };
    });

    const { tipsLeft, tipsTop, transform, arrowDirection } = getTipsPosition();

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

        {/* 评论高亮 */}
        <If condition={highlight.highlightType === EHighlightType.Comment}>
          <div
            className={classnames(
              styles[HIGHLIGHT_COLOR_CLASS_NAMES[color]],
              styles.commentIcon,
            )}
            style={{
              position: "absolute",
              left: boundingClientRect.left,
              top: boundingClientRect.top,
              cursor: "pointer",
              pointerEvents: "auto",
            }}
            onClick={onClickHighlight}
          >
            <CommentOutlined
              style={{
                fontSize: "16px",
                padding: "2px",
                borderRadius: "50%",
              }}
            />
          </div>
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
            left: tipsLeft,
            top: tipsTop,
            pointerEvents: "auto",
            transform: transform,
            zIndex: 100,
          }}
          open={tipsOpen}
          highlight={highlight}
          onHighlightChange={onHighlightChange}
          removeHighlight={onRemoveHighlight}
          onClose={onCloseTip}
          arrowDirection={arrowDirection}
        />
      </>
    );
  },
);

export default HighlightNode;
