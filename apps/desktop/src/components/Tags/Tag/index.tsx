import { ReactNode } from "react";
import classnames from "classnames";

import { CloseOutlined, TagOutlined } from "@ant-design/icons";
import { useThemeColors } from "@/hooks";

import styles from "./index.module.less";

interface ITagProps {
  tag: ReactNode;
  showSharp?: boolean;
  showIcon?: boolean;
  icon?: React.ReactNode;
  closable?: boolean;
  hoverAble?: boolean;
  onClose?: () => void;
  onClick?: (e: React.MouseEvent<HTMLDivElement>) => void;
  className?: string;
  style?: React.CSSProperties;
  isEditing?: boolean;
  editRef?: React.RefObject<HTMLDivElement | null>;
  onEditBlur?: () => void;
}

const Tag = (props: ITagProps) => {
  const {
    tag,
    showSharp,
    showIcon,
    icon,
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

  const { tagBgClass, hoverClass, tagTextClass } = useThemeColors();

  const tagClassName = classnames(
    styles.tagContainer,
    tagBgClass,
    tagTextClass,
    {
      [hoverClass]: hoverAble,
    },
    className,
  );

  return (
    <div className={tagClassName} style={style} onClick={onClick}>
      {showIcon && (icon || <TagOutlined />)}
      <div className={styles.tag}>
        {showSharp ? "#" : ""}
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
      </div>
      {closable && (
        <div className={styles.close} onClick={onClose}>
          <CloseOutlined />
        </div>
      )}
    </div>
  );
};

export default Tag;
