import { DownOutlined } from '@ant-design/icons';
import HighlightSelect from "../HighlightSelect";

import styles from './index.module.less';

interface IHighlightTextProps {
  open: boolean;
  onClick: (event: React.MouseEvent, label: string | undefined) => void;
}

const HighlightText = (props: IHighlightTextProps) => {
  const { open, onClick } = props;

  return (
    <div className={styles.textContainer}>
      <div className={styles.text}>
        <span>M</span>
        <DownOutlined />
      </div>
      <HighlightSelect
        open={open}
        onClick={(event, label) => {
          onClick(event, label);
        }}
      />
    </div>
  )
}

export default HighlightText;