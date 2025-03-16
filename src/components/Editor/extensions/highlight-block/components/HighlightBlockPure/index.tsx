import styles from "./index.module.less";

interface IHighBlockPureProps {
  backgroundColor: string;
  borderColor: string;
  children: any;
}

const HighBlockPure = (props: IHighBlockPureProps) => {
  const { backgroundColor, borderColor, children } = props;

  return (
    <div
      className={styles.container}
      style={{
        backgroundColor,
        border: `0.125em solid ${borderColor}`,
      }}
    >
      {children}
    </div>
  );
};

export default HighBlockPure;
