import { Effect, Option, Schema, type FileSystem } from "effect";
import type { ChildProcessSpawner } from "effect/process";
import { databaseIn, openIndex, readRows, sessionNamed, stateDir } from "./context-index";
import { type Part, type Session, type Usage } from "./context-reader";
import { charsOf, HOLDING, RULE_BODY, RULE_CARRIAGE, RULE_PREFIX, RULE_PREVIEW, unlabelled } from "./context-records";
import { FetchFailed, type FileFailure } from "../platform/failures";
import { attempt, unlessAbsent } from "../platform/files";
import { main } from "../platform/platform";
import { loadSelection } from "../bodies/selection";
import { loadBodies, prose } from "../bodies/bodies";
import { pullsOf, readLog, type Pull } from "../report/dispatch-report";

const instant = (at: string): number => Date.parse(at);
const Sessions = Schema.Array(Schema.Struct({ path: Schema.String, tool: Schema.Literals(["pi", "claude-code", "codex"]), version: Schema.String, model: Schema.String, repo: Schema.String, at: Schema.String, first_message: Schema.Number }));
const Requests = Schema.Array(Schema.Struct({ path: Schema.String, at: Schema.String, input: Schema.Number, cache_read: Schema.Number, cache_write: Schema.Number, output: Schema.Number }));
const Parts = Schema.Array(Schema.Struct({ path: Schema.String, name: Schema.String, kind: Schema.String, chars: Schema.Number }));

export type IndexedSession = Session & { readonly profile: string };
type Profiles = readonly { readonly name: string; readonly models: readonly string[] }[];

export const readIndex = Effect.fnUntraced(function* (db: string): Effect.fn.Return<Session[], FetchFailed | FileFailure, FileSystem.FileSystem | ChildProcessSpawner.ChildProcessSpawner> {
  yield* openIndex(db);
  const sessions = yield* readRows(db, "SELECT path,tool,version,model,repo,at,first_message FROM sessions WHERE path IN (SELECT path FROM requests) ORDER BY at DESC;", Sessions);
  const requests = yield* readRows(db, "SELECT path,at,input,cache_read,cache_write,output FROM requests ORDER BY path,ordinal;", Requests);
  const parts = yield* readRows(db, "SELECT path,name,kind,chars FROM parts ORDER BY path,name;", Parts);
  const byRequest = new Map<string, Usage[]>();
  for (const row of requests) {
    const found = byRequest.get(row.path) ?? [];
    found.push({ at: row.at, input: row.input, cacheRead: row.cache_read, cacheWrite: row.cache_write, output: row.output });
    byRequest.set(row.path, found);
  }
  const byPart = new Map<string, Part[]>();
  for (const row of parts) {
    const found = byPart.get(row.path) ?? [];
    found.push({ name: row.name, kind: row.kind, chars: row.chars });
    byPart.set(row.path, found);
  }
  return sessions.toSorted((left, right) => instant(right.at) - instant(left.at)).map((session) => ({ tool: session.tool, path: session.path, version: session.version, model: session.model, repo: session.repo, at: session.at, firstMessage: session.first_message, requests: byRequest.get(session.path) ?? [], parts: byPart.get(session.path) ?? [] }));
});

export function measure(sessions: readonly Session[], bodies: ReadonlyMap<string, string>, profiles: Profiles): IndexedSession[] {
  const sized = (part: Part): Part[] => {
    if (part.kind !== RULE_BODY) return [part];
    const content = bodies.get(part.name.slice(RULE_PREFIX.length));
    return content === undefined ? [] : [{ ...part, chars: charsOf(content) }];
  };
  return sessions.map((session) => ({
    ...session,
    profile: profiles.find((profile) => profile.models.includes(session.model))?.name ?? "default",
    parts: session.parts.flatMap(sized),
  }));
}

