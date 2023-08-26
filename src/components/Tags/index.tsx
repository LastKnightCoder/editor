import classnames from "classnames";

import Tag from './Tag';
import styles from "./index.module.less";

interface TagsProps {
  tags: string[];
  closable?: boolean;
  onClose?: (tag: string) => void;
  className?: string;
  style?: React.CSSProperties;
  noWrap?: boolean;
  onClick?: (tag: string) => void;
  showIcon?: boolean;
  showSharp?: boolean;
  hoverAble?: boolean;
}

const Tags = (props: TagsProps) => {
  const {
    tags,
    showSharp,
    showIcon,
    closable,
    onClose,
    onClick,
    className,
    style,
    noWrap = false,
    hoverAble = false,
  } = props;

  if (!tags || tags.length === 0) {
    return null;
  }

  const tagsClassName = classnames(
    styles.tags,
    {
      [styles.noWrap]: noWrap,
    },
    className
  );

  return (
    <div className={tagsClassName} style={style}>
      {
        tags
          .filter(tag => !!tag)
          .map((tag) => (
              <Tag
                tag={tag}
                key={tag}
                closable={closable}
                onClose={() => onClose && onClose(tag)}
                onClick={() => onClick && onClick(tag)}
                showIcon={showIcon}
                showSharp={showSharp}
                hoverAble={hoverAble}
              />
          ))
      }
    </div>
  )
}

export default Tags;