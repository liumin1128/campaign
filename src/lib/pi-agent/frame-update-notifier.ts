export interface FrameScheduler {
  request(callback: () => void): number;
  cancel(frameId: number): void;
}

export interface FrameUpdateNotifier<T> {
  push(value: T): void;
  flush(): void;
}

const browserFrameScheduler: FrameScheduler = {
  request: (callback) => requestAnimationFrame(callback),
  cancel: (frameId) => cancelAnimationFrame(frameId),
};

export function createLatestFrameNotifier<T>(
  notify: (value: T) => void,
  scheduler: FrameScheduler = browserFrameScheduler,
): FrameUpdateNotifier<T> {
  let scheduledFrameId: number | null = null;
  let pendingUpdate: { value: T } | null = null;

  const emitPending = () => {
    scheduledFrameId = null;
    if (!pendingUpdate) return;

    const { value } = pendingUpdate;
    pendingUpdate = null;
    notify(value);
  };

  return {
    push(value) {
      pendingUpdate = { value };
      if (scheduledFrameId === null) {
        scheduledFrameId = scheduler.request(emitPending);
      }
    },
    flush() {
      if (scheduledFrameId !== null) {
        scheduler.cancel(scheduledFrameId);
        scheduledFrameId = null;
      }
      emitPending();
    },
  };
}
