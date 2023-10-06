import { DownOutlined } from '@ant-design/icons';
import ColorSelect from "../ColorSelect";

import styles from './index.module.less';

interface IColorTextProps {
  open: boolean;
  onClick: (event: React.MouseEvent, color: string) => void;
}

const ColorText = (props: IColorTextProps) => {
  const { open, onClick } = props;

  return (
    <div className={styles.textContainer}>
      <div className={styles.text}>
        <span>A</span>
        <DownOutlined />
      </div>
      <ColorSelect
        open={open}
        onClick={(event, color) => {
          onClick(event, color);
        }}
      />
    </div>
  )
}

export default ColorText;