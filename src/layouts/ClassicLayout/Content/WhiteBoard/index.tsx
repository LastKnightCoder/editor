import useWhiteBoardStore from "@/stores/useWhiteBoardStore";
import WhiteBoardContent from "./WhiteBoardContent";

import styles from './index.module.less';

const WhiteBoard = () => {
  const { activeWhiteBoardId } = useWhiteBoardStore(state => ({
    activeWhiteBoardId: state.activeWhiteBoardId
  }));

  if (!activeWhiteBoardId) {
    return null;
  }

  return (
    <div className={styles.contentContainer}>
      <WhiteBoardContent key={activeWhiteBoardId} whiteBoardId={activeWhiteBoardId} />
    </div>
  )
}

export default WhiteBoard;
