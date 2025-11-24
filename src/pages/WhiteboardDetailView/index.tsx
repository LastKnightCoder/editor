import EditWhiteBoard from "./EditWhiteBoard";
import EditWhiteBoardContent from "./EditWhiteBoardContent";
import useTabParams from "@/hooks/useTabParams";
import { TabType } from "@/types/tab";

import styles from "./index.module.less";

const WhiteboardDetailView = () => {
  const params = useTabParams(TabType.WhiteBoardDetail);

  // 根据 type 字段区分显示 WhiteBoard 还是 WhiteBoardContent
  if (params.type === "content") {
    return (
      <div className={styles.container}>
        <div className={styles.whiteboardContainer}>
          <EditWhiteBoardContent
            whiteBoardContentId={params.whiteBoardContentId}
            breadcrumb={params.breadcrumb || []}
          />
        </div>
      </div>
    );
  }

  if (params.type === "whiteboard") {
    return (
      <div className={styles.container}>
        <div className={styles.whiteboardContainer}>
          <EditWhiteBoard whiteBoardId={params.id} />
        </div>
      </div>
    );
  }

  return null;
};

export default WhiteboardDetailView;
