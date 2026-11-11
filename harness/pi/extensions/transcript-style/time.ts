const two = (value: number): string => `${value}`.padStart(2, "0");

const clock = (timestamp: number): string => {
  const at = new Date(timestamp);
  return `${two(at.getHours())}:${two(at.getMinutes())}`;
};

const sameDay = (first: Date, second: Date): boolean =>
  first.getFullYear() === second.getFullYear() && first.getMonth() === second.getMonth() && first.getDate() === second.getDate();

// The only thing about now that formatTime reads, so a time formatted on one day still holds on that day.
export function dayOf(now: number): number {
  const at = new Date(now);
  return at.getFullYear() * 10_000 + at.getMonth() * 100 + at.getDate();
}

export function formatTime(timestamp: number, now: number = Date.now()): string {
  const at = new Date(timestamp);
  if (sameDay(at, new Date(now))) return clock(timestamp);
  return `${at.getFullYear()}-${two(at.getMonth() + 1)}-${two(at.getDate())} ${clock(timestamp)}`;
}
