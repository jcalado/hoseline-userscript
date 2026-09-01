# How it works (for maintenance)

The site is a MUI v5 / React app. The card **is** the site's own player popover, re-laid-out
with CSS - no DOM is moved or rebuilt, so React can re-render as often as it likes. Extra
chrome (ON AIR badge, timer, talkgroup name, cached "last heard" values, peak marker) is drawn
with **pseudo-elements fed by `data-` attributes and custom properties**, which React never
sees and therefore never clobbers.

The script contributes only what CSS cannot:

| the script adds                                                              | why                                                                   |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| clicks PLAYER once, re-clicks if `#topplayer-menu` ever unmounts              | the popover unmounts when closed; the card must stay mounted           |
| swallows real clicks on PLAYER (capture phase) → `html.hl-player-hidden`      | repurposes the button as Hide / Show                                   |
| `html[data-hl-qso="idle\|live"]`                                             | drives the whole pill ↔ card switch from one attribute                 |
| `html[data-hl-theme="light\|dark"]`, read from `body`'s MUI background        | follow the site's theme toggle (body's background is left untouched)   |
| `data-hl-elapsed`, `data-hl-tgname`, `data-hl-last`, `--hl-peak` on the Paper | timer, talkgroup name, values cached across the gap, peak-hold marker  |
| `--hl-card-h` via ResizeObserver (high-water mark)                            | page padding, so the last row of cards is never stuck under the card   |
| `Element.startViewTransition` around each `data-hl-qso` change                | morphs pill ↔ card; scoped, so the grid is never snapshotted           |
| `html.hl-morphing` for the duration of that transition                        | freezes the card's own CSS transitions while the snapshots own the frame |

**State detection.** The player renders three facts - DMR id, talkgroup, alias - plus a level
caption like `-18  peak -18`. All of them are blank between overs, which is the on-air signal.

**The meter's scale.** The caption is dBFS. The site drives its own bar to `81 + dB`%, which
tops out at 81% and leaves the last fifth of the meter permanently dark; we rescale to
`(81 + dB) / 81 × 100`, so −81 dB is the left edge and 0 dB is hard against the right one.
The floor is written twice and the two must agree: `FLOOR_DB` in the script,
`--hl-meter-floor` in the stylesheet. `--hl-meter-ref` (−20 dB) places the reference mark;
the colour ramp's stops are annotated with the dB they fall on.

Things that will bite you if you edit:

- Do **not** put `backdrop-filter`, `transform` or `filter` on `header` - the popover is a
  child of the header, and any of those would make the header its containing block, so
  `position: fixed` would anchor to the header instead of the viewport.
- `display: contents` on the player's `[buttons + level readout]` wrapper is what lets the
  transport and the dB readout be placed independently in the card's grid. Removing it
  collapses the layout.
- The live card's `column-gap` is `0` and the second/third columns pay for their own
  `padding-left`. That is what lets the hairline above the control zone - a `border-top`
  on the two items sharing that row - run unbroken across the whole card. Put a real
  column gap back and the rule breaks into segments.
- The "ON AIR" badge is the **grid container's** `::before`, so it is a grid item and the
  card keeps one uniform `--hl-pad-x/y` on every side. Only the pulsing dot and the timer
  are drawn absolutely on the Paper, anchored to those same two custom properties - move
  the padding and they follow.
- `#topplayer-menu` is a fixed-size, `pointer-events: none` gutter, **not** a box that
  shrink-wraps the card. That is load-bearing for the morph: a scoped view transition is
  laid out in its scope's coordinate space, so a scope that resizes along with the card
  would displace the old snapshot. It is also what keeps the page clickable around the card.
- The transport and the chips are view transition *shared elements*, which only works while
  their boxes are identical in both states. That is why the hairline is its own grid row
  (the container's `::after`) instead of a `border-top` on the items beside it, and why the
  chips are offset with `margin-left` rather than `padding-left`. Put padding or a border
  back on either of them and they will scale during the morph instead of gliding.
- `:root.hl-morphing` kills every transition inside the card, and the script sets that class
  **before** calling `startViewTransition`. Without it the new state is photographed one
  layout after the class lands - while the picker's `width` transition is still easing - so
  the snapshot shows a half-open picker and the card snaps when the morph ends.
- `--hl-pad-x` / `--hl-pad-y` are registered with `@property`, so the padding interpolates
  for browsers with no view transitions at all. An unregistered custom property is a token
  stream and flips discretely. `--hl-level` and `--hl-peak` are registered for the same
  reason: that is what turns the script's discrete samples into a moving needle.
- The script paints the meter's fill (`--hl-level` clipping a gradient), and MUI's own
  `.MuiLinearProgress-bar` is hidden whenever `data-hl-qso` is present. Two reasons it is
  not left to MUI: MUI eases the determinate bar over 400 ms linear, which reads as lag on
  a level meter, and a fill that carries its own gradient is coloured relative to itself, so
  the leading edge is the same colour at every level. Without the userscript the attribute
  is absent, MUI's bar comes back, and it inherits the segmentation.
- The LED mask is one tile sized `100% / var(--hl-meter-leds)`, **not** a repeating gradient
  at a fixed pitch. A fixed pitch leaves a clipped sliver of an LED at any width that does
  not divide evenly, and the meter is a different width on the phone layout.
- Do not tint the unlit part of the meter "so the hot zone is visible". It was tried; at a
  glance a tinted unlit segment reads as a lit one, which is the one thing a level meter
  must never get wrong. The −20 dB marks and the ramp carry the zone instead.
- Active grid cards are detected with `[style*="221, 75, 57"]` (the site's inline red border).
  If the site changes its accent colour, update that literal.
- `src/hoseline.css` is the single source; `node src/build.js` regenerates both installables.

