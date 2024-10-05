import { memo } from 'react';
import classnames from 'classnames';
import { useMemoizedFn } from 'ahooks';
import SVG from 'react-inlinesvg'
import Geometry from './Geometry';
import Arrow from './Arrow';
import Image from './Image';
import Card from './Card';

import textIcon from '@/assets/white-board/text.svg';

import { ECreateBoardElementType } from '../../types';
import { useCreateElementType, useBoard } from '../../hooks';

import styles from './index.module.less';

const Toolbar = memo(() => {
  const board = useBoard();

  const createBoardElementType = useCreateElementType();

  const onClickCreateElement = useMemoizedFn((type: ECreateBoardElementType) => {
    const createType = type === createBoardElementType ? ECreateBoardElementType.None : type;
    board.currentCreateType = createType;
  });
  
  return (
    <div className={styles.toolBar}>
      <Geometry 
        className={classnames(styles.toolBarItem, {
          [styles.active]: createBoardElementType === ECreateBoardElementType.Geometry,
        })}
      />
      <Arrow
        className={classnames(styles.toolBarItem, {
          [styles.active]: createBoardElementType === ECreateBoardElementType.StraightArrow,
        })} 
      />
      <div
        className={classnames(styles.toolBarItem, {
          [styles.active]: createBoardElementType === ECreateBoardElementType.Text,
        })}
        onClick={() => {
          onClickCreateElement(ECreateBoardElementType.Text)
        }}
      >
        <SVG src={textIcon} />
      </div>
      <Image className={styles.toolBarItem} />
      <Card className={styles.toolBarItem} />
    </div>
  )
});

export default Toolbar;