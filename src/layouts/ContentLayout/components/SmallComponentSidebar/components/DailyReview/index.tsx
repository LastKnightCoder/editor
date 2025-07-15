import React, { useEffect, useState } from "react";
import { Button, List, Popover, Typography } from "antd";
import dayjs from "dayjs";
import { LoadingOutlined, SyncOutlined } from "@ant-design/icons";
import { useMemoizedFn } from "ahooks";
import { ICard } from "@/types";
import { getRandomPermanentCards } from "@/commands/card";
import CardPreview from "@/pages/card-list-view/CardPreview";
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

const generateSeed = () => {
  return Date.now();
};

const DailyReview: React.FC = () => {
  const [cards, setCards] = useState<ICard[]>([]);
  const [loading, setLoading] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [previewCardId, setPreviewCardId] = useState<number | undefined>(
    undefined,
  );
  const [previewVisible, setPreviewVisible] = useState(false);
  const [seed, setSeed] = useState(() => {
    let seedInfo = {
      seed: generateSeed(),
      lastUpdated: dayjs().format("YYYY-MM-DD"),
    };
    // 看本地是否过期了
    try {
      let localSeedInfo: any = localStorage.getItem("daily-review-seed");
      if (localSeedInfo && localSeedInfo !== "undefined") {
        localSeedInfo = JSON.parse(localSeedInfo);
        const today = dayjs().format("YYYY-MM-DD");
        if (localSeedInfo.lastUpdated === today) {
          seedInfo = localSeedInfo;
        }
      } else {
        console.log("设置种子", seedInfo);
        localStorage.setItem("daily-review-seed", JSON.stringify(seedInfo));
      }
    } catch (e) {
      console.error("获取种子失败:", e);
    }
    return seedInfo;
  });

  const fetchRandomCards = useMemoizedFn(async (newSeed?: number) => {
    setLoading(true);
    try {
      const randomCards = await getRandomPermanentCards(newSeed || seed.seed);
      setCards(randomCards);
    } catch (error) {
      console.error("获取随机卡片失败:", error);
    } finally {
      setLoading(false);
    }
  });

  const handleRefresh = useMemoizedFn(() => {
    setRotating(true);
    const newSeed = generateSeed();
    const today = dayjs().format("YYYY-MM-DD");
    setSeed({
      seed: newSeed,
      lastUpdated: today,
    });
    localStorage.setItem(
      "daily-review-seed",
      JSON.stringify({
        seed: newSeed,
        lastUpdated: today,
      }),
    );
    fetchRandomCards(newSeed);
    // 1秒后停止旋转动画
    setTimeout(() => {
      setRotating(false);
    }, 1000);
  });

  const handleCardClick = useMemoizedFn((card: ICard) => {
    setPreviewCardId(card.id);
    setPreviewVisible(true);
  });

  const handleClosePreview = useMemoizedFn(() => {
    setPreviewVisible(false);
  });

  useEffect(() => {
    fetchRandomCards();
  }, []);

  return (
    <div className={styles.dailyReview}>
      <div className={styles.header}>
        <Typography.Title level={5} style={{ margin: 0 }}>
          每日回顾
        </Typography.Title>
        <Button
          type="text"
          icon={<SyncOutlined spin={rotating} />}
          onClick={handleRefresh}
          disabled={loading}
        />
      </div>

      <div className={styles.content}>
        {loading ? (
          <div className={styles.loadingContainer}>
            <LoadingOutlined />
          </div>
        ) : (
          <List
            dataSource={cards}
            renderItem={(card) => (
              <List.Item
                className={styles.cardItem}
                onClick={() => handleCardClick(card)}
              >
                <Popover
                  trigger={"hover"}
                  content={
                    <Editor
                      initValue={card.content}
                      readonly
                      extensions={customExtensions}
                      className={styles.editor}
                    />
                  }
                  placement="bottom"
                  mouseEnterDelay={0.8}
                >
                  <Typography.Text ellipsis title={getEditorText(card.content)}>
                    {getEditorText(card.content, 40) || "空卡片"}
                  </Typography.Text>
                </Popover>
              </List.Item>
            )}
            locale={{ emptyText: "暂无永久卡片" }}
          />
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

export default DailyReview;
