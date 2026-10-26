# 45. A rate-limited request is retried inside the request

Date: 2026-09-23

## Status

Accepted.

## Context

Three concurrent workers on opencode-go hit `429 rate_limit_exceeded`,
"Upstream request failed". quota-axi had opencode-go at 96 to 98 percent of its
rolling, weekly and monthly windows, so this was a throttle. Backing off fixes
a throttle. Spending less does not.

pi retries in two places, and they are unrelated.

- **Provider level**, `retry.provider` in pi's settings. pi-ai's
  `retryProviderRequest` repeats the HTTP request inside one assistant turn. It
  sleeps silently: no session event, nothing in the TUI. With no `maxRetries`
  it retries nothing, which was the case for every worker.
- **Agent level**, `retry`, defaulting to 3 retries after 2s, 4s and 8s. It
  restarts the whole turn when the error text matches pi's retryable pattern,
  and "429" and "rate limit" both match. Each retry emits `auto_retry_start`.
  The four attempts together are the "4" the workers were getting.

The wait between provider retries depends on whether the 429 carries
`retry-after` or `retry-after-ms`:

- **Without it**, retry `i` (from 0) waits `min(0.5 * 2^i, 8)` seconds, less up
  to 25 percent jitter. The wait stops growing at 8s, whatever
  `maxRetryDelayMs` says.
- **With it**, pi waits exactly what the server asks, but only up to
  `maxRetryDelayMs` (60s by default). A longer request fails at once with
  "Server requested Ns retry delay", and the agent level then retries that
  error as a matching one.

We could not provoke a real opencode-go 429 on demand, so we do not know
whether it sends either header.

## Decision

**`retry.provider` in `harness/pi/settings.json` sets `maxRetries: 12` and
`maxRetryDelayMs: 180000`. The agent level stays at pi's defaults.**

- **12** retries without a header wait 0.5 + 1 + 2 + 4 + 8 × 8 = 71.5s
  nominally, and 53.6s at worst jitter. So a single request outlasts a
  one-minute throttle window before it gives up. The agent level's four
  attempts bring a turn to about 4 to 5 minutes (4 × 54–72s plus 14s)
  before the worker sees a hard error.
- **180000** only matters if opencode-go sends a header. Then it accepts a
  wait of up to three minutes, one minute for each concurrent worker draining
  the window ahead of this one. The 60s default would fail any wait over a
  minute straight away.

`tests/e2e/pi-provider-retry.test.ts` covers this in three ways. It runs pi-ai's
retry loop against a stubbed 429. It builds a pi session on the shipped
settings against a local server that answers 429 once. And it shows that the
same session built without the block falls through to the agent-level retry.

## Consequences

- Provider sleeps are silent. Without a header, a worker can go up to about
  72s per attempt with no event. With one, it can go up to 180s per wait.
  Either way it is waiting, not hung, and an abort still interrupts the sleep.
- If opencode-go sends waits near the cap, the worst case is 12 × 180s per
  attempt × 4 attempts, about 2.4 hours before a hard error. This bound is
  deliberate. A shorter ceiling would turn a server that says "wait" into a
  dead worker.
- The settings are global. Any provider that goes through pi-ai's request
  retry gets 12 retries on 408, 409, 429, 5xx and transport errors, not only
  opencode-go.

## Alternatives

We rejected raising the agent level (`retry.maxRetries`, `baseDelayMs`,
`maxAgentDelayMs`) as the main fix. It restarts whole turns and leaves the
single request unretried, and it would lengthen every provider's retries on
evidence from one provider. If 4 to 5 minutes turns out to be too short
against a header-less 429, it is the knob to raise next. Unlike the provider
level, it shows its waits.
