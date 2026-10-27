---
name: Seasonal Emote Replacer
description: Stream Desk Deck. A gunmetal desk instrument where the emotes are the keys, the season is a knob, and one orange key commits.
colors:
  orange: "#ff5f1f"
  orange-wall: "#b33e0f"
  orange-ink: "#1d0d04"
  amber: "#ffb000"
  amber-dim: "#8a5f00"
  amber-glass: "#1a1207"
  gunmetal: "#3a3d42"
  gunmetal-deep: "#2e3135"
  gunmetal-edge: "#222428"
  gunmetal-wall: "#222428"
  gunmetal-wall-dark: "#0a0b0d"
  chassis-highlight: "#4a4e54"
  plate-rule: "#50545a"
  bone: "#e6e1d6"
  bone-wall: "#b9b2a2"
  bone-soft: "#d6d0c4"
  putty: "#c9c3b5"
  putty-wall: "#9f988a"
  charcoal: "#2a2a2a"
  charcoal-deep: "#171a1e"
  mat: "#cfc9bc"
  mat-line: "#b8b1a3"
  ink: "#2a2a2a"
  ink-soft: "#55524b"
  mat-dark: "#171a1e"
  mat-line-dark: "#2a2e33"
  ink-dark: "#e6e1d6"
  ink-soft-dark: "#b3ad9f"
typography:
  display:
    fontFamily: "'Archivo Variable', 'Archivo', sans-serif"
    fontSize: "clamp(2.25rem, 5vw, 5.25rem)"
    fontWeight: 900
    lineHeight: 0.96
    letterSpacing: "-0.025em"
    fontVariation: "'wdth' 112"
  headline:
    fontFamily: "'Archivo Variable', 'Archivo', sans-serif"
    fontSize: "clamp(2rem, 3.4vw, 3.25rem)"
    fontWeight: 850
    lineHeight: 1
    letterSpacing: "-0.02em"
    fontVariation: "'wdth' 110"
  title:
    fontFamily: "'Archivo Variable', 'Archivo', sans-serif"
    fontSize: "clamp(20px, 2vw, 26px)"
    fontWeight: 800
    lineHeight: 1.2
    fontVariation: "'wdth' 108"
  wordmark:
    fontFamily: "'Archivo Variable', 'Archivo', sans-serif"
    fontSize: "22px"
    fontWeight: 850
    letterSpacing: "-0.01em"
    fontVariation: "'wdth' 115"
  body:
    fontFamily: "'Archivo Variable', 'Archivo', sans-serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 1.5
  lede:
    fontFamily: "'Archivo Variable', 'Archivo', sans-serif"
    fontSize: "18px"
    fontWeight: 400
    lineHeight: 1.5
  legend:
    fontFamily: "'JetBrains Mono', ui-monospace, 'Cascadia Mono', Consolas, monospace"
    fontSize: "14px"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "0.06em"
  readout:
    fontFamily: "'JetBrains Mono', ui-monospace, 'Cascadia Mono', Consolas, monospace"
    fontSize: "clamp(16px, 2vw, 26px)"
    fontWeight: 700
    letterSpacing: "0.08em"
    fontFeature: "'tnum'"
  label:
    fontFamily: "'JetBrains Mono', ui-monospace, 'Cascadia Mono', Consolas, monospace"
    fontSize: "12px"
    fontWeight: 500
    letterSpacing: "0.1em"
  nav:
    fontFamily: "'JetBrains Mono', ui-monospace, 'Cascadia Mono', Consolas, monospace"
    fontSize: "13px"
    fontWeight: 500
    letterSpacing: "0.08em"
rounded:
  glass: "5px"
  detent: "6px"
  badge: "8px"
  key: "10px"
  plate-small: "12px"
  action: "14px"
  tray: "16px"
  housing: "18px"
  plate: "22px"
  deck: "28px"
  deck-phone: "20px"
  round: "50%"
spacing:
  key-travel: "5px"
  tight: "8px"
  key-pad: "18px"
  plate-pad: "22px"
  stack: "24px"
  gutter: "clamp(16px, 4vw, 60px)"
  section: "clamp(56px, 9vw, 120px)"
