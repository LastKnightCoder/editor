import React from "react";

interface IActionItemProps {
  icon: React.ReactNode;
  text: string;
}

const ActionItem = (props: IActionItemProps) => {
  const { icon, text } = props;
  return (
    <div className="flex h-[1.875em] items-center justify-center gap-[0.25em] leading-[1.875em]">
      {icon}
      <span>{text}</span>
    </div>
  );
};

export default ActionItem;
