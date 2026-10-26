---
name: motion-vocabulary
description: "A reverse lookup from what a person sees or feels in an animation, such as springy, slides off or draws itself in, to the term to ask for, across entrances and exits, timing, easing, springs and principles. Pull when a person describes a motion effect and wants its name."
kind: reference
source: https://github.com/emilkowalski/skills@e8a175de22ae1e49370fc144c1f3bb9aeedf988d
---
# Names for motion

A person describes what they see or feel, such as springy, slides off or draws itself in, and this glossary turns that into the term to ask for.
Answer with the best match and its line, then the close alternates and how each differs.
When nothing fits exactly, name the closest term and say it is an approximation, or describe the effect in these terms, such as a stagger of scale-in entrances.

## Entrances and exits

| Term | What it is |
| --- | --- |
| Fade in, fade out | An element appears or disappears by changing opacity |
| Slide in | An element enters by sliding in from off screen |
| Scale in | An element grows from smaller to full size as it appears, often with a fade |
| Pop in | An element appears with a slight overshoot, as if it bounces into place |
| Reveal | Content is uncovered gradually, often by animating a clip path or a mask |
| Enter, exit | The animation an element plays when it is added to or removed from the screen |

## Sequencing and timing

| Term | What it is |
| --- | --- |
| Keyframes | Defined points in an animation that the browser fills the gaps between |
| Interpolation, tween | Generating every in-between frame from a start value to an end value |
| Stagger | Several items animate one after another with a small delay between each |
| Orchestration | Timing several animations so they read as one coordinated motion |
| Delay | Time before an animation starts |
| Duration | How long an animation takes |
| Fill mode | Whether an element keeps its first or last frame's styles outside the animation |
| Stepped animation | An animation divided into discrete steps, like a countdown |

## Movement and transforms

| Term | What it is |
| --- | --- |
| Translate | Moving an element along the X or Y axis |
| Scale | Making an element bigger or smaller |
| Rotate | Spinning an element around a point |
| Skew | Slanting an element along an axis, shearing it out of its rectangle |
| 3D tilt, flip | Rotating in 3D space with `rotateX` or `rotateY` to add depth |
| Perspective | How strong the 3D effect looks, where a lower value exaggerates depth |
| Transform origin | The anchor point a scale or a rotation grows or spins from |
| Origin-aware animation | An element grows out of its trigger, like a popover from the button that opened it, rather than from its own centre |

## Transitions between states

| Term | What it is |
| --- | --- |
| Crossfade | One element fades out as another fades in, in the same spot |
| Continuity transition | A change that keeps a person oriented by connecting before and after |
| Morph | One shape turns smoothly into another shape |
| Shared element transition | An element travels and transforms from one position into another, like a thumbnail expanding into a card |
| Layout animation | An element whose size or position changes animates to the new spot instead of snapping |
| Accordion, collapse | A section expands and collapses its height to show or hide content |
| Direction-aware transition | Content slides one way going forward and the other way going back |

## Scroll

| Term | What it is |
| --- | --- |
| Scroll reveal | Elements fade or slide into place as they enter the viewport |
| Scroll-driven animation | An animation whose progress is tied to scroll position |
| Parallax | Background and foreground move at different speeds while scrolling |
| Page transition | An animation that plays on navigating from one page or route to another |
| View transition | The browser morphs between two states or pages, connecting shared elements |

## Feedback and interaction

| Term | What it is |
| --- | --- |
| Hover effect | A visual change when the cursor moves over an element |
| Press feedback, tap feedback | A subtle scale down when an element is pressed, so it feels physical |
| Hold to confirm | A progress effect that fills while the person holds a button |
| Drag | Moving an element by grabbing it, often with momentum on release |
| Drag to reorder | Dragging list items to rearrange them while the others make room |
| Swipe to dismiss | Dragging an element off screen to close it, like a drawer or a toast |
| Rubber-banding | Resistance and snap back when a drag passes a boundary |
| Shake, wiggle | A quick side to side jitter signalling an error or a rejected input |
| Ripple | A circle expanding from the point of a tap |