components:
  keycap:
    backgroundColor: "{colors.bone}"
    textColor: "{colors.charcoal}"
    typography: "{typography.label}"
    rounded: "{rounded.key}"
  keycap-putty:
    backgroundColor: "{colors.putty}"
    textColor: "{colors.charcoal}"
    rounded: "{rounded.key}"
  action-key:
    backgroundColor: "{colors.orange}"
    textColor: "{colors.orange-ink}"
    typography: "{typography.legend}"
    rounded: "{rounded.action}"
    padding: "18px"
    size: "150px"
  amber-screen:
    backgroundColor: "{colors.amber}"
    textColor: "{colors.amber-glass}"
    typography: "{typography.readout}"
    rounded: "{rounded.glass}"
    padding: "0 22px"
    height: "64px"
  amber-screen-bezel:
    backgroundColor: "{colors.gunmetal-edge}"
    rounded: "{rounded.key}"
    padding: "8px"
  deck-field:
    backgroundColor: "{colors.bone}"
    textColor: "{colors.charcoal}"
    rounded: "{rounded.key}"
    padding: "0 18px"
    height: "60px"
  mode-key:
    backgroundColor: "{colors.bone}"
    textColor: "{colors.charcoal}"
    typography: "{typography.legend}"
    rounded: "9px"
    padding: "0 18px"
    height: "48px"
  mode-tray:
    backgroundColor: "{colors.gunmetal}"
    rounded: "{rounded.tray}"
    padding: "10px"
  gunmetal-key:
    backgroundColor: "{colors.gunmetal}"
    textColor: "{colors.bone}"
    typography: "{typography.legend}"
    rounded: "{rounded.key}"
    padding: "0 22px"
    height: "52px"
  chassis:
    backgroundColor: "{colors.gunmetal}"
    textColor: "{colors.bone}"
    rounded: "{rounded.deck}"
    padding: "clamp(18px, 2.4vw, 36px)"
  spec-plate:
    backgroundColor: "{colors.gunmetal}"
    textColor: "{colors.bone}"
    rounded: "{rounded.plate}"
    padding: "clamp(18px, 2vw, 26px) clamp(28px, 4vw, 56px)"
  knob-dial:
    backgroundColor: "{colors.gunmetal-edge}"
    rounded: "{rounded.round}"
    padding: "9px"
    size: "150px"
  bone-plate:
    backgroundColor: "{colors.bone}"
    textColor: "{colors.charcoal}"
    rounded: "{rounded.plate-small}"
    padding: "18px 22px"
---

# Design System: Seasonal Emote Replacer

## Overview

**Creative North Star: "The Stream Desk Deck"**

The product is a piece of creator hardware sitting on a desk mat. The streamer's emotes are printed on bone and putty PBT keycaps, the season is a knurled aluminium knob that clicks through detents, a recessed amber screen reports what is live, and one safety-orange key commits. Every surface is either the mat (where the explanation and body copy live) or a gunmetal object set on it (where the controls, readouts and specification live). Nothing floats. Depth is physical: a key has a wall, travels when pressed, and casts a short layered shadow on the chassis; the chassis has its own taller wall and casts on the mat.

Density is instrument-like rather than editorial. A page shows one object at one scale, with prose beside or below it on the mat. Type is a two-voice system: Archivo at heavy weights and widened stretch for anything said to the visitor, JetBrains Mono for anything printed on the hardware (legends, labels, readouts, nav). The world is the same in both colour schemes; only the mat and its ink change, and the chassis wall darkens so the deck keeps its height on a charcoal mat.

Later Operate screens (Replace, Compare, Review) inherit this world as-is: the knob for one-of-many and continuous choices, keycaps for emotes, the amber screen for live progress and counts, and exactly one orange key for the run that changes a set.

**Key Characteristics:**
- Gunmetal objects on a putty (light) or deep charcoal (dark) desk mat.
- Bone and putty keycaps with mono legends; depth from key travel (5px) and layered shadow.
- Safety orange on the one committing action per page; amber only for live state.
- State that survives without hue: dashed rim, corner dot, filled versus hollow tick, pressed travel.
- Archivo wide and heavy for display; JetBrains Mono for every printed legend.
- No glow, no decorative gradients, no floating cards.

## Colors

A warm-neutral hardware palette (gunmetal, bone, putty, mat) carrying exactly two signal colours, each with one job.

