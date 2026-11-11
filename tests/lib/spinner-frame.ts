import { spyOn } from "bun:test";

// Pi draws each spinner frame from a timer of its own, so every microtask of one frame has run before the next begins.
export const nextFrame = (): Promise<void> => Bun.sleep(0);

export function clockReads(draw: () => unknown): number {
  const clock = spyOn(Date, "now");
  try {
    draw();
    return clock.mock.calls.length;
  } finally {
    clock.mockRestore();
  }
}