const inputOf = (usage: Usage): number => usage.input + usage.cacheRead + usage.cacheWrite;
export function summarize(session: IndexedSession): { opening: number | null; firstMessageChars: number; growth: number | null; requests: number; output: number } {
  const first = session.requests[0];
  const last = session.requests.at(-1);
  return {
    opening: first ? inputOf(first) : null,
    firstMessageChars: session.firstMessage,
    growth: first && last ? inputOf(last) - inputOf(first) : null,
    requests: session.requests.length,
    output: session.requests.reduce((sum, request) => sum + request.output, 0),
  };
}

const BRIDGE_WINDOW_MS = 30_000;
const usageIn = (repo: string, usage: Usage): string => `${repo}\n${usage.input} ${usage.cacheRead} ${usage.cacheWrite} ${usage.output}`;
export type Bridges = ReadonlyMap<IndexedSession, IndexedSession>;
export function bridgesOf(sessions: readonly IndexedSession[]): Bridges {
  const carried = new Map<string, { candidate: IndexedSession; at: string }[]>();
  for (const candidate of sessions) {
    if (candidate.tool !== "pi" || !candidate.model.startsWith("claude-bridge/")) continue;
    for (const request of candidate.requests) {
      const key = usageIn(candidate.repo, request);
      const found = carried.get(key) ?? [];
      found.push({ candidate, at: request.at });
      carried.set(key, found);
    }
  }
  const bridgeOf = (session: IndexedSession): IndexedSession | undefined => {
    const first = session.requests[0];
    if (session.tool !== "claude-code" || !first) return undefined;
    const gap = (at: string): number => Math.abs(Date.parse(at) - Date.parse(first.at));
    const carriers = (carried.get(usageIn(session.repo, first)) ?? []).filter(({ at }) => gap(at) <= BRIDGE_WINDOW_MS).map(({ candidate, at }) => ({ candidate, gap: gap(at) }));
    const held = (candidate: IndexedSession): number => session.requests.filter((request) => carried.get(usageIn(session.repo, request))?.some((found) => found.candidate === candidate)).length;
    return carriers.toSorted((left, right) => held(right.candidate) - held(left.candidate) || left.gap - right.gap)[0]?.candidate;
  };
  return new Map(sessions.flatMap((session) => {
    const bridge = bridgeOf(session);
    return bridge ? [[session, bridge] as const] : [];
  }));
}

export function sharesOf(chars: readonly number[], selected: readonly boolean[]): string[] {
  const total = chars.reduce((sum, count, index) => (selected[index] ? sum + count : sum), 0);
  return chars.map((count, index) => {
    if (!selected[index]) return "off";
    return `${total === 0 ? "0.0" : (100 * count / total).toFixed(1)}%`;
  });
}

export function groupState(checked: readonly boolean[]): "all" | "some" | "none" {
  if (checked.every(Boolean)) return "all";
  return checked.some(Boolean) ? "some" : "none";
}

export function sessionChoices(rows: readonly { tool: string; profile: string }[], tool: string, profile: string): string[] {
  return rows.flatMap((row, index) => (row.tool === tool && row.profile === profile ? [String(index)] : []));
}

export function keptChoice(values: readonly string[], current: string): string | undefined {
  return values.includes(current) ? current : values[0];
}

const cell = (text: string): string => text.replaceAll("|", "\\|").replaceAll("\n", " ");
const inputLabel = (session: IndexedSession, bridge: IndexedSession | undefined): string => `${session.tool} ${session.version} ${session.model} ${session.repo} ${session.profile}${bridge ? `, bridged from pi ${bridge.at}` : ""}`;
const hiddenPart = (session: IndexedSession): string => {
  switch (session.tool) {
    case "pi": return "Provider framing and any unstored opening content";
    case "claude-code": return session.parts.some((part) => part.name === "attachment:prompt_snapshot") ? "Provider framing and the built-in tool definitions" : "Provider framing, the system prompt and the built-in tool definitions";
    case "codex": return "Built-in tool definitions and other unstored opening content";
  }
};