### Primary
- **Safety Orange** (`orange`): the committing key and nothing else. One per page, on the action that changes something (MAKE SEASONAL; later, the run on Replace, the submit on Compare). Its side wall is **Burnt Orange Wall** (`orange-wall`) and its legend is printed in **Orange Ink** (`orange-ink`), a near-black brown that keeps the legend reading as dye on the cap. The text caret also takes orange (set globally), the only other place the hue appears.

### Secondary
- **Amber Glass** (`amber`): the lit screen. Live readouts (the season counter, preset sizes, "not wired up yet" status), the lamp on the selected mode key, the filled tick of the checked knob detent, the focus ring, text selection, and the DevTools row the token guide points at. Text on it is **Amber Glass Ink** (`amber-glass`), the unlit segment colour; unlit tick marks are that ink at 18% alpha. **Dim Amber** (`amber-dim`) rims a lit lamp.

### Neutral
- **Gunmetal** (`gunmetal`): the chassis, spec plate, function strip, mode-key tray and the secondary gunmetal key. **Gunmetal Deep** (`gunmetal-deep`) and **Gunmetal Edge** (`gunmetal-edge`) are the darker castings: screen bezels and the knob's dial ring.
- **Chassis Wall** (`gunmetal-wall`, `gunmetal-wall-dark` in dark mode): the 18px side wall under every gunmetal object. It is always darker than the mat.
- **Chassis Highlight** (`chassis-highlight`): the 2px inset top light on the chassis and the bezel's lower lip. **Plate Rule** (`plate-rule`): the 1px dividers between spec-plate rows.
- **Bone** (`bone`) with **Bone Wall** (`bone-wall`): the default keycap, field, kbd cap and bone plate. **Putty** (`putty`) with **Putty Wall** (`putty-wall`): the alternate cap tone (every third key in the grid, the middle function key).
- **Bone Soft** (`bone-soft`): body copy printed on gunmetal, one step quieter than bone.
- **Charcoal** (`charcoal`): legends on caps, the field's 3px border, the flipped-key dot and unmapped dashed rim.
- **Desk Mat** (`mat` / `mat-dark`) with **Mat Line** (`mat-line` / `mat-line-dark`): the page background and its footer rule. **Ink** (`ink` / `ink-dark`) and **Soft Ink** (`ink-soft` / `ink-soft-dark`): text printed on the mat; soft ink for ledes, promises and captions.

### Named Rules
**The One Orange Key Rule.** A page has exactly one orange surface: the key that commits the action the page exists for. Secondary actions are gunmetal keys or bone mode keys. If a second thing wants to be orange, it is not the commit.

**The Amber Is Live Rule.** Amber means "this is the current, live state": a readout, a lit lamp, a checked detent, focus. It never carries warnings, errors or emphasis. A serious notice is a bone plate printed in ink.

**The State Without Hue Rule.** Every state must survive in greyscale. Flipped keys carry a charcoal corner dot; unmapped keys a dashed charcoal rim with the art stepped back to 35%; an invalid field a dashed border; a checked detent a filled tick against hollow ones; a selected mode key sits pressed. Hue may reinforce, never carry alone.

## Typography

**Display Font:** Archivo Variable (width axis, self-hosted via Fontsource) with Archivo, sans-serif
**Body Font:** Archivo Variable at regular weight
**Label/Mono Font:** JetBrains Mono 500 and 700 with ui-monospace, Cascadia Mono, Consolas

**Character:** A wide, heavy grotesk speaks to the visitor like a product name cast into the case; a monospace prints the legends the way dye-sub prints a keycap. The two never swap jobs.

### Hierarchy
- **Display** (900, width 112%, clamp(2.25rem, 5vw, 5.25rem), line-height 0.96, -0.025em, balanced wrap): the one page headline on the mat. The token guide uses a slightly smaller clamp (2.4rem to 4.5rem); the placeholder page 2.2rem to 3.75rem at width 110%.
- **Headline** (850, width 110%, clamp(2rem, 3.4vw, 3.25rem), line-height 1, -0.02em): section headings below the deck. More air above a heading (the section padding) than below it (20 to 32px).
- **Title** (800, width 108%, clamp(20px, 2vw, 26px), line-height 1.2): row titles on the spec plate.
- **Body** (400, 17px, line-height 1.5): all running text. Ledes are 18px in soft ink at 60ch; the promise beside the headline is 17 to 19px at 34ch, line-height 1.55. Statement text (the maker line) runs 20 to 26px at weight 600, 48ch.
- **Legend** (Mono 700, 14 to 17px, 0.06 to 0.08em, uppercase): words printed on keys: the orange key, mode keys, gunmetal keys, function keys.
- **Readout** (Mono 700, clamp(16px, 2vw, 26px), 0.08em, uppercase, tabular numerals): text on amber glass. Large readout figures run clamp(28px, 3.2vw, 40px) with 12 to 13px uppercase units and row names.
- **Label** (Mono 500, 12px, 0.1em, uppercase, soft ink): field labels and knob detents. Keycap number legends are Mono 500 at 9 to 11px, tabular, in the cap's top-left corner.
- **Nav** (Mono 500, 13px, 0.08em, uppercase; 12px and 0.04em on phones): header links and the footer (13px, not uppercase).

