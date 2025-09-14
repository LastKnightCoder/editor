import classNames from "classnames";

interface IOpenIndicatorProps {
  open: boolean;
  showIndicator: boolean;
  onOpenChange: (open: boolean) => void;
}

const OpenIndicator = (props: IOpenIndicatorProps) => {
  const { open, showIndicator, onOpenChange } = props;

  return (
    <div
      className={`w-4 h-12 flex items-center justify-center rounded-[8px] bg-white border border-gray-200 dark:bg-black dark:border-gray-600 ${showIndicator ? "opacity-100" : "opacity-0"}`}
      onClick={() => {
        onOpenChange(!open);
      }}
    >
      <div
        className={classNames(
          "border-[5px] border-transparent border-l-[#212121] dark:border-l-[#f0f0f0] ml-[5px]",
          {
            "rotate-180 ml-[-5px]!": open,
          },
        )}
      ></div>
    </div>
  );
};

export default OpenIndicator;
