import TitlebarIcon from "@/components/TitlebarIcon";
import { PlusOutlined, FileMarkdownOutlined } from "@ant-design/icons";
import useCardPanelStore, { EActiveSide } from "@/stores/useCardPanelStore";
import FocusMode from "../../../../components/FocusMode";

import styles from './index.module.less';
import useCardsManagementStore from "@/stores/useCardsManagementStore";
import { useMemoizedFn } from "ahooks";

const Card = () => {
  const {
    leftActiveId,
    rightActiveId,
    activeSide,
    addCard,
  } = useCardPanelStore(state => ({
    leftActiveId: state.leftActiveCardId,
    rightActiveId: state.rightActiveCardId,
    activeSide: state.activeSide,
    addCard: state.addCard,
  }));

  const {
    createCard,
    selectCategory,
  } = useCardsManagementStore((state) => ({
    createCard: state.createCard,
    selectCategory: state.selectCategory,
  }));

  const activeId = activeSide === EActiveSide.Left ? leftActiveId : rightActiveId;

  const onCreateCard = useMemoizedFn(async () => {
    const createdCard = await createCard({
      content: [{
        type: 'paragraph',
        children: [{
          type: 'formatted',
          text: ''
        }]
      }],
      tags: [],
      links: [],
      category: selectCategory,
    });
    addCard(createdCard.id);
  });

  return (
    <div className={styles.iconList}>
      <TitlebarIcon onClick={onCreateCard} tip={'新建卡片'}>
        <PlusOutlined />
      </TitlebarIcon>
      <FocusMode />
      <TitlebarIcon tip={'导出 Markdown'} onClick={() => {
        if (!activeId) return;
        const event = new CustomEvent('export-card-to-markdown', {
          detail: activeId,
        });
        document.dispatchEvent(event);
      }}>
        <FileMarkdownOutlined />
      </TitlebarIcon>
    </div>
  )
}

export default Card;