### Named Rules
**The Printed Legend Rule.** Mono is for text that is physically on the hardware: a key, a screen, a dial, a field label, the nav strip. Sentences addressed to the reader are Archivo.

**The Width Is Weight Rule.** Display sizes widen as they grow heavier (108% at 800, 110% at 850, 112% at 900, 115% for the wordmark). Never set Archivo display text at default width.

## Layout

Pages are full-bleed on the mat with a fluid side gutter (clamp(16px, 4vw, 60px)) shared by header, footer and every section. The landing's first viewport is a two-column grid, pitch to deck at 0.95fr : 1.9fr, filling the viewport below the header, with the headline, promise and channel field on the left and the deck on the right. Sections below share one rhythm: clamp(56px, 9vw, 120px) above, no bottom padding, so air always sits above a heading. Two-column content sections split prose against an instrument (1.2fr : 1fr for prose beside a readout; 0.9fr : 1.25fr for steps beside a sticky figure).

Inside the deck, the key grid is six columns with clamp(8px, 1vw, 14px) gaps and bottom padding equal to key travel, so pressed keys never clip; the knob and orange key share a column of equal width (the knob size). The common internal steps are 8px (field label to input, tick scale), 14 and 18px (key padding, list gaps), 22px (screen padding, header padding, control gap) and 24px (pitch stack).

**Responsive behaviour.**
- **1100px and below:** the first viewport stacks; pitch above deck, pitch widens to 40rem, no forced viewport height.
- **960px and below:** the token guide's steps and figure stack; the figure stops being sticky.
- **860px and below:** the function strip breaks into three separate gunmetal housings, each holding its key with the step text in bone-soft inside; prose-and-readout sections stack.
- **640px and below:** the deck's radius drops to 20px; controls stack under the keys; the knob shrinks to 104px; the orange key becomes full width at 76px minimum height; spec-plate rows become single column; the nav stays on one row (no wrap, 16px gap); the footer note drops its auto margin.

## Elevation & Depth

Depth is physical and hard-edged. Every raised object has a solid wall (a zero-blur offset shadow in its own wall colour) plus one soft contact shadow beneath it; pressing removes most of the wall and moves the object down by the same distance. Recessed objects (screens, fields, cap dishes) use inset shadows. There is no glow, no blur-as-atmosphere, and no shadow on mat-level text.

### Shadow Vocabulary
- **Key wall, bone / putty** (`0 5px 0 var(--bone-wall), 0 8px 8px rgb(0 0 0 / 0.28)`; putty uses putty-wall): every resting keycap, mode key and function key.
- **Key wall, pressed** (`0 1px 0 var(--bone-wall), 0 2px 4px rgb(0 0 0 / 0.24)`): a pressed cap or selected mode key, with `translateY(4px)`.
- **Orange key wall** (`0 8px 0 var(--orange-wall), 0 12px 16px rgb(0 0 0 / 0.35)`; pressed `0 1px 0` and `0 3px 6px` with `translateY(7px)`): the committing key travels further than any other.
- **Gunmetal key wall** (`0 5px 0 var(--gunmetal-wall), 0 8px 10px rgb(0 0 0 / 0.25)`; pressed `translateY(4px)`): secondary links set as gunmetal keys.
- **Chassis** (`0 2px 0 #4a4e54 inset, 0 18px 0 var(--gunmetal-wall), 0 30px 40px rgb(0 0 0 / 0.35)`): the deck, spec plate, function strip and readout bezel.
- **Bezel recess** (`inset 0 2px 3px rgb(0 0 0 / 0.5), 0 1px 0 #4a4e54`) and **glass** (`inset 0 0 0 1px rgb(0 0 0 / 0.18), inset 0 6px 10px rgb(0 0 0 / 0.12)`): the amber screen sits below the chassis surface.
- **Key well** (`inset 0 3px 0 rgb(0 0 0 / 0.08)`): the deck field.
- **Cap dish** (`inset 0 1px 2px rgb(0 0 0 / 0.12)` on a 7% inset rim): the dished top of a PBT keycap, no gloss.
- **Knob** (`0 6px 0 #18191c, 0 10px 18px rgb(0 0 0 / 0.4)`): the dial ring; the cap is lit top-left with `inset 0 1px 0 rgb(255 255 255 / 0.35)`.
- **Bone plate** (`0 4px 0 var(--bone-wall), 0 8px 14px rgb(0 0 0 / 0.18)`): serious notices.

