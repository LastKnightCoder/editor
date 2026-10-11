import { useMemo } from "react";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { DataTableView } from "@/types";

export const CARD_DATABASE_PREFERENCES_KEY = "tau-card-database-views";
const databaseId = (database: string) => database.replace(/\.db$/, "");

export interface CardDatabasePreferences {
  views: DataTableView[];
  activeViewId: number | null;
  columnWidths: Record<string, number>;
}

const EMPTY: CardDatabasePreferences = { views: [], activeViewId: null, columnWidths: {} };

/** 旧顶层键 → 视图 type 子键（与开库升级 data-table-view-options-upgrade.ts 同规则，渲染端各自实现） */
const LEGACY_VIEW_CONFIG_KEYS: Record<string, string> = {
  galleryConfig: "gallery",
  calendarConfig: "calendar",
  kanbanConfig: "kanban",
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

/** v1 → v2：把每个视图 config 的旧三键移入 viewOptions（只移动非空对象，已有同名子键以已有为准；与开库升级 data-table-view-options-upgrade.ts 同规则） */
function migratePreferences(preferences: unknown): unknown {
  if (!isPlainObject(preferences) || !Array.isArray(preferences.views)) return preferences;
  return { ...preferences, views: preferences.views.map(migrateViewConfigKeys) };
}

function migrateViewConfigKeys(view: unknown): unknown {
  if (!isPlainObject(view) || !isPlainObject(view.config)) return view;
  const config = { ...view.config };
  let viewOptions = isPlainObject(config.viewOptions) ? { ...config.viewOptions } : undefined;
  for (const [legacyKey, typeKey] of Object.entries(LEGACY_VIEW_CONFIG_KEYS)) {
    const legacyValue = config[legacyKey];
    if (legacyValue === undefined) continue;
    delete config[legacyKey];
    if (!isPlainObject(legacyValue) || Object.keys(legacyValue).length === 0) continue;
    viewOptions ??= {};
    if (viewOptions[typeKey] === undefined) viewOptions[typeKey] = legacyValue;
  }
  if (viewOptions) config.viewOptions = viewOptions;
  return { ...view, config };
}

interface PreferencesState {
  byDatabase: Record<string, CardDatabasePreferences>;
  legacyDefaults: CardDatabasePreferences | null;
  initialize(database: string): void;
  setActiveViewId(database: string, id: number | null): void;
  addView(database: string, view: DataTableView): DataTableView;
  updateView(database: string, id: number, patch: Partial<DataTableView>): void;
  deleteView(database: string, id: number): void;
  reorderViews(database: string, ids: number[]): void;
  setColumnWidth(database: string, id: string, width: number): void;
}

export function createCardDatabasePreferencesStore(storage: Storage) {
  return create<PreferencesState>()(
    persist(
      (set, get) => {
        const latest = (
          fallback: Pick<PreferencesState, "byDatabase" | "legacyDefaults">
        ): Pick<PreferencesState, "byDatabase" | "legacyDefaults"> => {
          try {
            const cached = storage.getItem(CARD_DATABASE_PREFERENCES_KEY);
            const state = cached ? JSON.parse(cached).state : null;
            return state?.byDatabase && typeof state.byDatabase === "object"
              ? {
                  byDatabase: state.byDatabase as PreferencesState["byDatabase"],
                  legacyDefaults: state.legacyDefaults ?? null,
                }
              : fallback;
          } catch {
            return fallback;
          }
        };
        const update = (
          database: string,
          apply: (preferences: CardDatabasePreferences) => CardDatabasePreferences
        ) => {
          const key = databaseId(database);
          get().initialize(key);
          set(state => {
            const current = latest(state);
            return {
              ...current,
              byDatabase: {
                ...current.byDatabase,
                [key]: apply(current.byDatabase[key] ?? state.byDatabase[key]),
              },
            };
          });
        };
        return {
          byDatabase: {},
          legacyDefaults: null,
          initialize: database => {
            const key = databaseId(database);
            if (Object.hasOwn(get().byDatabase, key)) return;
            const current = latest(get());
            if (Object.hasOwn(current.byDatabase, key)) {
              set(current);
              return;
            }
            const snapshot = structuredClone(current.legacyDefaults ?? EMPTY);
            if (!snapshot.views.length) {
              const now = Date.now();
              snapshot.views = [
                {
                  id: now,
                  tableId: 0,
                  name: "所有卡片",
                  type: "table",
                  order: 0,
                  config: {
                    columnOrder: [],
                    rowOrder: [],
                    sorts: [],
                    filters: null,
                    groupBy: null,
                  },
                  createTime: now,
                  updateTime: now,
                },
              ];
            }
            if (!snapshot.views.some(view => view.id === snapshot.activeViewId))
              snapshot.activeViewId = snapshot.views[0].id;
            snapshot.columnWidths ??= {};
            set({ ...current, byDatabase: { ...current.byDatabase, [key]: snapshot } });
          },
          setActiveViewId: (database, id) =>
            update(database, current => ({
              ...current,
              activeViewId: current.views.some(view => view.id === id)
                ? id
                : (current.views[0]?.id ?? null),
            })),
          addView: (database, view) => {
            let created = view;
            update(database, current => {
              const id = current.views.some(item => item.id === view.id)
                ? Math.max(Date.now(), ...current.views.map(item => item.id + 1))
                : view.id;
              created = { ...view, id };
              return { ...current, views: [...current.views, created] };
            });
            return created;
          },
          updateView: (database, id, patch) =>
            update(database, current => ({
              ...current,
              views: current.views.map(view => (view.id === id ? { ...view, ...patch, id } : view)),
            })),
          deleteView: (database, id) =>
            update(database, current => {
              const views = current.views.filter(view => view.id !== id);
              return {
                ...current,
                views,
                activeViewId:
                  current.activeViewId === id ? (views[0]?.id ?? null) : current.activeViewId,
              };
            }),
          reorderViews: (database, ids) =>
            update(database, current => ({
              ...current,
              views: [...new Set([...ids, ...current.views.map(view => view.id)])]
                .map(id => current.views.find(view => view.id === id))
                .filter((view): view is DataTableView => Boolean(view))
                .map((view, order) => ({ ...view, order })),
            })),
          setColumnWidth: (database, id, width) => {
            if (!Number.isFinite(width)) return;
            update(database, current => ({
              ...current,
              columnWidths: { ...current.columnWidths, [id]: Math.max(50, width) },
              views: current.views.map(view =>
                view.id === current.activeViewId
                  ? {
                      ...view,
                      config: {
                        ...view.config,
                        columnWidths: { ...view.config.columnWidths, [id]: Math.max(50, width) },
                      },
                    }
                  : view
              ),
            }));
          },
        };
      },
      {
        name: CARD_DATABASE_PREFERENCES_KEY,
        version: 2,
        storage: createJSONStorage(() => storage),
        // v1 视图 config 里的旧三键收进 viewOptions（D-137）；全部设备升级后随清洁版删除
        migrate: (state, version) => {
          if (version >= 2 || !isPlainObject(state)) return state as never;
          const next = { ...state };
          if (isPlainObject(next.byDatabase)) {
            const migrated: Record<string, unknown> = {};
            for (const [database, value] of Object.entries(next.byDatabase))
              migrated[database] = migratePreferences(value);
            next.byDatabase = migrated;
          }
          if (next.legacyDefaults != null)
            next.legacyDefaults = migratePreferences(next.legacyDefaults);
          return next as never;
        },
        partialize: state => ({
          byDatabase: state.byDatabase,
          legacyDefaults: state.legacyDefaults,
        }),
      }
    )
  );
}

export const useCardsDatabasePreferencesStore = createCardDatabasePreferencesStore(
  window.localStorage
);

window.addEventListener("storage", event => {
  if (event.key === CARD_DATABASE_PREFERENCES_KEY)
    void useCardsDatabasePreferencesStore.persist.rehydrate();
});

export function useCardDatabasePreferences(database: string) {
  const key = databaseId(database);
  const preferences = useCardsDatabasePreferencesStore(state =>
    Object.hasOwn(state.byDatabase, key) ? state.byDatabase[key] : EMPTY
  );
  const actions = useMemo(() => {
    const state = useCardsDatabasePreferencesStore.getState();
    return {
      initializeDefaultView: () => state.initialize(key),
      setActiveViewId: (id: number | null) => state.setActiveViewId(key, id),
      addView: (view: DataTableView) => state.addView(key, view),
      updateView: (id: number, patch: Partial<DataTableView>) => state.updateView(key, id, patch),
      deleteView: (id: number) => state.deleteView(key, id),
      reorderViews: (ids: number[]) => state.reorderViews(key, ids),
      setColumnWidth: (id: string, width: number) => state.setColumnWidth(key, id, width),
    };
  }, [key]);
  return { ...preferences, ...actions };
}
