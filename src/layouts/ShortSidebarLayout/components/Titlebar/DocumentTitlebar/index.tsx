import { useNavigate } from "react-router-dom";
import TitlebarIcon from "@/components/TitlebarIcon";
import { HomeOutlined } from "@ant-design/icons";
import { FiSidebar } from "react-icons/fi";
import useDocumentsStore from "@/stores/useDocumentsStore.ts";

import styles from "./index.module.less";

const WhiteBoardTitlebar = () => {
  const navigate = useNavigate();

  const { activeDocumentItemId, hideDocumentItemsList } = useDocumentsStore(
    (state) => ({
      activeDocumentItemId: state.activeDocumentItemId,
      hideDocumentItemsList: state.hideDocumentItemsList,
    }),
  );

  return (
    <div className={styles.iconList}>
      {activeDocumentItemId && hideDocumentItemsList && (
        <>
          <TitlebarIcon
            tip={"主页"}
            onClick={() => {
              useDocumentsStore.setState({
                activeDocumentItemId: null,
                hideDocumentItemsList: false,
              });
              navigate(`/documents/list`);
            }}
          >
            <HomeOutlined />
          </TitlebarIcon>
          {activeDocumentItemId && hideDocumentItemsList && (
            <TitlebarIcon
              onClick={() => {
                useDocumentsStore.setState({
                  hideDocumentItemsList: !hideDocumentItemsList,
                });
              }}
            >
              <FiSidebar />
            </TitlebarIcon>
          )}
        </>
      )}
    </div>
  );
};

export default WhiteBoardTitlebar;