### Named Rules
**The Travel Rule.** Anything pressable has a wall, and pressing it spends the wall: translate down by the wall height minus 1px, collapse the wall to 1px. Hover never lifts; it may brighten the orange key by 4%.

**The Wall Outranks the Mat Rule.** A gunmetal object's wall is always darker than the mat it sits on, in both schemes. That is why the wall darkens to `gunmetal-wall-dark` on the charcoal mat.

## Shapes

Machined, softly radiused rectangles; radius grows with the size of the object (glass 5px, detent 6px, number badge 8px, key and field 10px, bone plate 12px, orange key 14px, mode tray 16px, housings and bezels 18px, spec plate 22px, deck 28px, 20px on phones). Circles are reserved for turned and lit parts: the knob, detent ticks, lamps, the flipped-key dot, step numbers on function keys. Gradients appear only where they render a real material: the knurled rim (a repeating conic stripe), the knob cap's turned dome (a top-left radial light), and the countersunk screws in the spec plate's corners. Borders are rare and functional: the field's 3px charcoal well edge, 2px dashed charcoal for unmapped or invalid state, 2px rings on hollow ticks and lamps.

## Components

### Keycap (signature)
A display-only emote printed on a PBT cap. Square (aspect 1), radius 10px, bone or putty, cap dish rim inset 7%, art at 58% of the cap, an optional tabular mono number legend at top-left.
- **Idle:** resting wall, full-opacity art.
- **Pressed:** travels 4px with the pressed wall (140ms).
- **Flipped:** showing its seasonal art, marked by a 7px charcoal dot top-right.
- **Unmapped:** no seasonal version or the preset failed; the dish rim becomes a 2px dashed charcoal border at 45% opacity and the art drops to 35%.
- **Blank:** no art while loading; the cap stays, the grid never collapses.
Keycaps are not controls. The deck's real controls are the knob and the action key.

### Action Key (primary button)
The safety-orange committing key. Minimum 150px square (sized to the knob in the deck, full width at 76px on phones), radius 14px, centred uppercase mono legend in orange ink. 8px orange wall; press travels 7px over 120ms. Hover brightens 4%. One per page.

### Knob (one-of-many and continuous control)
A knurled aluminium knob, semantically a radio group. A 150px dial (clamp 116 to 150px in the deck, 104px on phones) with a gunmetal-edge ring, knurled rim, lit dome cap and a bone pointer. Detents sweep 120 degrees; the face rotates over 260ms. Below it, mono label detents, each with an 8px tick: hollow and at 74% opacity when unchecked, 90% on hover, filled amber and full opacity when checked. Arrow keys step one detent without wrapping, clicking a label jumps, dragging snaps to the nearest detent. Detent ink follows the surface (`--knob-ink`, bone on gunmetal).

### Amber Screen (live readout)
A recessed amber glass in a gunmetal-edge bezel (8px padding, 10px radius; glass 64px minimum height, 5px radius, 22px side padding). One value at a time, uppercase tabular mono, announced as a polite live region. Larger multi-row readouts keep the same glass and bezel language, carry a small corner legend printed on the glass at 80% opacity, and draw tick scales (lit ticks in amber-glass ink, unlit at 18%) instead of charts.

### Deck Field (input)
A labelled input set into the deck like a key well: 60px tall, 3px charcoal border, 10px radius, bone fill, 20px mono 500 text, inset well shadow; label above in the mono label style.
- **Focus:** 3px amber ring offset 2px.
- **Error:** the border turns dashed and a 14px mono message in ink appears below with a leading 8px dot. The message says what happened and what to do next.

