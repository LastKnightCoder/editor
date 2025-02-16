import TitlebarIcon from "@/components/TitlebarIcon";
import { PlusOutlined } from "@ant-design/icons";
import useCardPanelStore from "@/stores/useCardPanelStore";
import FocusMode from "../../../../components/FocusMode";

import styles from './index.module.less';
import useCardsManagementStore from "@/stores/useCardsManagementStore";
import { useMemoizedFn } from "ahooks";

const Card = () => {
  const {
    addCard,
  } = useCardPanelStore(state => ({
    addCard: state.addCard,
  }));

  const {
    createCard,
    selectCategory,
  } = useCardsManagementStore((state) => ({
    createCard: state.createCard,
    selectCategory: state.selectCategory,
  }));
  
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
      count: 0
    });
    addCard(createdCard.id);
  });

  return (
    <div className={styles.iconList}>
      <TitlebarIcon onClick={onCreateCard} tip={'新建卡片'}>
        <PlusOutlined />
      </TitlebarIcon>
      <FocusMode />
    </div>
  )
}

export default Card;
