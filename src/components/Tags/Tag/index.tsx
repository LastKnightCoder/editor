import { ReactNode } from "react";
import classnames from "classnames";

import useTheme from "@/hooks/useTheme.ts";
import { CloseOutlined, TagOutlined } from "@ant-design/icons";

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
  editRef?: React.RefObject<HTMLDivElement>;
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

  const { isDark } = useTheme();

  const tagClassName = classnames(
    styles.tagContainer,
    {
      [styles.dark]: isDark,
      [styles.hoverAble]: hoverAble,
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
