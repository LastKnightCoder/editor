import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "antd";
import { LeftOutlined } from "@ant-design/icons";
import { useMemoizedFn } from "ahooks";
import { ICard } from "@/types";
import EditCard from "@/layouts/components/EditCard";
import { getCardById } from "@/commands/card";
import styles from "./CardDetailView.module.less";

const CardDetailView = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [card, setCard] = useState<ICard | null>(null);

  useEffect(() => {
    if (id) {
      fetchCardDetails(parseInt(id, 10));
    }
  }, [id]);

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

  const handleBack = useMemoizedFn(() => {
    navigate("/cards/list");
  });

  if (loading) {
    return <div className={styles.loading}>加载中...</div>;
  }

  if (!card) {
    return <div className={styles.notFound}>卡片不存在</div>;
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <Button
          type="text"
          icon={<LeftOutlined />}
          onClick={handleBack}
          className={styles.backButton}
        >
          返回列表
        </Button>
      </div>
      <div className={styles.content}>
        <EditCard cardId={card.id} />
      </div>
    </div>
  );
};

export default CardDetailView;
