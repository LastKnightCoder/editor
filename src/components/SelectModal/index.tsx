import { Empty, Input, Modal, Spin } from "antd";
import { Descendant } from "slate";
import { useRef, useState, memo } from "react";
import { useMemoizedFn, useWhyDidYouUpdate } from "ahooks";
import useSearch from './hooks/useSearch.ts';

import Card from './Card';
import If from "@/components/If";

import styles from './index.module.less';

export interface IItem {
  id: number;
  title: string;
  content: Descendant[];
}

interface ISelectArticleModalProps<T> {
  open: boolean;
  title?: string;
  multiple?: boolean;
  onCancel?: () => void;
  onOk?: (items: T[]) => Promise<void>;
  excludeIds?: number[];
  allItems: T[];
}

const SelectArticleModal = memo(<T extends IItem,>(props: ISelectArticleModalProps<T>) => {
  const {
    open,
    multiple = false,
    title,
    onCancel,
    onOk,
    excludeIds = [],
    allItems = [],
  } = props;

  const {
    searchValue,
    searchedItems,
    onSearchValueChange,
  } = useSearch({
    allItems,
    excludeIds,
  });

  useWhyDidYouUpdate('SelectArticleModal', {
    ...props,
    searchedItems,
    searchValue,
    onSearchValueChange,
  })

  const [selectedItems, setSelectedItems] = useState<T[]>([]);
  const [maxItemCount, setMaxItemCount] = useState<number>(20);
  const listRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver>();

  const loadMore = useMemoizedFn(() => {
    console.log('loadMore', searchedItems.length);
    setMaxItemCount(maxItemCount => Math.min(maxItemCount + 20, searchedItems.length));
  });

  const handleOk = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setMaxItemCount(20);
    if (!onOk || !selectedItems) return;
    await onOk(selectedItems);
  }

  const handleCancel = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setMaxItemCount(20);
    if (!onCancel) return;
    onCancel();
  }

  const onSelectItem = (item: T) => {
    const isInSelectedItems = selectedItems.some(selectedItem => selectedItem.id === item.id);
    if (isInSelectedItems) {
      setSelectedItems(selectedItems.filter(selectedItem => selectedItem.id !== item.id));
    } else {
      if (multiple) {
        setSelectedItems([...selectedItems, item]);
      } else {
        setSelectedItems([item]);
      }
    }
  }

  return (
    <Modal
      title={title}
      open={open}
      onOk={handleOk}
      onCancel={handleCancel}
      width={800}
      bodyStyle={{
        height: 500,
        boxSizing: 'border-box',
      }}
    >
      <div className={styles.modal}>
        <div className={styles.sidebar}>
          <div className={styles.header}>
            <Input
              value={searchValue}
              onChange={(e) => {
                onSearchValueChange(e.target.value);
              }}
              placeholder="输入标题进行搜索"
            />
          </div>
          <div ref={listRef} className={styles.list}>
            {
              searchedItems.slice(0, maxItemCount).length > 0
                ? searchedItems.slice(0, maxItemCount).map(item => (
                  <Card
                    card={item}
                    onClick={() => { onSelectItem(item) }}
                    selected={selectedItems.some(selectedItem => selectedItem.id === item.id)}
                  />
                ))
                : <Empty />
            }
            <If condition={maxItemCount < searchedItems.length}>
              <Spin>
                <div
                  ref={(node) => {
                    if (node) {
                      if (observerRef.current) {
                        observerRef.current.disconnect();
                      }
                      observerRef.current = new IntersectionObserver((entries) => {
                        if (entries[0].isIntersecting) {
                          loadMore();
                        }
                      });
                      observerRef.current.observe(node);
                    }
                  }}
                  style={{ height: 100 }}
                />
              </Spin>
            </If>
          </div>
        </div>
        <div className={styles.selectPanel}>
          <div style={{ fontWeight: 700 }}>已选卡片：</div>
          {
            selectedItems.map(item => (
              <Card
                card={item}
                onClick={() => { onSelectItem(item) }}
              />
            ))
          }
        </div>
      </div>
    </Modal>
  )
})

export default SelectArticleModal;