import { ReactNode } from "react";

import { Tag as TauTag, cn } from "@tau/ui";

interface ITagProps {
  tag: ReactNode;
  /** 兼容保留：D-021 裁决标签不迁图标，传值不生效 */
  showIcon?: boolean;
  closable?: boolean;
  hoverAble?: boolean;
  onClose?: () => void;
  onClick?: (e: React.MouseEvent) => void;
  className?: string;
  style?: React.CSSProperties;
  isEditing?: boolean;
  editRef?: React.RefObject<HTMLDivElement | null>;
  onEditBlur?: () => void;
}

const Tag = (props: ITagProps) => {
  const {
    tag,
    closable,
    hoverAble,
    onClose,
    onClick,
    className,
    style,
    isEditing,
    editRef,
    onEditBlur,
  } = props;

  return (
    <TauTag
      onClick={onClick}
      onRemove={closable ? onClose : undefined}
      style={style}
      className={cn(
        hoverAble && "hover:bg-surface-hover hover:text-ink-1 cursor-pointer",
        className
      )}
    >
      {isEditing ? (
        <div
          ref={editRef}
          contentEditable={true}
          suppressContentEditableWarning
          onBlur={onEditBlur}
          style={{
            outline: "none",
            minWidth: "1em",
            display: "inline-block",
          }}
        />
      ) : (
        tag
      )}
    </TauTag>
  );
};

export default Tag;
