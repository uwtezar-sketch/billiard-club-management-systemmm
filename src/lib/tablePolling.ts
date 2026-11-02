type PollingEvent = "visibilitychange" | "online" | "offline" | "focus" | "pointerdown" | "keydown" | "eram:refresh";

export interface PollingEnvironment {
  now(): number;
  isVisible(): boolean;
  isOnline(): boolean;
  setTimer(callback: () => void, delay: number): unknown;
  clearTimer(timer: unknown): void;
  listen(event: PollingEvent, callback: () => void): () => void;
}

function browserEnvironment(): PollingEnvironment {
  return {
    now: () => Date.now(),
    isVisible: () => document.visibilityState === "visible",
    isOnline: () => navigator.onLine,
    setTimer: (callback, delay) => setTimeout(callback, delay),
    clearTimer: (timer) => clearTimeout(timer as ReturnType<typeof setTimeout>),
    listen: (event, callback) => {
      const target = event === "visibilitychange" ? document : window;
      target.addEventListener(event, callback);
      return () => target.removeEventListener(event, callback);
    },
  };
}

export function startTablePolling(options: {
  refresh(): Promise<void>;
  hasActiveWork(): boolean;
  onPaused(paused: boolean): void;
  environment?: PollingEnvironment;
  intervalMs?: number;
  idleMs?: number;
}) {
  const env = options.environment ?? browserEnvironment();
  const interval = options.intervalMs ?? 60_000;
  const idle = options.idleMs ?? 10 * 60_000;
  let lastActivity = env.now();
  let timer: unknown;
  let stopped = false;
  let running = false;
  let queued = false;
  let paused = false;

  function clearTimer() {
    if (timer !== undefined) env.clearTimer(timer);
    timer = undefined;
  }

  function canRefresh() {
    const allowed = env.isVisible() && env.isOnline() &&
      (options.hasActiveWork() || env.now() - lastActivity < idle);
    paused = !allowed;
    options.onPaused(paused);
    return allowed;
  }

  async function refresh() {
    clearTimer();
    if (stopped || !canRefresh()) return;
    if (running) {
      queued = true;
      return;
    }
    running = true;
    try {
      await options.refresh();
    } catch {
      // The caller displays the error. A failed read must not stop future retries.
    } finally {
      running = false;
      if (!stopped) {
        if (queued) {
          queued = false;
          void refresh();
        } else if (canRefresh()) {
          timer = env.setTimer(() => { void refresh(); }, interval);
        }
      }
    }
  }

  function refreshNow() {
    lastActivity = env.now();
    void refresh();
  }

  function activity() {
    lastActivity = env.now();
    if (paused) void refresh();
  }

  function visibilityOrNetwork() {
    clearTimer();
    if (env.isVisible() && env.isOnline()) refreshNow();
    else canRefresh();
  }

  const unlisten = [
    env.listen("visibilitychange", visibilityOrNetwork),
    env.listen("online", visibilityOrNetwork),
    env.listen("offline", visibilityOrNetwork),
    env.listen("focus", refreshNow),
    env.listen("pointerdown", activity),
    env.listen("keydown", activity),
    env.listen("eram:refresh", refreshNow),
  ];
  void refresh();

  return {
    refreshNow,
    stop() {
      stopped = true;
      clearTimer();
      unlisten.forEach((remove) => remove());
    },
  };
}
