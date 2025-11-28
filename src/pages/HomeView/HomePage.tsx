import React from "react";
import QuickInput from "./components/QuickInput";
import ModuleGrid from "./components/ModuleGrid";

const HomePage: React.FC = () => {
  return (
    <div className="w-full h-full overflow-auto flex items-center justify-center">
      <div className="max-w-4xl mx-auto px-6 py-12">
        <div className="mb-12">
          <QuickInput />
        </div>

        <div>
          <ModuleGrid />
        </div>
      </div>
    </div>
  );
};

export default HomePage;