## Easing

| Term | What it is |
| --- | --- |
| Easing | The rate at which an animation speeds up or slows down |
| Ease-out | Starts fast and ends slow, the default for a response to the person |
| Ease-in | Starts slow and ends fast, which feels sluggish on an interface |
| Ease-in-out | Slow, fast, slow, for an element already on screen moving from A to B |
| Linear | Constant speed, kept for spinners and marquees |
| Cubic-bezier | A custom easing curve defined for precise control |
| Asymmetric easing | A curve that accelerates and decelerates at different rates |

## Springs

| Term | What it is |
| --- | --- |
| Spring | Motion driven by physics such as tension, mass and damping rather than a set duration |
| Stiffness, tension | How strongly the spring pulls toward its target, where higher feels snappier |
| Damping | How quickly a spring settles, where lower means more oscillation |
| Mass | How heavy the element feels, where more mass is slower |
| Bounce | A spring that overshoots and settles |
| Perceptual duration | How long a spring feels before it is finished, while it keeps settling underneath |
| Momentum | Motion that carries velocity, especially after a drag or an interruption |
| Velocity | Speed and direction, which a spring carries into the next animation when interrupted |
| Interruptible animation | An animation redirected mid-flight instead of finishing first |

## Looping and ambient motion

| Term | What it is |
| --- | --- |
| Marquee | Content that scrolls continuously in a loop |
| Loop | An animation that repeats a set number of times or forever |
| Alternate, yoyo | A loop that plays forward then reverses on each pass |
| Orbit | An element circling another on a continuous path |
| Pulse | A gentle repeating scale or opacity change that draws attention |
| Float | A gentle continuous drift up and down |
| Idle animation | Subtle motion while an element waits to be used |

## Polish and effects

| Term | What it is |
| --- | --- |
| Blur | A blur filter that softens an element or masks a small imperfection |
| Clip-path | Clipping an element to a shape, for reveals, masks and comparison sliders |
| Mask | Hiding or revealing parts of an element with a shape or gradient, with soft edges |
| Before and after slider | A draggable divider that wipes between two overlaid images |
| Line drawing | An SVG path that draws itself in |
| Text morph | Text that animates character by character when it changes |
| Skeleton, shimmer | A placeholder with a moving sheen while content loads |
| Number ticker | Digits rolling or counting up to a value |
| Tabular numbers | Fixed-width digits, so a changing number does not shift |
| Typewriter | Text appearing one character at a time |

## Performance

| Term | What it is |
| --- | --- |
| Frame rate | Frames drawn per second, with 60 the baseline for smooth motion |
| Jank | Visible stutter when the browser drops frames |
| Dropped frame | A frame the browser missed its deadline to draw |
| Compositing | Letting the GPU move or fade an element on its own layer without new layout or paint |
| will-change | A CSS hint that an element is about to animate |
| Layout thrashing | Animating properties such as width or top that force a layout every frame |

## Principles

| Term | What it is |
| --- | --- |
| Purposeful animation | Motion that orients, gives feedback or shows a relationship rather than decorating |
| Anticipation | A small wind up in the opposite direction before a move |
| Follow-through | Parts of an element settle slightly after the main motion stops |
| Squash and stretch | Deforming an element as it moves to convey weight and speed |
| Perceived performance | The right animation makes an interface feel faster than it is |
| Frequency of use | The more often a person sees an animation, the shorter and subtler it is |
| Spatial consistency | An element keeps its identity and position across states |
| Reduced motion | Honouring `prefers-reduced-motion` by toning motion down |

Adapted and changed from `skills/animation-vocabulary/SKILL.md` in `https://github.com/emilkowalski/skills@e8a175de22ae1e49370fc144c1f3bb9aeedf988d`, under the MIT licence in `LICENSE`.
