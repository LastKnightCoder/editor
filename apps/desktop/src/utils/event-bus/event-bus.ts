import EventEmitter from "eventemitter3";

export interface EventMap {
  [key: string]: any;
}

class EventBus<T extends EventMap> {
  private emitter: EventEmitter;

  constructor() {
    this.emitter = new EventEmitter();
  }

  subscribe<K extends keyof T>(
    event: K,
    callback: (data: T[K]) => void,
    context?: any,
  ): () => void {
    this.emitter.on(event as string, callback, context);

    return () => {
      this.unsubscribe(event, callback, context);
    };
  }

  subscribeOnce<K extends keyof T>(
    event: K,
    callback: (data: T[K]) => void,
    context?: any,
  ): () => void {
    this.emitter.once(event as string, callback, context);

    return () => {
      this.unsubscribe(event, callback, context);
    };
  }

  unsubscribe<K extends keyof T>(
    event: K,
    callback: (data: T[K]) => void,
    context?: any,
  ): void {
    this.emitter.off(event as string, callback, context);
  }

  publish<K extends keyof T>(event: K, data: T[K]): void {
    this.emitter.emit(event as string, data);
  }

  clear<K extends keyof T>(event?: K): void {
    if (event) {
      this.emitter.removeAllListeners(event as string);
    } else {
      this.emitter.removeAllListeners();
    }
  }
}

const defaultEventBus = new EventBus<EventMap>();

export { EventBus, defaultEventBus };
