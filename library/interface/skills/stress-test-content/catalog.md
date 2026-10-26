# Worst-case catalog

Realistic values that break a layout, grouped by the kind of value rendered.
Use the rows that apply to the mapped fields.
Emails and URLs use `example.com`, `example.org` or `.test` domains, so a fixture never points at a real inbox or site.

## Names

| Value | What it tends to break |
| --- | --- |
| `Aleksandra Wiśniewska-Kowalczyk` | Long, hyphenated and accented, so it wraps and breaks at the hyphen |
| `Christopher Alexander Montgomery III` | A suffix, where naive initials give `CI` |
| `Константин Константинопольский` | Long Cyrillic, which needs the face to hold Cyrillic glyphs |
| `Jo` and `J` | Very short, leaving the column empty and the click target tiny |
| `Đặng Thị Ngọc Hân` | Stacked diacritics, clipped by a tight `line-height` with `overflow: hidden` |
| `王秀英` | No spaces, so word-based initials find one word |
| `نور الهدى عبد الرحمن` | Right to left, where punctuation and icons land on the wrong side without `dir="auto"` |
| `🦊 Fox` and `👩🏽‍💻 Priya` | An emoji first, where `.charAt(0)` returns half a surrogate pair and slicing splits a sequence |
| `  Sam   Lee ` | Extra spaces, which give empty words and odd gaps |
| no name at all | The fallback the UI shows when only an email exists |

## Emails, URLs and identifiers

| Value | What it tends to break |
| --- | --- |
| `bartholomew.fitzgerald@northwind-industries-holdings.example.com` | No break opportunity, so it pushes siblings off the row |
| `first.last+billing-notifications@example.com` | Plus addressing in validation, and truncation that hides the meaningful part |
| `https://example.com/workspaces/acme/projects/q3-launch/docs/9f8e7d6c5b4a?tab=comments` | A long URL, where end truncation hides the part that differs |
| `9f8e7d6c-5b4a-4c3d-8e2f-1a0b9c8d7e6f` | A UUID, a candidate for middle truncation |
| `Q3 Board Deck FINAL revised v12.pdf` | A file name, where end truncation hides the version and extension |

## Labels and copy from data

| Value | What it tends to break |
| --- | --- |
| `Senior Product Design Engineer, Platform Infrastructure` | A long title wrapping to three lines in a secondary slot |
| `Invitation expired 12 days ago` | A long badge that wraps or squeezes the name |
| `Benachrichtigungseinstellungen` | A long compound word with no break opportunity |
| `Связаться со мной по электронной почте` | A real Russian action label, longer than its English source |
| twelve tags on one item | A tag row that wraps into a wall without an overflow count |
| `Untitled`, an empty string, spaces only | A collapsed heading or a zero-height row |
| `<script>alert(1)</script>`, `&amp;`, `**bold**` | Escaping, since each renders as literal text |
| a newline inside a single-line field | A row that doubles in height or drops the line |
| a 2,000-character description | Clamping, a show more control and textarea growth |

## Numbers

| Value | What it tends to break |
| --- | --- |
| `0` and `1` | Zero states and plurals, such as "1 members" |
| `1284` and `1000000` | A missing thousands separator and the width of a count badge |
| `12345678.9` as money | A totals column overflowing |
| `-42.5` and `142%` | A negative sign, and a meter past its bounds |
| `0.1 + 0.2`, `null`, `undefined`, `NaN` | A raw value rendered literally |
| `1.284` in `de-DE` against `1,284` in `en-US` | A hardcoded separator |
| a value that changes live from 99 to 100 | Jitter without `tabular-nums` |

## Collections, time and media

| Value | What it tends to break |
| --- | --- |
| zero items, one item, page size plus one | The empty state, a lone card, and an empty second page |
| 1,000 or more items unpaginated | Scroll performance and render time |
| one item ten times the size of the rest | Grid rows stretching to the tallest item |
| now, 12 days ago, a future date | Relative time thresholds and "in 3 days" |
| an image URL that returns 404, or no image | The fallback, and its size beside real images |
| a 4000 by 200 image | Distortion without `object-fit: cover` |
| a slow image | Layout shift without dimensions or `aspect-ratio` |

## States and environment

| Condition | What it tends to break |
| --- | --- |
| loading | A skeleton that does not match the final layout, or a spinner that shifts content |
| an API error | No error state, or a raw `TypeError` shown to the person |
| offline, then online | A retry that never recovers, and lost input |
| a double submission | Two requests from one intent |
| every status at once | Badge widths that vary across rows |
| a 320 px container or a 280 px sidebar | Every overflow at once |
| a 2560 px window | Lines too long to read |
| 200 % zoom or a large text setting | Fixed heights that clip growing text |
| right to left | Icons, chevrons, padding and the order of trailing actions |
| touch | An action that appears only on hover |

## Failure signatures

| What shows | Cause | Fix |
| --- | --- | --- |
| An avatar or icon squashed into an oval | A flex child shrinking | `flex-shrink: 0` on the fixed-size box |
| Text overflowing instead of wrapping | A flex or grid child at `min-width: auto` | `min-width: 0`, or `minmax(0, 1fr)` in a grid |
| An email or URL running past the edge | No break opportunity | `overflow-wrap: anywhere` on that element |
| A trailing action pushed off or clipped | The middle took all the space | `min-width: 0` on the middle and `flex-shrink: 0` on the action |
| A badge wrapping to two lines | The badge may shrink | `white-space: nowrap` and `flex-shrink: 0`, then decide what yields |
| A heading broken mid-word | `word-break: break-all` | `overflow-wrap: anywhere` |
| Wrong initials | Code like `.split(' ')[0][0]` | Initials from grapheme clusters through `Intl.Segmenter`, with a fallback icon |
| A lone placeholder dash where a field was | A placeholder for a missing optional field | Omit the line, or reserve its height on purpose |
| "1 members" | A hardcoded plural | `Intl.PluralRules` |
| `1284`, `NaN`, `undefined` | A raw number | `Intl.NumberFormat` in the person's locale only after `Number.isFinite` accepts the value, and otherwise the product's existing missing or invalid state |
| A translated button label overflowing | A fixed `width` | Width from content with a `min-width` |
| Diacritics clipped top or bottom | A tight `line-height` with `overflow: hidden` | Looser leading, or no clipping on text |
| Truncated text with no way to read it | `text-overflow: ellipsis` alone | A `title` or tooltip, and the full value elsewhere |
| A long list stutters | Every row rendered | Virtualise or paginate, and say which |

## Wrap, truncate or clamp

Decide per field rather than globally.

- Wrap text the person needs whole to identify something, such as a name or a title.
- Truncate at the end secondary text whose start carries the meaning, with a way to see the full value.
- Truncate in the middle values that differ at the end, such as file names, paths and hashes.
- Clamp a multi-line preview in a card so card heights stay predictable.
- Never truncate numbers, amounts, dates or anything a person compares.

Adapted and changed from `skills/break-ui/CATALOG.md` and `skills/break-ui/SKILL.md` in `https://github.com/emilkowalski/skills@e8a175de22ae1e49370fc144c1f3bb9aeedf988d`, under the MIT licence in `LICENSE`, and from `skill/reference/harden.md` in `https://github.com/pbakaus/impeccable@e103efe779e2dd01274dabae83531fef00bf2563`, under the Apache 2.0 licence in `LICENSE-impeccable`.
