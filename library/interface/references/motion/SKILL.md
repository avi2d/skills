---
name: motion
description: "When interface motion earns its place and how it is built: the frequency and purpose gate, the cheapest tool, properties, easing, duration and springs as starting recipes, interruption and reduced motion. Pull before adding, changing or reviewing an animation or a transition."
kind: reference
source: https://github.com/emilkowalski/skills@e8a175de22ae1e49370fc144c1f3bb9aeedf988d
consults:
  - visitor-job
  - mobile-web
  - motion-vocabulary
---
# Motion

Motion is earned, so decide whether something moves before deciding how it moves.
Every value below is a starting recipe, and a product's own tokens and a measured result outrank it.
When a person describes an effect and wants its name, pull the `motion-vocabulary` reference instead.

## Decide whether it moves

Place the motion in a frequency tier first, because the more often a person sees it, the shorter and subtler it is.

| How often a person meets it | Motion |
| --- | --- |
| A hundred times a day or more, such as a shortcut or a command palette toggle | None, so the action resolves at once |
| Tens of times a day, such as hover or list navigation | Fast and near imperceptible, or none |
| Occasionally, such as a modal, a drawer or a toast | Standard motion |
| Rarely or once, such as onboarding or a finished task | Room for delight |

A keyboard action takes the tier of how often it runs, like any other action.
Visible focus and an instant state change are feedback rather than motion, and they stay.

Then name the purpose in one word from this list, or the motion is not built:

- **Feedback** confirms the interface heard the person.
- **Spatial consistency** shows where something came from or went.
- **State indication** makes a state change legible.
- **Bridging** keeps content from teleporting.
- **Explanation** shows how a feature works, on marketing and onboarding surfaces.
- **Delight** belongs only to the rare tier.

Data a person reads or acts on stays still.
The `visitor-job` reference decides how much voice motion carries on a surface.
On a Persuade or Experience surface one rehearsed focal sequence beats a reveal on every section.
On an Operate or Read surface motion serves feedback, state and continuity, and nobody waits through load choreography.

When the gate rejects a request, say which question rejected it and give the answer without motion, such as an instant state change or a static affordance.
Keep each rejected candidate in the answer beside its reason, so the person sees what was weighed.

## Pick the cheapest tool

Walk down the table and stop at the first row that fits.

| Need | Tool |
| --- | --- |
| Hover, press, colour, or a state a class or attribute toggles | A CSS transition |
| An entrance on mount without script state | CSS `@starting-style` |
| Predetermined motion that stays smooth while the page is busy | A CSS animation |
| Script control without a library | The Web Animations API, `element.animate()` |
| Springs, layout motion, exits and gesture-driven values | The motion library the project already has |

Add no dependency for an effect the existing stack expresses.
Use a view transition or a shared element technique when continuity across two states is the point.
Use scroll-driven motion only when the scroll relationship itself carries meaning, with a fallback.

## Choose the properties

Choose a property for what the change communicates, with `transform` and `opacity` as the reliable base.

- Continuity uses shared element motion, FLIP transforms or a view transition.
- Focus and depth use a bounded blur, filter or shadow change.
- A reveal uses `clip-path` or a mask.
- State and feedback use the smallest change that makes cause and result unmistakable.
- An accordion may animate `height`, because no transform does that job.

Layout-driving properties such as `width`, `top`, `left` and margins move by FLIP or a transform instead.
An entrance starts at `scale(0.9)` to `scale(0.97)` with `opacity: 0`, because nothing real appears from `scale(0)`.
A popover, menu or tooltip grows from its trigger through `transform-origin`, and a modal stays centred.
A percentage in `translate()` is relative to the element's own size, so `translateY(100%)` moves it by its own height.
A child's transform is set on the child, because a CSS variable on the parent recalculates the style of every child.
`will-change` goes on only for a known animation, and blur, filter and shader work stay inside an isolated region.

A property name proves nothing about frame rate, since the compositor depends on the engine, the library version and the page load.
Measure the actual interaction on the target device, and record a trace when it stutters.

## Easing, duration and springs

| Situation | Easing |
| --- | --- |
| Entering or exiting | `ease-out` |
| Moving or morphing on screen | `ease-in-out` |
| Hover or colour | `ease` |
| Constant motion, such as a marquee or progress | `linear` |

`ease-in` delays the moment the person is watching, so it stays off interface responses.
The built-in curves are weak, and these are the starting points when the product has no curve of its own:

```css
--ease-out: cubic-bezier(0.23, 1, 0.32, 1);
--ease-in-out: cubic-bezier(0.77, 0, 0.175, 1);
--ease-drawer: cubic-bezier(0.32, 0.72, 0, 1);
--ease-arrival: cubic-bezier(0.16, 1, 0.3, 1);
```

Timing follows distance and consequence:

| Change | Duration |
| --- | --- |
| Press feedback | 100 to 160 ms |
| Tooltip or small popover | 125 to 200 ms |
| Dropdown or select | 150 to 250 ms |
| Routine state change | 150 to 300 ms |
| Modal, drawer, overlay or view transition | 200 to 500 ms |
| An authored focal entrance on a Persuade surface | 500 to 800 ms |

Routine interface motion stays near 300 ms, and a longer one names its reason.

A spring suits a drag with momentum, a gesture the person can reverse, and an element that should feel alive.
`{ type: "spring", duration: 0.5, bounce: 0.2 }` is the starting point, with bounce between 0.1 and 0.3 and kept for drag to dismiss and playful moments.

## Interruption and exit

- Anything a person can trigger twice in a second uses a transition or a spring, which retarget from the current value, where a keyframe animation restarts from zero.
- An interrupted animation continues from the value on screen, never from the target it was heading for.
- An exit leaves along the path the entrance took, and runs faster than the entrance.
- Where the person is deciding, the deliberate phase is slow and the response is fast, as a hold to confirm fills over 2 s linearly and snaps back in 200 ms.
- A stagger of 30 to 80 ms suits a list appearing as a list, caps its total delay, and never blocks interaction.
- Content stays visible in its default state, so a failed script never hides the page.
- A loop that is not essential stops when it is offscreen or hidden, and autoplay respects the person's preference.

## Reduced motion and hover

Every movement ships with a `prefers-reduced-motion` path in the same change.
Reduced motion means fewer and gentler animations: spatial movement goes, and opacity, colour and the state feedback that confirms an action stay.
A reduced-motion fade without a transform is correct.
A media query somewhere in the stylesheet proves nothing, so run the interaction under both preference states and watch it.

Hover motion sits inside `@media (hover: hover) and (pointer: fine)`, because a tap fires a hover that never ends.
The `mobile-web` reference holds the rest of the touch layer.

## Judge the feel

Code settles the ingredients, and only playback settles the feel.
When the feel is uncertain, play the interaction at 10 % speed in the browser's animation panel or at two to five times its duration, step it frame by frame, and run a gesture on a physical device.
Fresh eyes on a later pass catch what a long session misses.

## Sources

This Reference adapts and changes text from two pinned upstreams.

- Emil Kowalski's skills at `https://github.com/emilkowalski/skills@e8a175de22ae1e49370fc144c1f3bb9aeedf988d`, from `skills/animate`, `skills/find-animation-opportunities`, and `skills/review-animations`, under the MIT licence in `LICENSE`.
- Impeccable at `https://github.com/pbakaus/impeccable@e103efe779e2dd01274dabae83531fef00bf2563`, from `skill/reference/animate.md`, under the Apache 2.0 licence in `LICENSE-impeccable`.

The text here is rewritten, shortened and merged, and is not the upstream wording.
