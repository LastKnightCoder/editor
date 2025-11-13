import For from "@/components/For";
import { memo } from "react";
import { WhiteBoard } from "@/types";
import WhiteBoardCard from "../WhiteBoardCard";

import styles from "./index.module.less";

interface WhiteBoardListProps {
  whiteBoards: WhiteBoard[];
  onClick: (whiteBoard: WhiteBoard) => void;
}

const WhiteBoardList = memo((props: WhiteBoardListProps) => {
  const { whiteBoards, onClick } = props;

  return (
    <div className={styles.gridContainer}>
      <For
        data={whiteBoards}
        renderItem={(whiteBoard) => (
          <WhiteBoardCard
            key={whiteBoard.id}
            whiteBoard={whiteBoard}
            onClick={onClick.bind(null, whiteBoard)}
          />
        )}
      />
    </div>
  );
});

export default WhiteBoardList;
