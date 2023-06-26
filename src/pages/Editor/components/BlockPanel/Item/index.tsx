import styles from './index.module.less';

interface IItemProps {
  showBottomLine: boolean;
}

const Item = (props: IItemProps) => {
  const { showBottomLine } = props;

  return (
    <div className={styles.item}>
      <div className={styles.content}>
        Item
      </div>
      { showBottomLine && <div className={styles.bottomLine} /> }
    </div>
  )
}

export default Item;