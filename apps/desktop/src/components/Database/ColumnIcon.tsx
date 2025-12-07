import PluginManager from "./PluginManager";

const ColumnIcon = ({
  type,
  pluginManager,
}: {
  type: string;
  pluginManager?: PluginManager;
}) => {
  const plugin = pluginManager?.getPlugin(type);
  const Icon = plugin?.Icon;
  if (!Icon)
    return (
      <span className="inline-flex items-center justify-center mr-1.5 text-[#666]"></span>
    );
  return (
    <span className="inline-flex items-center justify-center mr-1.5 text-[#666]">
      <Icon />
    </span>
  );
};

export default ColumnIcon;
