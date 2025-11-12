import EditWhiteBoard from "./EditWhiteBoard";
import useTabParams from "@/hooks/useTabParams";
import { TabType } from "@/types/tab";

import styles from "./index.module.less";

const WhiteboardDetailView = () => {
  const { id } = useTabParams(TabType.WhiteBoardDetail);

  if (!id) {
    return null;
  }

  return (
    <div className={styles.container}>
      <div className={styles.whiteboardContainer}>
        <EditWhiteBoard whiteBoardId={Number(id)} />
      </div>
    </div>
  );
};

export default WhiteboardDetailView;
