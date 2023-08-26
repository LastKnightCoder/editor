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
    noWrap = false
  } = props;

  if (!tags || tags.length === 0) {
    return null;
  }

  return (
    <div className={classnames(styles.tags, className, {[styles.noWrap]: noWrap})} style={style}>
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
              />
          ))
      }
    </div>
  )
}

export default Tags;