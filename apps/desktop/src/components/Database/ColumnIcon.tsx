import PluginManager from "./PluginManager";

const ColumnIcon = ({ type, pluginManager }: { type: string; pluginManager?: PluginManager }) => {
  const plugin = pluginManager?.getPlugin(type);
  const Icon = plugin?.Icon;
  if (!Icon) return <span className="mr-1.5" />;
  return (
    <span className="text-ink-2 mr-1.5 inline-flex items-center justify-center">
      <Icon />
    </span>
  );
};

export default ColumnIcon;