### Mode Keys (tabs)
Two or more bone keys in a gunmetal tray (10px padding, 16px radius). Each key is 48px tall, 9px radius, mono 700 14px uppercase legend with a leading 8px lamp ring. The selected key sits pressed and its lamp lights amber with a dim-amber rim. Transitions 120ms.

### Gunmetal Key (secondary action)
A secondary link or button as a gunmetal key: 52px tall, 10px radius, bone mono 700 14px uppercase legend, 5px chassis-wall wall, press travels 4px over 120ms.

### Chassis, Function Strip and Spec Plate (containers)
Containers are gunmetal objects with the chassis shadow, never cards on the mat. The **chassis** holds the deck (28px radius). The **function strip** is one gunmetal rail behind a row of wide keys (76px tall, 18px padding, numbered with a 30px ringed mono numeral), with each step's text on the mat below, clearing the strip, the key travel and the 18px wall. The **spec plate** (22px radius) lists title/body rows divided by 1px plate rules and carries four countersunk screws in its corners. Text on gunmetal is bone; supporting text is bone-soft.

### Small Caps (kbd and step numbers)
Inline `kbd` keys are 5px-radius bone caps with a 2px bone wall in mono 700; numbered steps sit beside 34px bone caps with a 3px wall.

### Bone Plate (serious notice)
A bone plate printed in charcoal ink (18px 22px padding, 12px radius, 4px bone wall), with the key phrase in weight 800. Used for the token warning; this is how the system says "be careful" without amber or orange.

### Navigation
Header: the wordmark (Archivo 850, width 115%, 22px) left, mono uppercase links right; links carry a 2px bottom rule that appears in currentColor on hover. Footer: mono 13px in soft ink above a 2px mat-line rule, the name in ink 700, a note pushed right (left-aligned on phones).

### Motion grammar
- **Key travel:** 120ms for the orange key, mode keys and gunmetal keys; 140ms for keycaps; always `cubic-bezier(0.16, 1, 0.3, 1)`.
- **Knob:** the face rotates over 260ms; detent opacity over 160ms.
- **Sequential flip:** when the knob reaches a season, keys flip to their seasonal art one at a time along the grid in reading order, 60ms apart, while the amber screen counts up ("HALLOWEEN · 12/24"), then settles on the live mapping count. Turning back flips them in reverse. On first load the knob turns once, by itself, to the current season 800ms after the preset is ready, unless the visitor has touched it.
- **Reduced motion:** all transitions and animations collapse to 0.01ms, and the content state is shown directly: the deck opens already on the current season with every key flipped, there is no automatic turn, and flips land at once. Motion is never the only way a state is reached.

## Do's and Don'ts

### Do:
- **Do** put every control, readout and specification on a gunmetal object with the chassis shadow, and every sentence to the reader on the mat.
- **Do** give anything pressable a wall and spend it on press (translate wall height minus 1px, collapse to a 1px wall) in 120 to 140ms.
- **Do** use the knob for any one-of-many or continuous choice (season, mode) and mode keys in a tray for a small set of views.
- **Do** report live progress and counts on one amber screen, with tick scales for magnitude.
- **Do** carry every state with a non-hue mark: corner dot, dashed rim, filled versus hollow tick, pressed travel.
- **Do** show the end state directly under reduced motion.
- **Do** keep orange to exactly one committing key per page.

### Don't:
- **Don't** use amber for warnings, errors or emphasis; serious notices are bone plates in ink.
- **Don't** put eyebrow or kicker labels above headings. Legends printed on the hardware itself (keycap numbers, a screen's corner legend, field labels) are part of the object and are fine.
- **Don't** build icon feature cards; explain with the hardware (a function strip of keys, a spec plate).
- **Don't** show numbers as hero-metric tiles; live counts go on the amber readout, and only real database counts are shown.
- **Don't** add glow, blur halos or coloured shadows; depth is walls and contact shadows only.
- **Don't** use gradients as surface decoration. Gradients only render a physical material: the knurl, the knob dome, screw heads.
- **Don't** set Archivo display text at default width or mono text in sentences addressed to the reader.
- **Don't** use 7TV's logo, colours or look-alike branding.
