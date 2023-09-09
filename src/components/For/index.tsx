interface IForProps<T> {
  data: T[];
  renderItem: (item: T, index: number, data: T[]) => React.ReactNode;
}

const For = <T, >(props: IForProps<T>) => {
  const { data, renderItem } = props;

  return (
    <>
      {data.map(renderItem)}
    </>
  )
};

export default For;