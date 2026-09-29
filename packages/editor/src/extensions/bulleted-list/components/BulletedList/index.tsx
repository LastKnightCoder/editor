import React, { PropsWithChildren } from "react";
import { RenderElementProps } from "slate-react";

import type { BulletedListElement } from "../../../types";

interface IBulletedListProps {
  attributes: RenderElementProps["attributes"];
  element: BulletedListElement;
}

/** 圆点画在直接子 li 的 ::before 上；有自定义图标时隐藏，折叠时加一圈 accent 光晕；打印时回退为原生圆点 */
const LIST_CLASS = [
  "m-0 ps-[2.5em] [&_li]:mb-[1.25em]",
  "[&>li]:relative [&>li]:list-none",
  "[&>li]:before:absolute [&>li]:before:-left-[1em] [&>li]:before:top-[0.7em] [&>li]:before:h-[0.35em] [&>li]:before:w-[0.35em]",
  "[&>li]:before:rounded-full [&>li]:before:bg-[var(--ed-accent)] [&>li]:before:transition-transform [&>li]:before:duration-300 [&>li]:before:ease-in-out [&>li]:before:content-['']",
  "[&>li[data-has-icon=true]]:before:hidden",
  "[&>li[data-fold=fold]]:before:shadow-[0_0_0_0.3em_var(--ed-accent-soft)]",
  "print:[&>li]:list-[unset] print:[&>li]:before:hidden",
].join(" ");

const BulletedList: React.FC<PropsWithChildren<IBulletedListProps>> = props => {
  const { attributes, children } = props;
  return (
    <ul className={LIST_CLASS} {...attributes}>
      {children}
    </ul>
  );
};

export default BulletedList;
