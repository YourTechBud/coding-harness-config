import assert from "node:assert/strict";
import { setImmediate } from "node:timers/promises";
import { test } from "node:test";
import { runConcurrent } from "./concurrency.ts";

function deferred() {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

test("runs ten jobs at a time and fills each free slot without waiting for a batch", async () => {
  const gates = Array.from({ length: 13 }, deferred);
  const started: number[] = [];
  const completed: number[] = [];
  const running = runConcurrent(gates, async (gate) => {
    const index = gates.indexOf(gate);
    started.push(index);
    await gate.promise;
    completed.push(index);
  });

  assert.deepEqual(started, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  gates[2].resolve();
  await setImmediate();
  assert.deepEqual(started, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  gates[10].resolve();
  await setImmediate();
  assert.deepEqual(started, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  gates.forEach((gate) => gate.resolve());
  await running;
  assert.deepEqual(started, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  assert.deepEqual(completed.sort((a, b) => a - b), started);
});

test("stops queued jobs on failure and waits for active jobs before rejecting", async () => {
  const gates = Array.from({ length: 13 }, deferred);
  const started: number[] = [];
  const failure = new Error("install failed");
  let settled = false;
  const running = runConcurrent(gates, async (gate) => {
    started.push(gates.indexOf(gate));
    await gate.promise;
  });
  const rejected = assert.rejects(running, (error) => {
    settled = true;
    return error === failure;
  });

  gates[0].reject(failure);
  await setImmediate();
  assert.equal(settled, false);
  assert.deepEqual(started, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  gates[1].reject(new Error("another failure"));
  gates.slice(2, 10).forEach((gate) => gate.resolve());
  await rejected;
  assert.equal(settled, true);
  assert.deepEqual(started, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
});

test("handles empty queues, small queues, and synchronous failures", async () => {
  await runConcurrent([], async () => assert.fail("no jobs expected"));
  const seen: number[] = [];
  await runConcurrent([1, 2], async (item) => {
    seen.push(item);
  });
  assert.deepEqual(seen, [1, 2]);
  const failure = new Error("synchronous failure");
  await assert.rejects(
    runConcurrent([1, 2], () => { throw failure; }),
    (error) => error === failure,
  );
});
