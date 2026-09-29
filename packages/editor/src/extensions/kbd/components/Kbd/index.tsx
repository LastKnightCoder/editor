import React from "react";
import { RenderElementProps } from "slate-react";

import type { KbdElement } from "../../../../types";
import InlineChromiumBugfix from "../../../../components/InlineChromiumBugFix";

interface KbdProps {
  attributes: RenderElementProps["attributes"];
  element: KbdElement;
  children: React.ReactNode;
}

const Kbd = (props: KbdProps) => {
  const { attributes, children } = props;

  return (
    <kbd
      {...attributes}
      className="rounded-[0.25em] border border-b-2 border-solid border-[var(--ed-border)] bg-[var(--ed-tag-bg)] px-[0.25em] py-[0.125em] font-[family-name:var(--ed-font-mono)] text-[0.75em] leading-[1em]"
    >
      <InlineChromiumBugfix />
      {children}
      <InlineChromiumBugfix />
    </kbd>
  );
};

export default Kbd;
