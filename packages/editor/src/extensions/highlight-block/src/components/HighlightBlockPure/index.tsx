interface IHighBlockPureProps {
  backgroundColor: string;
  borderColor: string;
  children: any;
}

const HighBlockPure = (props: IHighBlockPureProps) => {
  const { backgroundColor, borderColor, children } = props;

  return (
    <div
      className="rounded-[0.5em] p-[1.25em]"
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
