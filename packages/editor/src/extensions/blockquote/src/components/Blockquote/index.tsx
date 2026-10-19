import React, { PropsWithChildren, createContext, useContext } from "react";
import { RenderElementProps, useReadOnly } from "slate-react";
import { cn } from "@tau/ui";
import "../../../styles.css";
import type { BlockquoteElement } from "../../types";
import { useIsLastElement } from "@tau/editor/api";
import { AddParagraph } from "@tau/editor/api";

// 嵌套的内层引用只保留竖线，大引号只画在最外层
const InsideBlockquoteContext = createContext(false);

interface IBlockQuoteProps {
  attributes: RenderElementProps["attributes"];
  element: BlockquoteElement;
}

const Blockquote: React.FC<PropsWithChildren<IBlockQuoteProps>> = props => {
  const { attributes, element, children } = props;

  const readOnly = useReadOnly();
  const isLast = useIsLastElement(element);
  const nested = useContext(InsideBlockquoteContext);

  return (
    <div className="relative">
      <div
        {...attributes}
        className={cn(
          "relative",
          nested ? "text-(--ed-quote-nested-text) pl-[1.1em]" : "text-(--ed-quote-text) pl-[2em]"
        )}
      >
        {!nested && (
          <span
            contentEditable={false}
            aria-hidden
            className="text-(--ed-quote-mark) pointer-events-none absolute -left-[0.02em] -top-[0.12em] select-none font-[family-name:var(--ed-quote-mark-font)] text-[2.9em] leading-none opacity-55"
          >
            {"“"}
          </span>
        )}
        <span
          contentEditable={false}
          aria-hidden
          className={cn(
            "bg-(--ed-quote-bar) pointer-events-none absolute w-[2px] select-none rounded-full",
            nested
              ? "bottom-[0.3em] left-0 top-[0.3em]"
              : "bottom-[0.35em] left-[0.5em] top-[1.6em]"
          )}
        />
        <InsideBlockquoteContext.Provider value={true}>{children}</InsideBlockquoteContext.Provider>
      </div>
      {!(readOnly && isLast) && <AddParagraph element={element} />}
    </div>
  );
};

export default Blockquote;