const isRule = (part: Part): boolean => part.kind === RULE_BODY || part.kind === RULE_CARRIAGE;
const ruleShareOf = (part: Part, rules: number): string => {
  if (part.kind === RULE_PREVIEW) return "preview, not Rules";
  if (!isRule(part)) return "";
  return `${rules === 0 ? "0.0" : (100 * part.chars / rules).toFixed(1)}%`;
};
const basisOf = (part: Part): string => {
  if (part.kind === RULE_BODY) return "current tree, not historical session text";
  if (part.kind === RULE_CARRIAGE) return "Rules as the session stored them";
  if (part.kind === RULE_PREVIEW) return "preview stored and shown in place of the Rules, whose text past it never reached the model";
  return "character share";
};

const shownName = ({ name }: Part): string => {
  const at = name.indexOf(HOLDING);
  return at === -1 ? name : name.slice(0, at);
};
const identityOf = (part: Part): string => `${part.kind}\n${unlabelled(shownName(part), part.kind)}`;
const sizesByIdentity = (parts: readonly Part[]): Map<string, { name: string; chars: number }> => {
  const sizes = new Map<string, { name: string; chars: number }>();
  for (const part of parts) sizes.set(identityOf(part), { name: shownName(part), chars: (sizes.get(identityOf(part))?.chars ?? 0) + part.chars });
  return sizes;
};

export function changesSince(current: IndexedSession, earlier: IndexedSession): ReadonlyArray<{ name: string; chars: number }> {
  const before = sizesByIdentity(earlier.parts);
  const after = sizesByIdentity(current.parts);
  return [...new Set([...before.keys(), ...after.keys()])].flatMap((identity) => {
    const now = after.get(identity);
    const then = before.get(identity);
    const chars = (now?.chars ?? 0) - (then?.chars ?? 0);
    const name = now?.name ?? then?.name;
    return chars === 0 || name === undefined ? [] : [{ name, chars }];
  });
}

export type PullRate = { body: string; pulls: number; sessions: number; share: string };

export function pullRates(
  sessions: readonly IndexedSession[],
  bridges: Bridges,
  pulls: readonly Pull[],
  key: (session: IndexedSession) => string,
): Array<{ group: string; sessions: number; rates: PullRate[] }> {
  const carried = (owner: IndexedSession): IndexedSession[] => [owner, ...[...bridges].flatMap(([transport, bridge]) => (bridge === owner ? [transport] : []))];
  const members = new Map<string, IndexedSession[]>();
  for (const session of sessions.filter((one) => !bridges.has(one))) {
    const found = members.get(key(session)) ?? [];
    found.push(session);
    members.set(key(session), found);
  }
  return [...members]
    .map(([group, grouped]) => {
      const counts = new Map<string, { pulls: number; sessions: number }>();
      for (const session of grouped) {
        const bodies = new Map<string, number>();
        const named = carried(session);
        for (const pull of pulls) if (named.some((one) => sessionNamed(one.path, pull.session))) bodies.set(pull.body, (bodies.get(pull.body) ?? 0) + 1);
        for (const [body, count] of bodies) {
          const held = counts.get(body) ?? { pulls: 0, sessions: 0 };
          held.pulls += count;
          held.sessions += 1;
          counts.set(body, held);
        }
      }
      const rates = [...counts]
        .map(([body, count]): PullRate => {
          const [share = "0.0%"] = sharesOf([count.sessions, grouped.length - count.sessions], [true, true]);
          return { body, pulls: count.pulls, sessions: count.sessions, share };
        })
        .toSorted((left, right) => right.pulls - left.pulls || left.body.localeCompare(right.body));
      return { group, sessions: grouped.length, rates };
    })
    .filter(({ rates }) => rates.length > 0)
    .toSorted((left, right) => left.group.localeCompare(right.group));
}

