import React from "react";
import QuickInput from "./components/QuickInput";
import ModuleGrid from "./components/ModuleGrid";

const HomePage: React.FC = () => {
  return (
    <div className="w-full h-full overflow-auto bg-gray-50 dark:bg-slate-950 flex items-center justify-center">
      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* 快捷输入区域 */}
        <div className="mb-8">
          <QuickInput />
        </div>

        {/* 模块导航区域 */}
        <div>
          <ModuleGrid />
        </div>
      </div>
    </div>
  );
};

export default HomePage;
