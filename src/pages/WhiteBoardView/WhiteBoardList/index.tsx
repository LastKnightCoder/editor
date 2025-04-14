import For from "@/components/For";
import { memo } from "react";
import useGridLayout from "@/hooks/useGridLayout";
import { WhiteBoard } from "@/types";
import WhiteBoardCard from "../WhiteBoardCard";

import styles from "./index.module.less";

interface WhiteBoardListProps {
  whiteBoards: WhiteBoard[];
  onClick: (id: number) => void;
}

const WhiteBoardList = memo((props: WhiteBoardListProps) => {
  const { whiteBoards, onClick } = props;
  const { gap, itemWidth, gridContainerRef } = useGridLayout();

  return (
    <div
      className={styles.gridContainer}
      ref={gridContainerRef}
      style={{ gap }}
    >
      <For
        data={whiteBoards}
        renderItem={(whiteBoard) => (
          <WhiteBoardCard
            key={whiteBoard.id}
            whiteBoard={whiteBoard}
            style={{
              width: itemWidth,
            }}
            onClick={onClick.bind(null, whiteBoard.id)}
          />
        )}
      />
    </div>
  );
});

export default WhiteBoardList;