function pullLines(sessions: readonly IndexedSession[], bridges: Bridges, pulls: readonly Pull[]): string[] {
  const byProfile = pullRates(sessions, bridges, pulls, (session) => session.profile);
  const byModel = pullRates(sessions, bridges, pulls, (session) => session.model);
  if (byProfile.length === 0) return ["No indexed session has a pull of a Body's SKILL.md in the dispatch log.", ""];
  return [
    "A pull is a read of a Body's SKILL.md, counted from the dispatch log. Reads of files under a Body do not count. A Claude Code session bridged from pi counts as part of that pi session. Profiles and models whose sessions pulled nothing are not listed.",
    "",
    "Hub pulls by Profile:",
    "",
    "| Profile | Body | Pulls | Sessions pulling it | Share of the Profile's sessions |",
    "| --- | --- | ---: | ---: | ---: |",
    ...byProfile.flatMap(({ group, rates }) =>
      rates.map((rate) => `| ${cell(group)} | ${cell(rate.body)} | ${rate.pulls} | ${rate.sessions} | ${rate.share} |`)),
    "",
    "Hub pulls by model:",
    "",
    "| Model | Body | Pulls | Sessions pulling it | Share of the model's sessions |",
    "| --- | --- | ---: | ---: | ---: |",
    ...byModel.flatMap(({ group, rates }) =>
      rates.map((rate) => `| ${cell(group)} | ${cell(rate.body)} | ${rate.pulls} | ${rate.sessions} | ${rate.share} |`)),
    "",
  ];
}

export function renderReport(sessions: readonly IndexedSession[], bridges: Bridges, pulls: readonly Pull[]): string {
  if (sessions.length === 0) return "# Stored context by session\n\nNo sessions indexed. Run `bun run context-index` before `bun run context-report`.\n";
  const lines = ["# Stored context by session", "", "Provider input is uncached input plus cache reads and writes. Codex cached input is a subset of its reported input, not an additional charge.", "The first message is listed separately in characters. The tools do not give its independent token count.", "Visible part percentages are shares of captured characters, not percentages of provider tokens. A missing system prompt or tool definition has no inferred token size.", ""];
  for (const session of sessions) {
    const summary = summarize(session);
    const bridge = bridges.get(session);
    lines.push("| Date | Tool, version, model, repo, Profile | Opening input tokens | First message chars | Requests | Input growth |", "| --- | --- | ---: | ---: | ---: | ---: |", `| ${cell(session.at)} | ${cell(inputLabel(session, bridge))} | ${summary.opening === null ? "unknown" : `${summary.opening} exact provider`} | ${summary.firstMessageChars} | ${summary.requests} | ${summary.growth === null ? "unknown" : `${summary.growth} exact provider`} |`);
    lines.push("", "| Request time | Uncached input | Cache read | Cache write | Output | Total input |", "| --- | ---: | ---: | ---: | ---: | ---: |", ...session.requests.map((request) => `| ${cell(request.at)} | ${request.input} | ${request.cacheRead} | ${request.cacheWrite} | ${request.output} | ${inputOf(request)} |`), "");
    const shares = sharesOf(session.parts.map((part) => part.chars), session.parts.map(() => true));
    const rules = session.parts.filter(isRule).reduce((sum, part) => sum + part.chars, 0);
    lines.push("", `Captured parts for ${cell(session.tool)} ${cell(session.at)}:`, "", "| Part | Characters | Share of captured characters | Share of Rules by characters | Basis |", "| --- | ---: | ---: | ---: | --- |", ...session.parts.map((part, index) => `| ${cell(part.name)} | ${part.chars} | ${shares[index]} | ${ruleShareOf(part, rules)} | ${basisOf(part)} |`), `| ${hiddenPart(session)} | unknown | unknown | unknown | not stored by the tool |`, "");
    if (bridge) {
      lines.push(`This Claude Code session carried the provider requests of the pi session at ${cell(bridge.path)} on claude-bridge, so it is left out of Claude Code's comparisons.`, "");
      continue;
    }
    const earlier = sessions.find((candidate) => candidate !== session && !bridges.has(candidate) && candidate.tool === session.tool && candidate.model === session.model && candidate.repo === session.repo && candidate.profile === session.profile && instant(candidate.at) < instant(session.at) && summarize(candidate).opening !== null);
    const prior = earlier ? summarize(earlier).opening : null;
    if (earlier && summary.opening !== null && prior !== null) {
      const changes = changesSince(session, earlier);
      lines.push(`Change since ${cell(earlier.at)}: provider opening ${summary.opening - prior} exact tokens; captured parts ${changes.map(({ name, chars }) => `${cell(name)} ${chars >= 0 ? "+" : ""}${chars} characters`).join(", ") || "unchanged"}. This difference is not attributed to any one part.`, "");
    }
  }
  lines.push(...pullLines(sessions, bridges, pulls));
  return `${lines.join("\n")}\n`;
}

