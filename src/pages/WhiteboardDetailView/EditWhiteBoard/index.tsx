import WhiteBoardContent from "./WhiteBoardContent";

import styles from "./index.module.less";

interface WhiteBoardProps {
  whiteBoardId: number;
}

const WhiteBoard: React.FC<WhiteBoardProps> = ({ whiteBoardId }) => {
  if (!whiteBoardId) {
    return null;
  }

  return (
    <div className={styles.contentContainer}>
      <WhiteBoardContent key={whiteBoardId} whiteBoardId={whiteBoardId} />
    </div>
  );
};

export default WhiteBoard;
