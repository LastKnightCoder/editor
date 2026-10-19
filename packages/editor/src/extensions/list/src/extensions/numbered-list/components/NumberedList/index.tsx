import React, { PropsWithChildren } from "react";
import { RenderElementProps } from "slate-react";

import type { NumberedListElement } from "../../../../types";

interface INumberedListProps {
  attributes: RenderElementProps["attributes"];
  element: NumberedListElement;
}

/** 序号用 CSS 计数器画在直接子 li 的 ::before 上（accent 色） */
const LIST_CLASS = [
  "m-0 ps-[2.5em] [counter-reset:item] [&_li]:mb-[1.25em]",
  "[&>li]:relative [&>li]:list-none [&>li]:[counter-increment:item]",
  "[&>li]:before:absolute [&>li]:before:-left-[1.5em] [&>li]:before:top-[0.1em] [&>li]:before:h-[1.5em] [&>li]:before:w-[2em]",
  "[&>li]:before:leading-[1.5em] [&>li]:before:text-[var(--ed-accent)] [&>li]:before:content-[counter(item)'.']",
].join(" ");

const NumberedList: React.FC<PropsWithChildren<INumberedListProps>> = props => {
  const { attributes, children } = props;
  return (
    <ol className={LIST_CLASS} {...attributes}>
      {children}
    </ol>
  );
};

export default NumberedList;
