import type { DatabaseListResponse } from "../../../types";
import { CheckMark } from "./ui";

type DatabaseSectionProps = {
  databases: DatabaseListResponse | null;
  onSwitchDatabase: (name: string) => Promise<void>;
};

export function DatabaseSection(props: DatabaseSectionProps) {
  return (
    <div className="space-y-4">
      <div className="list-group">
        {props.databases?.databases.map((db) => {
          const active = db.name === props.databases?.activeDatabase;
          return (
            <button
              key={db.name}
              type="button"
              onClick={() => void props.onSwitchDatabase(db.name)}
              className="list-item w-full"
            >
              <div className="flex items-center gap-3">
                <span className="text-[15px] text-gray-800 dark:text-gray-100">
                  {db.name}
                </span>
                <span className="text-xs text-gray-400 dark:text-gray-500">
                  v{db.version}
                </span>
              </div>
              {active && <CheckMark />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
