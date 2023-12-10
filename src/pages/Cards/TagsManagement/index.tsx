import { useEffect, useRef, useState } from "react";
import { useAsyncEffect, useMemoizedFn } from "ahooks";
import { Empty, Input, Skeleton, Spin } from "antd";

import TagItem from "./TagItem";

import { getCardsGroupByTag } from "@/commands";
import { ICard } from "@/types";

import useSearchTag from "./useSearchTag.ts";
import styles from './index.module.less';
import Tags from "@/components/Tags";

interface ITagsManagementProps {
  onClickCard: (id: number) => void;
  editingCardId?: number;
}

const TagsManagement = (props: ITagsManagementProps) => {
  const { onClickCard, editingCardId } = props;
  const [loading, setLoading] = useState(false);
  const [tagGroup, setTagGroup] = useState<Array<{
    tag: string;
    cards: ICard[];
  }>>([]);
  const observerRef = useRef<IntersectionObserver>();

  const [maxCount, setMaxCount] = useState<number>(20);
  const loadMore = useMemoizedFn(() => {
    setMaxCount(Math.min(maxCount + 20, filterGroups.length));
  });

  const {
    filterGroups,
    onDeleteTag,
    onSearch,
    onBlur,
    onFocus,
    onValueChange,
    searchTags,
    searchValue,
  } = useSearchTag(tagGroup);

  useAsyncEffect(async () => {
    setLoading(true);
    try {
      const group = await getCardsGroupByTag();
      const items: Array<{
        tag: string;
        cards: ICard[];
      }> = [];
      for (const [tag, cards] of Object.entries(group)) {
        items.push({
          tag,
          cards,
        })
      }
      setTagGroup(items);
      setMaxCount(Math.min(20, filterGroups.length));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setMaxCount(Math.min(20, filterGroups.length));
  }, [filterGroups.length])

  if (loading) {
    return (
      <Skeleton
        active
        title={false}
        paragraph={{
          rows: 10,
        }}
        style={{
          padding: 20,
        }}
      />
    )
  }

  if (tagGroup.length === 0) {
    return (
      <Empty description="暂无标签" />
    )
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <Input
          prefix={searchTags.length > 0 ? (
            <Tags
              closable
              showIcon
              tags={searchTags}
              onClose={onDeleteTag}
            />) : undefined}
          onPressEnter={onSearch}
          value={searchValue}
          onChange={(e) => { onValueChange(e.target.value) }}
          placeholder="输入标签进行筛选"
          onFocus={onFocus}
          onBlur={onBlur}
        />
      </div>
      <div className={styles.list}>
        {
          filterGroups.slice(0, maxCount).map(({ tag, cards }) => (
            <TagItem
              key={tag}
              tag={tag}
              cards={cards}
              onClickCard={onClickCard}
              editingCardId={editingCardId}
            />
          ))
        }
        {
          maxCount < filterGroups.length && (
            <div ref={(node) => {
              if (!node) return;
              if (observerRef.current) {
                observerRef.current.disconnect();
              }
              observerRef.current = new IntersectionObserver((entries) => {
                if (entries[0].isIntersecting) {
                  loadMore();
                }
              }, {
                rootMargin: '200px',
              });
              observerRef.current.observe(node);
            }}>
              <Spin>
                <div style={{ height: 100 }}></div>
              </Spin>
            </div>
          )
        }
      </div>
    </div>
  )
}

export default TagsManagement;