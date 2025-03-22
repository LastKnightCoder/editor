import classnames from "classnames";
import CardGraph from "@/layouts/components/CardGraph";
import Card from "@/layouts/components/EditCards";
import useCardPanelStore from "@/stores/useCardPanelStore";
import useCardManagement from "@/hooks/useCardManagement";
import { useShallow } from "zustand/react/shallow";
import styles from "./index.module.less";

const CardLinkGraph = () => {
  const { onCtrlClickCard } = useCardManagement();

  const { leftCardIds, rightCardIds } = useCardPanelStore(
    useShallow((state) => ({
      leftCardIds: state.leftCardIds,
      rightCardIds: state.rightCardIds,
    })),
  );

  const showEdit = leftCardIds.length > 0 || rightCardIds.length > 0;

  return (
    <div className={styles.queryContainer}>
      <div
        className={classnames(styles.container, {
          [styles.showEdit]: showEdit,
        })}
      >
        <CardGraph className={styles.graph} onClickCard={onCtrlClickCard} />
        <div className={styles.edit}>
          <Card />
        </div>
      </div>
    </div>
  );
};

export default CardLinkGraph;
