import classnames from "classnames";
import { Typography, Popover } from 'antd';
import { MoreOutlined } from '@ant-design/icons';
import Tags from "@/components/Tags";
import SettingPanel, { ISettingItem } from "./SettingPanel";

import { getEditorTextValue } from '@/utils';
import { ICard } from "@/types";

import styles from './index.module.less';
import If from "@/components/If";

const { Paragraph } = Typography;

interface ICardItem2Props {
  card: ICard;
  onClick?: (e: any) => void;
  showTags?: boolean;
  active?: boolean;
  settings?: ISettingItem[];
}

const CardItem2 = (props: ICardItem2Props) => {
  const { card, onClick, showTags = false, active = false, settings = []} = props;
  const { content, tags } = card;

  return (
    <div className={classnames(styles.itemContainer, { [styles.active]: active })} onClick={onClick}>
      <If condition={showTags}>
        <Tags tags={tags} showIcon className={styles.tags} />
      </If>
      <Paragraph className={styles.textContainer} ellipsis={{ rows: 2 }}>
        {getEditorTextValue(content)}
      </Paragraph>
      <Popover
        placement="bottomRight"
        trigger="click"
        content={<SettingPanel settings={settings} cardId={card.id} />}
        arrow={false}
      >
        <div className={styles.moreIcon} onClick={e => e.stopPropagation()}>
          <MoreOutlined />
        </div>
      </Popover>
    </div>
  )
}

export default CardItem2;