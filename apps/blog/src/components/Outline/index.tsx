import classNames from 'classnames';

interface HeaderItem {
  title: string;
  level: number;
}

interface OutlineProps {
  headers: HeaderItem[];
  className?: string;
  style?: React.CSSProperties;
  onClick?: (index: number) => void;
}

const levelClassMap: Record<number, string> = {
  1: 'pl-0 text-base',
  2: 'pl-2 text-sm',
  3: 'pl-4 text-sm text-gray-500',
};

const Outline = ({ headers, className, style, onClick }: OutlineProps) => {
  return (
    <div className={classNames('flex flex-col gap-2', className)} style={style}>
      {headers.map((header, index) => (
        <button
          key={index}
          type="button"
          className={classNames(
            'text-left text-gray-600 hover:text-blue-500 transition-colors',
            levelClassMap[header.level] ?? 'pl-0',
          )}
          onClick={() => onClick?.(index)}
        >
          {header.title}
        </button>
      ))}
    </div>
  );
};

export default Outline;
