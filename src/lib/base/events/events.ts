import { type Disposable } from "$lib/base/disposable";

export interface TypedEvent<T> {
  (listener: (data: T) => void): Disposable;
}

const EVENT_NAME = "dat";

export class Emitter<T> implements Disposable {
  private eventTarget?: EventTarget;

  readonly event: TypedEvent<T>;

  constructor() {
    this.eventTarget = new EventTarget();

    this.event = (listener) => {
      const target = this.eventTarget;
      if (!target) {
        throw new Error("Creating event listener after disposal.");
      }

      const handler = (evt: Event) => {
        listener((evt as CustomEvent<T>).detail);
      };

      target.addEventListener(EVENT_NAME, handler);

      return {
        dispose: () => {
          this.eventTarget?.removeEventListener(EVENT_NAME, handler);
        }
      };
    };
  }

  emit(data: T): void {
    if (!this.eventTarget) {
      throw new Error("Cannot call after dispose()");
    }

    this.eventTarget.dispatchEvent(
      new CustomEvent<T>(EVENT_NAME, { detail: data })
    );
  }

  dispose(): void {
    this.eventTarget = undefined;
  }
}
