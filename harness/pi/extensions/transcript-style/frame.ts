export function sameRows(kept: readonly string[], drawn: readonly string[]): boolean {
  if (kept.length !== drawn.length) return false;
  for (let at = 0; at < kept.length; at += 1) if (kept[at] !== drawn[at]) return false;
  return true;
}

// Redrawn on every spinner frame, so what is built from pi's rows is kept until those rows or the key change.
export function keepLines<Key>(build: (rows: readonly string[], key: Key) => string[], sameKey: (kept: Key, key: Key) => boolean = Object.is): (rows: readonly string[], key: Key) => string[] {
  let kept: { readonly key: Key; readonly rows: readonly string[]; readonly lines: string[] } | undefined;
  return (rows, key) => {
    // Copied, because pi may reuse the array it returned and change it in place.
    if (kept === undefined || !sameKey(kept.key, key) || !sameRows(kept.rows, rows)) kept = { key, rows: [...rows], lines: build(rows, key) };
    return kept.lines;
  };
}

export type Frame<Value> = { readonly id: number; readonly value: Value };

// Pi draws a frame in one synchronous stretch and draws no component twice in it, so what the first component reads holds until the next microtask or until a component draws again.
export function frames<Value>(read: () => Value): (drewIn: number | undefined) => Frame<Value> {
  let frame: Frame<Value> | undefined;
  let drawn = 0;
  return (drewIn) => {
    if (frame === undefined) {
      queueMicrotask(() => {
        frame = undefined;
      });
    }
    if (frame === undefined || drewIn === frame.id) {
      drawn += 1;
      frame = { id: drawn, value: read() };
    }
    return frame;
  };
}

export function oncePerFrame<Value>(read: () => Value): (component: object) => Value {
  const frameAfter = frames(read);
  const drewIn = new WeakMap<object, number>();
  return (component) => {
    const frame = frameAfter(drewIn.get(component));
    drewIn.set(component, frame.id);
    return frame.value;
  };
}
