export interface Module {
  name: string;
  init: () => Promise<void>;
}