export function renderExplorer(sessions: readonly IndexedSession[], bridges: Bridges): string {
  const exported = JSON.stringify(sessions.map((session) => ({
    tool: session.tool, version: session.version, model: session.model, repo: session.repo, profile: session.profile, at: session.at,
    opening: summarize(session).opening, firstMessageChars: session.firstMessage, bridgedFrom: bridges.get(session)?.at ?? null, hidden: hiddenPart(session),
    parts: session.parts.map(({ name, kind, chars }) => ({ name, kind, chars })),
  }))).replaceAll("<", "\\u003c");
  return `<!doctype html><html lang="en"><meta charset="utf-8"><title>Stored context explorer</title>
<style>body{font:16px system-ui;margin:2rem auto;max-width:74rem;line-height:1.5;padding:0 1rem;color:#20232a;background:#fff}fieldset{border:1px solid #aaa;min-width:0}select{max-width:100%}label{display:block;margin:.5rem 0}.group{display:grid;grid-template-columns:auto minmax(0,1fr) auto auto;column-gap:.75rem}.part{display:grid;grid-column:1/-1;grid-template-columns:subgrid;align-items:baseline;margin:.25rem 0}.part>span:first-of-type{overflow-wrap:anywhere}.number{white-space:nowrap;text-align:right;font-variant-numeric:tabular-nums}main{display:grid;grid-template-columns:minmax(0,3fr) minmax(18rem,2fr);gap:2rem}output{font-weight:bold}p{max-width:65ch;overflow-wrap:anywhere}@media(max-width:45rem){main{display:block}.group{grid-template-columns:auto auto minmax(0,1fr)}.part>span:first-of-type{grid-column:2/-1}.part>.number{grid-row:2;grid-column:2;text-align:left}.part>.number+.number{grid-column:3}}</style>
<h1>Stored context explorer</h1><p>This export contains no message text. Exact provider input applies to the recorded opening only. Turning off a part does not measure a new provider token total.</p>
<label>Harness <select id="tool"></select></label><label>Profile <select id="profile"></select></label><label>Session <select id="session"></select></label>
<main><fieldset><legend>Captured parts</legend><div id="parts"></div><p id="hidden"></p></fieldset><section aria-live="polite"><h2>Opening</h2><p id="basis"></p><p>Selected captured text: <output id="chars"></output> characters. After a toggle the token total stays unknown, because the tools store no token count for a single part.</p><p>Provider input: <output id="tokens"></output></p><p>Text is not saved in the index. Parts with no stored text have no independent token measurement.</p></section></main>
<script>const data=${exported};const sharesOf=${sharesOf.toString()};const groupState=${groupState.toString()};const sessionChoices=${sessionChoices.toString()};const keptChoice=${keptChoice.toString()};const tool=document.querySelector('#tool'),profile=document.querySelector('#profile'),session=document.querySelector('#session'),parts=document.querySelector('#parts');
const unique=(values)=>[...new Set(values)];const option=(value,label)=>{const o=document.createElement('option');o.value=value;o.textContent=label;return o};
function choices(select,values,labels=values){const current=keptChoice(values,select.value);select.replaceChildren(...values.map((value,i)=>option(value,labels[i])));if(current!==undefined)select.value=current}
function draw(){const found=sessionChoices(data,tool.value,profile.value);choices(session,found,found.map(i=>data[Number(i)]).map(row=>row.at+' '+row.model+(row.bridgedFrom===null?'':' (bridged from pi '+row.bridgedFrom+')')));const row=data[Number(session.value)];if(!row)return;parts.replaceChildren(...unique(row.parts.map(part=>part.kind)).map(kind=>{const group=document.createElement('div'),head=document.createElement('label'),all=document.createElement('input'),title=document.createElement('span');group.className='group';head.className='part';all.type='checkbox';all.checked=true;all.dataset.kind=kind;title.textContent='All '+kind+' parts';head.append(all,title);group.append(head,...row.parts.flatMap((part,i)=>{if(part.kind!==kind)return [];const label=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.checked=true;input.dataset.part=String(i);const name=document.createElement('span'),size=document.createElement('span'),share=document.createElement('span');label.className='part';name.textContent=part.name;size.className='number';size.textContent=part.chars+' characters';share.className='number';share.dataset.share=String(i);label.append(input,name,size,share);return [label]}));return group}));document.querySelector('#hidden').textContent=row.hidden+': unknown size, not stored by the tool';document.querySelector('#basis').textContent=row.tool+' '+row.version+' '+row.model+' '+row.repo+' '+row.at+(row.bridgedFrom===null?'':'. This session carried the provider requests of the pi session at '+row.bridgedFrom+' on claude-bridge, so the conversation is counted once, under pi.');update()}
function update(){const row=data[Number(session.value)];if(!row)return;const selected=[...parts.querySelectorAll('input[data-part]:checked')];const on=row.parts.map((part,i)=>selected.some(box=>box.dataset.part===String(i)));const shares=sharesOf(row.parts.map(part=>part.chars),on);for(const out of parts.querySelectorAll('span[data-share]')){const share=shares[Number(out.dataset.share)];out.textContent=share==='off'?'off':share+' of selected'}document.querySelector('#chars').textContent=String(selected.reduce((n,box)=>n+row.parts[Number(box.dataset.part)].chars,0));document.querySelector('#tokens').textContent=row.opening===null?'unknown (no provider request)':selected.length===row.parts.length?row.opening+' exact provider tokens':'unknown after toggles (requires a second provider measurement)'}
function profiles(){choices(profile,unique(data.filter(row=>row.tool===tool.value).map(row=>row.profile)));draw()}
choices(tool,unique(data.map(row=>row.tool)));tool.addEventListener('change',profiles);profile.addEventListener('change',draw);session.addEventListener('change',draw);parts.addEventListener('change',event=>{const target=event.target;if(target.dataset.kind){for(const box of parts.querySelectorAll('input[data-part]'))if(data[Number(session.value)].parts[Number(box.dataset.part)].kind===target.dataset.kind)box.checked=target.checked}else{const row=data[Number(session.value)],kind=row.parts[Number(target.dataset.part)].kind;const group=[...parts.querySelectorAll('input[data-kind]')].find(box=>box.dataset.kind===kind);const state=groupState([...parts.querySelectorAll('input[data-part]')].filter(box=>row.parts[Number(box.dataset.part)].kind===kind).map(box=>box.checked));group.checked=state==='all';group.indeterminate=state==='some'}update()});profiles();</script></html>`;
}

if (import.meta.main) {
  main(Effect.gen(function* () {
    const state = stateDir(process.env);
    const repo = new URL("../../", import.meta.url).pathname;
    const selection = yield* loadSelection(repo);
    const bodies = new Map<string, string>();
    for (const body of yield* loadBodies(repo)) if (body.kind === "rule") bodies.set(body.name, yield* prose(body));
    const sessions = measure(yield* readIndex(databaseIn(state)), bodies, selection.profiles);
    const bridges = bridgesOf(sessions);
    const logPath = `${state}/dispatch.log`;
    const logText = yield* attempt(logPath, (fs) => fs.readFileString(logPath)).pipe(unlessAbsent);
    const pulls = pullsOf(readLog(Option.getOrElse(logText, () => "")));
    const reportPath = `${state}/context-report.md`;
    const explorerPath = `${state}/context-report.html`;
    yield* attempt(reportPath, (fs) => fs.writeFileString(reportPath, renderReport(sessions, bridges, pulls)));
    yield* attempt(explorerPath, (fs) => fs.writeFileString(explorerPath, renderExplorer(sessions, bridges)));
    console.log(`wrote ${reportPath} and ${explorerPath} from the local index`);
  }));
}
