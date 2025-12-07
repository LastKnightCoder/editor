import { useEffect, useState } from "react";
import { useMemoizedFn } from "ahooks";
import { ICard } from "@/types";
import EditCard from "./EditCard";
import { getCardById } from "@/commands/card";
import useTabParams from "@/hooks/useTabParams";
import { TabType } from "@/types/tab";
import styles from "./index.module.less";

const CardDetailView = () => {
  const { id } = useTabParams(TabType.CardDetail);
  const [loading, setLoading] = useState(false);
  const [card, setCard] = useState<ICard | null>(null);

  const fetchCardDetails = useMemoizedFn(async (cardId: number) => {
    setLoading(true);
    try {
      const cardData = await getCardById(cardId);
      setCard(cardData);
    } catch (error) {
      console.error("Failed to fetch card details:", error);
    } finally {
      setLoading(false);
    }
  });

  useEffect(() => {
    if (id) {
      fetchCardDetails(id);
    }
  }, [id, fetchCardDetails]);

  if (loading) {
    return <div className={styles.loading}>加载中...</div>;
  }

  if (!card) {
    return <div className={styles.notFound}>卡片不存在</div>;
  }

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <div className={styles.cardContainer}>
          <EditCard cardId={card.id} />
        </div>
      </div>
    </div>
  );
};

export default CardDetailView;
