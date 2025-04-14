import React, { useEffect, useState } from "react";
import { List, Popover, Typography, Space, Button } from "antd";
import {
  LoadingOutlined,
  RightOutlined,
  ClockCircleOutlined,
  SyncOutlined,
} from "@ant-design/icons";
import { useMemoizedFn } from "ahooks";
import dayjs from "dayjs";
import { ICard } from "@/types";
import { getRecentTemporaryAndLiteratureCards } from "@/commands/card";
import CardPreview from "@/pages/CardListView/CardPreview";
import Editor from "@/components/Editor";
import { getEditorText } from "@/utils";
import {
  contentLinkExtension,
  fileAttachmentExtension,
  questionCardExtension,
} from "@/editor-extensions";
const customExtensions = [
  contentLinkExtension,
  fileAttachmentExtension,
  questionCardExtension,
];

import styles from "./index.module.less";

const ToClearCards: React.FC = () => {
  const [cards, setCards] = useState<ICard[]>([]);
  const [loading, setLoading] = useState(false);
  const [previewCardId, setPreviewCardId] = useState<number | undefined>(
    undefined,
  );
  const [previewVisible, setPreviewVisible] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const fetchRecentCards = useMemoizedFn(async () => {
    setLoading(true);
    try {
      const recentCards = await getRecentTemporaryAndLiteratureCards(10);
      setCards(recentCards);
    } catch (error) {
      console.error("获取待处理卡片失败:", error);
    } finally {
      setLoading(false);
    }
  });

  const handleRefresh = useMemoizedFn(async () => {
    if (refreshing || loading) return;

    setRefreshing(true);
    try {
      await fetchRecentCards();
    } finally {
      setTimeout(() => {
        setRefreshing(false);
      }, 500);
    }
  });

  const handleCardClick = useMemoizedFn((card: ICard) => {
    setPreviewCardId(card.id);
    setPreviewVisible(true);
  });

  const handleClosePreview = useMemoizedFn(() => {
    setPreviewVisible(false);
  });

  const toggleShowAll = useMemoizedFn(() => {
    setShowAll((prev) => !prev);
  });

  const formatUpdateTime = (timestamp: number) => {
    return dayjs(timestamp).format("YYYY-MM-DD");
  };

  const isOlderThanWeek = (timestamp: number) => {
    const now = dayjs();
    const updateTime = dayjs(timestamp);
    return now.diff(updateTime, "day") > 7;
  };

  useEffect(() => {
    fetchRecentCards();
  }, []);

  const displayCards = showAll ? cards : cards.slice(0, 5);
  const hasMoreCards = cards.length > 5;

  return (
    <div className={styles.toClearCards}>
      <div className={styles.header}>
        <Typography.Title level={5} style={{ margin: 0 }}>
          待处理卡片
        </Typography.Title>
        <Button
          type="text"
          icon={<SyncOutlined spin={refreshing} />}
          onClick={handleRefresh}
          disabled={loading || refreshing}
        />
      </div>

      <div className={styles.content}>
        {loading ? (
          <div className={styles.loadingContainer}>
            <LoadingOutlined />
          </div>
        ) : (
          <>
            <List
              dataSource={displayCards}
              renderItem={(card) => (
                <List.Item
                  className={styles.cardItem}
                  onClick={() => handleCardClick(card)}
                >
                  <div className={styles.cardItemContent}>
                    <Popover
                      trigger={"hover"}
                      content={
                        <Editor
                          key={card.id}
                          initValue={card.content}
                          readonly
                          extensions={customExtensions}
                          className={styles.editor}
                        />
                      }
                      placement="bottom"
                      mouseEnterDelay={0.8}
                    >
                      <Typography.Text
                        ellipsis
                        title={getEditorText(card.content)}
                      >
                        {getEditorText(card.content, 40) || "空卡片"}
                      </Typography.Text>
                    </Popover>
                    <div className={styles.dateInfo}>
                      <Space
                        size={4}
                        className={
                          isOlderThanWeek(card.update_time)
                            ? styles.oldDate
                            : ""
                        }
                      >
                        <ClockCircleOutlined />
                        <Typography.Text>
                          {formatUpdateTime(card.update_time)}
                        </Typography.Text>
                      </Space>
                    </div>
                  </div>
                </List.Item>
              )}
              locale={{ emptyText: "暂无待处理卡片" }}
            />

            {hasMoreCards && (
              <div className={styles.showMoreBtn} onClick={toggleShowAll}>
                {showAll ? "收起" : "查看更多"}{" "}
                <RightOutlined rotate={showAll ? 90 : 0} />
              </div>
            )}
          </>
        )}
      </div>

      {previewVisible && previewCardId && (
        <div className={styles.previewContainer}>
          <CardPreview
            key={previewCardId}
            cardId={previewCardId}
            visible={previewVisible}
            onClose={handleClosePreview}
            onGoToDetail={handleClosePreview}
          />
        </div>
      )}
    </div>
  );
};

export default ToClearCards;
