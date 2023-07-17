import styles from "./index.module.less";
import {Tag} from "antd";
import {TAG_COLORS} from "@/constants";
import {useMemo} from "react";
import classnames from "classnames";

interface TagsProps {
  tags: string[];
  closable?: boolean;
  onClose?: (tag: string) => void;
  className?: string;
  noWrap?: boolean;
  onClick?: (tag: string) => void;
}

const Tags = (props: TagsProps) => {
  const { tags, closable, onClose, onClick, className, noWrap = false} = props;

  console.log('tags', tags, noWrap);

  const realTags = useMemo(() => {
    if (tags.length === 0) {
      return ['暂无标签']
    }
    return tags;
  }, [tags])

  return (
    <div className={classnames(styles.tags, className, {
      [styles.noWrap]: noWrap
    })}>
      {
        realTags
          .filter(tag => !!tag)
          .map(
            (tag, index) => (
              <Tag
                color={TAG_COLORS[index % TAG_COLORS.length]}
                key={tag}
                closable={closable}
                onClose={() => onClose && onClose(tag)}
                onClick={() => onClick && onClick(tag)}
              >
                {tag}
              </Tag>
            )
          )
      }
    </div>
  )
}

export default Tags;