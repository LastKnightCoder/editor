import classnames from "classnames";
import CardGraph from "@/layouts/components/CardGraph";
import useRightSidebarStore from "@/stores/useRightSidebarStore";
import { useMemoizedFn } from "ahooks";
import { getCardById } from "@/commands";
import { getEditorText } from "@/utils";

import styles from "./index.module.less";

const CardLinkGraph = () => {
  const addTab = useRightSidebarStore((state) => state.addTab);

  const onClickCard = useMemoizedFn(async (id: number) => {
    const card = await getCardById(id);
    addTab({
      type: "card",
      id: String(id),
      title: getEditorText(card.content, 10),
    });
  });

  return (
    <div className={styles.queryContainer}>
      <div className={classnames(styles.container)}>
        <CardGraph className={styles.graph} onClickCard={onClickCard} />
      </div>
    </div>
  );
};

export default CardLinkGraph;
