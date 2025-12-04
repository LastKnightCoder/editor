import React from "react";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
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
          <DndProvider backend={HTML5Backend}>
            <ModuleGrid />
          </DndProvider>
        </div>
      </div>
    </div>
  );
};

export default HomePage;
