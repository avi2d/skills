---
name: mobile-web
description: "The platform layer of a web page on a phone: hover that sticks after a tap, viewport height units, inputs that zoom the page, press feedback, overscroll, safe areas, text selection, touch-action and theme colour, each with the cause it fixes and the evidence a claim needs. Pull when building or reviewing a web page, a sheet or a touch interaction for phones."
kind: reference
source: https://github.com/emilkowalski/skills@e8a175de22ae1e49370fc144c1f3bb9aeedf988d
---
# Mobile web

Most of what feels wrong on a phone is the platform layer rather than the design: a hover that sticks, a viewport unit, an input that zooms the page.
Each fix below names its cause, and a fix goes only where its cause applies.
A website is a document first, so pull to refresh stays useful there and its content stays selectable.
An app shell, a sheet and a custom gesture surface are where most of these fixes belong.

## Hold these everywhere

- Zoom stays on, so a viewport never carries `user-scalable=no` or a `maximum-scale` that blocks zoom, and an input that zooms the page gets a 16 px font instead.
- Capability decides, through `(hover: hover)`, `(pointer: fine)`, `env()` and the viewport units, and never a user agent string or a screen width guess.
- Touch and a mouse arrive on the same device, such as a tablet with a trackpad, so a page serves both at once.
- An action fires on `click`, and press feedback comes from `:active`, because moving the action to `pointerdown` breaks a scroll that starts on the control.

## Symptoms and fixes

| What the person sees | Cause | Fix |
| --- | --- | --- |
| A hover state stays after a tap | Touch fakes a hover and keeps it | Put every hover rule inside `@media (hover: hover) and (pointer: fine)` |
| A grey or blue flash on tap | The browser paints a tap highlight | `-webkit-tap-highlight-color: transparent` on the root, with an `:active` state on every tappable element |
| A full height block overflows behind the address bar | `100vh` is the tallest viewport | `100dvh` for an app shell or a drawer, `100svh` for a hero that stays still while scrolling |
| The page zooms into a focused input and stays zoomed | iOS Safari zooms on an input font under 16 px | `font-size: 16px` on inputs, or only under `(pointer: coarse)` |
| A tap feels late | Feedback waits for release, or a double tap delay | `:active` feedback within 100 to 160 ms, and `touch-action: manipulation` on controls |
| An inner scroll drags the page behind it | Scroll chains to the page at the end | `overscroll-behavior: contain` on the inner scroller |
| Fixed controls sit under the notch or the home indicator | The page is letterboxed into the safe area | `viewport-fit=cover` in the viewport meta, then on every fixed header, bar, toast and sheet, padding from the inset of each edge it touches: `env(safe-area-inset-top, 0px)` at the top, `env(safe-area-inset-bottom, 0px)` at the bottom, and `env(safe-area-inset-left, 0px)` and `env(safe-area-inset-right, 0px)` at the sides in landscape |
| A long press selects a button's label | Control text is selectable | `user-select: none` and `-webkit-user-select: none` on controls only |
| A horizontal carousel scrolls the page vertically | The browser cannot tell which axis the element owns | A native scroller keeps the browser's horizontal pan with `overflow-x: auto`, `scroll-snap-type: x mandatory` and no `touch-action` that drops `pan-x`, and only a carousel whose script drags it horizontally takes `touch-action: pan-y` |
| The status bar clashes with the page | One `theme-color` serves both schemes | One `theme-color` meta per `prefers-color-scheme`, matched to the top of the page |

`env()` values are `0px` until the viewport meta carries `viewport-fit=cover`.
`touch-action: none` belongs only on an element that owns every axis, such as a drag surface, or the person cannot scroll past it.
Stopping overscroll with a `touchmove` listener that calls `preventDefault()` blocks scrolling and costs frames, so `overscroll-behavior` does it instead.

Set the keyboard while in an input: `inputmode="numeric"` for codes, `inputmode="decimal"` for amounts, `type="email"` and `type="tel"` for their fields, `autocapitalize="none"` on usernames and codes, and `enterkeyhint` naming what the return key does.

## Where a fix stays out

- `user-select: none` stays off body text, because people copy addresses, contact details and error messages.
- `overscroll-behavior: none` on the root suits an app with its own scrollers, and stays off a document where pull to refresh is welcome.
- `100dvh` stays off a marketing hero, because it resizes as the address bar collapses and shifts the layout mid-scroll.
- A global baseline goes in only after each line's cause is checked against the page.

## Evidence for a claim

A desktop browser's device mode checks layout at a width and nothing about the hardware.
Sticky hover, the tap highlight, the address bar's effect on height, input zoom, the tap delay, rubber-banding, safe areas and the software keyboard each need a physical phone.
To test on one, serve the dev server on `0.0.0.0`, open it by the machine's LAN address, and inspect it through Safari's Web Inspector or Chrome's `chrome://inspect`.
Test with the keyboard open and once in landscape, when the page has inputs or fixed controls.
Report each fix with the evidence behind it: read from code, an emulated viewport, synthesized touch, or a physical device and its model.

## Sources

This Reference adapts and changes text from `skills/mobile-native/SKILL.md` in Emil Kowalski's skills at `https://github.com/emilkowalski/skills@e8a175de22ae1e49370fc144c1f3bb9aeedf988d`, under the MIT licence in `LICENSE`.
