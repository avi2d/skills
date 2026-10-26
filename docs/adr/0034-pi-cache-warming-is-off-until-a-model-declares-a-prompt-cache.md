# 34. pi cache warming is off until a model declares a prompt cache

Date: 2026-09-20

## Status

Accepted.

## Context

pi 0.86.0 adds a `cacheWarming` setting, default `"streaming"`: while a
response streams, pi sends extra requests to keep the provider's prompt cache
warm. It acts only for a model whose definition carries a `promptCache` field.
Neither the `claude-bridge` models nor the Ollama models in this setup declare
one, so the default is inert on this machine today.

Inert is the problem. The moment a bridge or Ollama model definition gains a
`promptCache` field, through a package upgrade or a local edit, the default
would start issuing paid requests on every streamed turn with no change to
`harness/pi/settings.json` and nothing on screen to say so.

## Decision

`harness/pi/settings.json` sets `"cacheWarming": "off"`. The setting is
written out even though it changes nothing now, so that a future
`promptCache` declaration cannot switch warming on by itself. Turning it on is
a deliberate edit to that file, taken once a model here has a prompt cache
worth warming and the cost has been looked at.

`showCacheMissNotices` stays on: it reports the cache misses that warming
would address, so a session shows whether the question is worth revisiting.

## Alternatives

Leaving the default in place was rejected for the reason above: a setting
that does nothing until an unrelated file changes, and then spends money, is
the kind of silent switch this repo keeps out of its harness contracts.

Setting `"cacheWarming": "streaming"` explicitly was rejected because there is
no prompt cache to warm, so the choice would be recording an intent nothing
can act on.
