---
name: generate-assets
description: "Generate an image asset, such as character art, a logo with its favicon sizes or a set of status marks, with an OpenAI image model through the Codex CLI, and hand the file back to the design work. Use when a design or prototype task needs a raster image made."
kind: skill
source: local
harnesses: [pi, claude-code, codex]
---
# Generate assets

An **asset** is an image file this skill makes and hands back to the worker that asked for it.
That worker keeps the design and the code: it decides where the asset goes, places it in the project and builds around it.
This skill only turns a brief into checked files.

## 1. Check the weekly allowance

Image generation spends the OpenAI weekly allowance of the ChatGPT plan that Codex signs in with.
The stop threshold is **20** percent of the week remaining.

1. If `SUBQUO_CODEX_ID` is set on winwsl, use that subquo enrollment ID for the Codex account generating the image.
   Otherwise, use the sole account with provider `codex` in `subquo read --json`.
   If there are zero or multiple Codex accounts, stop and ask the person to set `SUBQUO_CODEX_ID`.
1. Read the remaining week on winwsl:

   ```sh
   snapshot=$(subquo read --json) &&
   printf '%s\n' "$snapshot" | jq -e --arg id "${SUBQUO_CODEX_ID:-}" '
     def timestamp: try (capture("^(?<base>[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2})(\\.(?<fraction>[0-9]+))?Z$") | (.base + "Z" | fromdateiso8601) + ("0." + (.fraction // "0") | tonumber)) catch null;
     now as $now |
     select(.version == "subquo.v1") |
     [.accounts[]? | select(.provider == "codex" and ($id == "" or .id == $id))] as $accounts |
     if ($accounts | length) != 1 then
       error("Set SUBQUO_CODEX_ID to one Codex enrollment ID; without it, exactly one Codex account must be enrolled")
     else . end |
     $accounts[0].observation as $observation |
     ($observation.observedAt | timestamp) as $observed |
     ($observation.validUntil | timestamp) as $until |
     select($observation.status == "fresh" and $observed != null and $until != null and $observed <= $now and $now < $until) |
     [$observation.windows[]? | select(.id == "weekly" and .scope == "all")] as $windows |
     select(($windows | length) == 1 and ($windows[0].percentLeft | type) == "number" and $windows[0].percentLeft >= 0 and $windows[0].percentLeft <= 100) |
     $windows[0].percentLeft
   '
   ```

1. Go on when it prints a number at or above the threshold.
1. Stop and tell the person the number when it is below the threshold.
1. Stop and ask the person when the command exits nonzero or prints no number, because then no reliable reading exists.

**Done when** a fresh reading at or above the threshold is in hand, or you have stopped and said why.

## 2. Write the prompt

Write one prompt per asset, in your own words, from these rules:

- Make original art only. Describe shapes, colours, materials and mood directly, and name no existing game, film, character, emblem, artwork, colour scheme or lettering.
- Put a flat, clean, single-colour background behind anything text will sit on, and name the colour as a hex value.
- Name the file to save in the current directory, and the format and size from the table.

| Asset | Ask Codex for | Then derive |
| --- | --- | --- |
| Character image | a 1536x1024 PNG, or 1024x1536 for a portrait, with the whole figure inside the frame | nothing |
| Logo | a square PNG at least 1024 pixels on each side with the mark centred and a clear margin on every side | the favicon sizes in step 4 |
| Set of status marks | one 1536x1024 PNG sheet with every mark in one row of equal cells, in one stroke weight and one palette | one PNG per mark in step 4 |

**Done when** each asset has a prompt that names its subject, its background colour, its file name, its format and its size.

## 3. Run Codex

Codex runs on winwsl, where it is signed in with the ChatGPT plan.
From another machine, run each shell below over `ssh winwsl`, and copy the files back with `scp`.

1. On winwsl, make a scratch folder outside every repository and print its path: `scratch=$(mktemp -d /tmp/assets-XXXXXX) && echo "$scratch"`, because the `workspace-write` sandbox lets Codex write only there.
1. Run Codex in that printed folder, writing the printed path in place of `<scratch>` in each command below, with the first model in the order below:

   ```sh
   cd "<scratch>" && codex exec --skip-git-repo-check -s workspace-write -m gpt-6-astra "<prompt>"
   ```

1. Run it again with the next model when a run exits nonzero or saves no file.
   The order is `gpt-6-astra`, then `gpt-6.1-sol`.
1. Check the allowance again, as step 1 says, before each further run.

A run takes about 30 seconds.
Codex saves the file in the scratch folder and keeps its own copy under `~/.codex/generated_images/`.

**Done when** every asset's file is in the scratch folder, or both models have failed on it and you have stopped and said so.

## 4. Derive and check

Derive the favicon sizes from a logo with Pillow, in the scratch folder:

```sh
cd "<scratch>" && python3 -I -c '
import sys
from PIL import Image
src = Image.open(sys.argv[1]).convert("RGBA")
src.save("favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])
for name, edge in (("apple-touch-icon.png", 180), ("icon-192.png", 192), ("icon-512.png", 512)):
    src.resize((edge, edge), Image.LANCZOS).save(name)
' logo.png
```

Cut a sheet of status marks into one square PNG per mark, naming the marks from left to right, in the scratch folder:

```sh
cd "<scratch>" && python3 -I -c '
import sys
from PIL import Image
sheet = Image.open(sys.argv[1])
names = sys.argv[2:]
cell = sheet.width // len(names)
edge = min(cell, sheet.height)
top = (sheet.height - edge) // 2
for i, name in enumerate(names):
    left = i * cell + (cell - edge) // 2
    sheet.crop((left, top, left + edge, top + edge)).save(name + ".png")
' sheet.png done running waiting failed paused
```

Then check every file:

1. In the scratch folder, read its format and pixel size with `cd "<scratch>" && file <name>`, and compare them with the table, accepting any square logo source at least 1024 pixels on each side.
1. Open it and look at it: the subject is original, the background is flat where text will sit, and each cut mark sits whole inside its square.
1. Run a failed file through steps 2 and 3 again with a corrected prompt.

**Done when** every derived file has the format and size the table names and has passed the look, and the logo source is square and at least 1024 pixels on each side.

## 5. Hand back

Give the calling worker, for each asset, the absolute path of the file, its format and pixel size, the model that made it and the prompt.
The calling worker copies the files it chooses into its project and does the design and the code.

**Done when** the calling worker has the path of every asset it asked for.
