import React from 'react';
import For from '@/components/For';

import styles from './index.module.less';

const colors = [
  'hsl(0, 100%, 50%)',
  'hsl(30, 100%, 50%)',
  'hsl(60, 100%, 50%)',
  'hsl(90, 100%, 50%)',
  'hsl(120, 100%, 50%)',
  'hsl(150, 100%, 50%)',
  'hsl(180, 100%, 50%)',
  'hsl(210, 100%, 50%)',
  'hsl(240, 100%, 50%)',
  'hsl(270, 100%, 50%)',
  'hsl(300, 100%, 50%)',
  'hsl(330, 100%, 50%)',
]

interface IColorSelectProps {
  onClick: (event: React.MouseEvent, color: string) => void;
  open: boolean;
}

const ColorSelect = (props: IColorSelectProps) => {
  const { onClick, open } = props;

  if (!open) {
    return null;
  }

  return (
    <div className={styles.colorSelectContainer}>
      <div
        className={styles.item}
        onClick={(e) => { onClick(e, 'inherit') }}
        style={{ color: 'inherit' }}
      >
        A
      </div>
      <For
        data={colors}
        renderItem={(color) => (
          <div
            className={styles.item}
            onClick={(e) => { onClick(e, color) }}
            style={{ color }}
            key={color}
          >
            A
          </div>
        )}
      />
    </div>
  )
}

export default ColorSelect;