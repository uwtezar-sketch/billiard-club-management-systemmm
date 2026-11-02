import { test } from "node:test";
import assert from "node:assert/strict";
import { startTablePolling, type PollingEnvironment } from "../src/lib/tablePolling";
import { normalizeDatabaseUrl } from "../src/lib/databaseUrl";

function harness() {
  let now = 0;
  let visible = true;
  let online = true;
  let id = 0;
  const timers = new Map<number, { at: number; callback: () => void }>();
  const listeners = new Map<string, Set<() => void>>();
  const env: PollingEnvironment = {
    now: () => now, isVisible: () => visible, isOnline: () => online,
    setTimer(callback, delay) { timers.set(++id, { at: now + delay, callback }); return id; },
    clearTimer(timer) { timers.delete(timer as number); },
    listen(event, callback) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(callback);
      return () => { listeners.get(event)?.delete(callback); };
    },
  };
  const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
  const emit = (event: string) => listeners.get(event)?.forEach((callback) => callback());
  return {
    env, timers, listeners, flush, emit,
    async advance(amount: number) {
      const end = now + amount;
      while (true) {
        const next = [...timers].sort((a, b) => a[1].at - b[1].at)[0];
        if (!next || next[1].at > end) break;
        now = next[1].at;
        timers.delete(next[0]);
        next[1].callback();
        await flush();
      }
      now = end;
      await flush();
    },
    visibility(value: boolean) { visible = value; emit("visibilitychange"); },
    network(value: boolean) { online = value; emit(value ? "online" : "offline"); },
  };
}

test("hidden/offline screens stop polling and refresh immediately on return", async () => {
  const h = harness();
  let reads = 0;
  const controller = startTablePolling({ refresh: async () => { reads++; }, hasActiveWork: () => true, onPaused() {}, environment: h.env });
  await h.flush();
  assert.equal(reads, 1);
  h.visibility(false);
  await h.advance(30 * 60_000);
  assert.equal(reads, 1);
  h.visibility(true);
  await h.flush();
  assert.equal(reads, 2);
  h.network(false);
  await h.advance(60_000);
  assert.equal(reads, 2);
  h.network(true);
  await h.flush();
  assert.equal(reads, 3);
  controller.stop();
});

test("empty unattended club pauses, user interaction resumes; active games keep syncing", async () => {
  const h = harness();
  let reads = 0;
  let active = false;
  let paused = false;
  const controller = startTablePolling({ refresh: async () => { reads++; }, hasActiveWork: () => active, onPaused(value) { paused = value; }, environment: h.env });
  await h.flush();
  await h.advance(20 * 60_000);
  assert.equal(paused, true);
  const idleReads = reads;
  await h.advance(60 * 60_000);
  assert.equal(reads, idleReads);
  h.emit("pointerdown");
  await h.flush();
  assert.equal(reads, idleReads + 1);
  active = true;
  await h.advance(30 * 60_000);
  assert.equal(paused, false);
  assert.equal(reads, idleReads + 31);
  controller.stop();
  assert.equal(h.timers.size, 0);
  assert.equal([...h.listeners.values()].every((set) => set.size === 0), true);
});

test("slow reads never overlap, queued manual refresh runs after them", async () => {
  const h = harness();
  let reads = 0;
  let release: () => void = () => {};
  const controller = startTablePolling({
    refresh: async () => { reads++; await new Promise<void>((resolve) => { release = resolve; }); },
    hasActiveWork: () => true, onPaused() {}, environment: h.env,
  });
  controller.refreshNow();
  controller.refreshNow();
  await h.advance(5 * 60_000);
  assert.equal(reads, 1);
  release();
  await h.flush();
  assert.equal(reads, 2);
  controller.stop();
  release();
  await h.flush();
  assert.equal(h.timers.size, 0);
});

test("read failures retry and an initially hidden page sends no request", async () => {
  const h = harness();
  h.visibility(false);
  let reads = 0;
  const controller = startTablePolling({ refresh: async () => { reads++; throw new Error("TEST_FAILURE"); }, hasActiveWork: () => true, onPaused() {}, environment: h.env });
  assert.equal(reads, 0);
  h.visibility(true);
  await h.flush();
  await h.advance(60_000);
  assert.equal(reads, 2);
  controller.stop();
});

test("database URL makes existing verification explicit without disabling TLS or losing parameters", () => {
  const input = "postgresql://test_user:test_pass@test.invalid/test_db?sslmode=require&channel_binding=require";
  const output = new URL(normalizeDatabaseUrl(input));
  assert.equal(output.searchParams.get("sslmode"), "verify-full");
  assert.equal(output.searchParams.get("channel_binding"), "require");
  assert.equal(output.username, "test_user");
  assert.equal(output.password, "test_pass");
  const compat = new URL(normalizeDatabaseUrl(input + "&uselibpqcompat=true"));
  assert.equal(compat.searchParams.get("sslmode"), "require");
  assert.throws(() => normalizeDatabaseUrl("INVALID_TEST_SECRET"), { message: "DATABASE_URL is invalid" });
});
