import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Breadcrumb } from "antd";
import { useMemoizedFn } from "ahooks";
import { ICard } from "@/types";
import EditCard from "@/layouts/components/EditCard";
import Titlebar from "@/layouts/components/Titlebar";
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

  if (loading) {
    return <div className={styles.loading}>加载中...</div>;
  }

  if (!card) {
    return <div className={styles.notFound}>卡片不存在</div>;
  }

  // 面包屑导航
  const breadcrumbItems = [
    { title: "首页", path: "/" },
    { title: "卡片列表", path: "/cards/list" },
    { title: `卡片详情 #${card.id}`, path: `/cards/detail/${card.id}` },
  ];

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <Titlebar>
          <Breadcrumb
            className={styles.breadcrumb}
            items={breadcrumbItems.map((item) => ({
              title: (
                <span
                  className={styles.breadcrumbItem}
                  onClick={() => navigate(item.path)}
                >
                  {item.title}
                </span>
              ),
            }))}
          />
        </Titlebar>
      </div>
      <div className={styles.content}>
        <EditCard cardId={card.id} />
      </div>
    </div>
  );
};

export default CardDetailView;
