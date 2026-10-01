import React from "react";

import { If } from "@tau/shared";
import { For } from "@tau/shared";

interface IActionItem {
  isTitle?: boolean;
  content: React.ReactNode;
  onClick?: () => void;
}

interface IActionsProps {
  items: IActionItem[];
}

const Actions = (props: IActionsProps) => {
  const { items } = props;
  return (
    <div className="flex max-h-[22.5em] flex-col gap-[0.5em] overflow-auto p-[0.5em]">
      <For
        data={items}
        renderItem={(item, index) => (
          <React.Fragment key={index}>
            <If condition={!!item.isTitle}>
              <div className="border-b border-solid border-[var(--ed-border)] py-[0.25em] text-[0.875em] text-[var(--ed-text-secondary)]">
                {item.content}
              </div>
            </If>
            <If condition={!item.isTitle}>
              <div
                className="box-border flex h-[3.75em] items-center rounded-[0.5em] px-[0.5em] py-[0.25em] hover:cursor-pointer hover:bg-[var(--ed-bg-hover)]"
                key={index}
                onClick={item.onClick}
              >
                {item.content}
              </div>
            </If>
          </React.Fragment>
        )}
      />
    </div>
  );
};

export default Actions;
