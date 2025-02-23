import { memo } from 'react';
import classnames from 'classnames';
import { useMemoizedFn } from 'ahooks';
import SVG from 'react-inlinesvg'
import Geometry from './Geometry';
import Arrow from './Arrow';
import Image from './Image';
import Video from './Video';
import Card from './Card';
import MindMap from "./MindMap";

import textIcon from '@/assets/white-board/text.svg';

import { ECreateBoardElementType } from '../../types';
import { useBoard, useCreateElementType } from '../../hooks';

import styles from './index.module.less';


const Toolbar = memo(() => {
  const board = useBoard();

  const createBoardElementType = useCreateElementType();

  const onClickCreateElement = useMemoizedFn((type: ECreateBoardElementType) => {
    board.currentCreateType = type === createBoardElementType ? ECreateBoardElementType.None : type;
  });
  
  return (
    <div className={styles.toolBar} onClick={e => e.stopPropagation()}>
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
      <MindMap
        className={classnames(styles.toolBarItem, {
          [styles.active]: createBoardElementType === ECreateBoardElementType.MindMap,
        })}
      />
      <Image className={styles.toolBarItem} />
      <Video className={styles.toolBarItem} />
      <Card className={styles.toolBarItem} />
    </div>
  )
});

export default Toolbar;
