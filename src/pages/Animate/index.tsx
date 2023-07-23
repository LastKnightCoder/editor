import { motion } from "framer-motion";
import {Button} from "antd";
import {useState} from "react";

import styles from './index.module.less';

const bubbleSortGenerator = function* (arr: number[]) {
  const len = arr.length;
  for (let i = 0; i < len; i++) {
    for (let j = 0; j < len - 1 - i; j ++) {
      if (arr[j] > arr[j + 1]) {
        const temp = arr[j];
        arr[j] = arr[j+1];
        arr[j+1] = temp;
      }
      yield {
        arr: [...arr],
        i,
        j,
      };
    }
  }
}

const initialArr = [7, 2, 3, 1, 4, 6, 8, 5];
const bubbleSort = bubbleSortGenerator(initialArr);

const Animate = () => {
  const [numbers, setNumbers] = useState(initialArr);
  const [j, setJ] = useState(1);

  const handleClick = () => {
    const {value, done} = bubbleSort.next();
    console.log('value', value, done);
    if (!done) {
      setNumbers(value.arr);
      setJ(value.j);
    }
  }

  return (
    <div>
      <motion.div
        className={styles.list}
      >
        {
          numbers.map((number, index) => (
            <motion.div
              key={number}
              layoutId={String(number)}
              className={styles.item}
              style={{
                backgroundColor: index === j || index === j + 1 ? 'deepskyblue' : 'white',
              }}
            >
              {number}
            </motion.div>
          ))
        }
      </motion.div>
      <Button onClick={handleClick}>点我</Button>
    </div>
  )
}

export default Animate;