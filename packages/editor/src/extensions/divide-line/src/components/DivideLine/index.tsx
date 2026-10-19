import React from "react";

import { type DivideLineElement } from "../../types.ts";
import { AddParagraph } from "@tau/editor/api";
import { type ElementRenderProps } from "@tau/editor/api";

const DivideLineElement: React.FC<ElementRenderProps<DivideLineElement>> = props => {
  const { attributes, children, element } = props;

  return (
    <div
      {...attributes}
      contentEditable={false}
      className="mx-auto my-[1.5em] h-[0.125em] w-[90%] bg-[var(--ed-bg-hover)]"
    >
      {children}
      <AddParagraph element={element} />
    </div>
  );
};

export default DivideLineElement;
