import styles from './index.module.less';
import Item from '../Item';

const List = () => {
  const list = Array.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  return (
    <div className={styles.list}>
      { list.map((i, index) => (<Item key={i} showBottomLine={index !== list.length - 1} />)) }
    </div>
  )
}

export default List;