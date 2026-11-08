# Making a character for Khibi

Characters are **packs**: a folder with a `character.json` and some art. Drop the folder in and run
**`Khibi: Choose Character`** from the Command Palette – it switches instantly, no rebuild.

Where packs live (later entries win if two share a folder name):

1. Built in: `packages/companion-app/characters/` (ships with the extension – `khibi`, `mochi`)
2. Yours: run **`Khibi: Open My Characters Folder`** (lives in VS Code's global storage, survives updates)
3. Optional: any folder set in the `khibi.customCharactersPath` setting

Folder names are the character id: lowercase letters, digits, `-` or `_`.

---

## Pack format

### `type: "images"` – one picture per mood (use this for AI-generated art)

```json
{
    "name": "Pixel Fox",
    "author": "you",
    "description": "Shown in the picker.",
    "type": "images",
    "scale": 1,
    "expressions": {
        "normal":      "normal.png",
        "happy":       { "src": ["happy1.png", "happy2.png"], "fps": 4, "motion": "bounce" },
        "celebrating": { "src": "celebrate.webp", "motion": "jump" },
        "sad":         "sad.png"
    }
}
```

- **Only `normal` is required.** Missing moods fall back automatically:
  `celebrating → excited → happy → normal`, `sleepy ⇄ sleeping → normal`, `sad ⇄ worried → normal`,
  `surprised → excited → normal`, `thinking → normal`.
- A string is one still image. A list is a **frame animation** (`fps` 1–30, default 6) – 2–4 frames
  is enough to feel alive. Animated GIF/WebP/APNG also work as a single file.
- `motion` is a body-movement preset layered on top: `none, breathe, bounce, jump, shiver, droop, nod,
  sway, pop`. Defaults: normal→breathe, happy→bounce, excited/celebrating→jump, worried→shiver,
  sad/sleeping→droop, sleepy→nod, thinking→sway, surprised→pop.
- `scale` 0.5–1.5 if your art has lots of empty margin (or is cropped tight).
- Formats: PNG, WebP, GIF, JPG, SVG. **Transparent background required** (the window is see-through).

The 10 moods and when they fire:

| mood | triggered by |
|---|---|
| `normal` | idle |
| `happy` | file saved, headpat, startup |
| `excited` | headpat |
| `celebrating` | all tests passed |
| `worried` | new error diagnostic |
| `sad` | tests failed |
| `thinking` | tests running |
| `surprised` | woken up |
| `sleepy` | idle warning |
| `sleeping` | inactivity timeout |

### `type: "svg"` – a single animated vector (how built-in Khibi works)

```json
{ "name": "My Vector", "type": "svg", "svg": "me.svg" }
```

The SVG is inlined and styled by the app's CSS. Give elements these classes and the app shows/hides
them per mood: `eye-variant eyes-{normal,happy,sparkle,surprised,worried,sad,thinking,sleepy,closed}`,
`brow-variant brows-*`, `mouth-variant mouth-{smile,open-smile,o,wavy,frown,hmm,yawn,sleep}`,
`extra-prop prop-{sweat,tears,snot-bubble}`, plus `khibi-whole`, `khibi-head-group`, `khibi-ahoge`,
`arm-left`, `arm-right` for motion. See `characters/khibi/khibi.svg`. Scripts, `foreignObject` and
`on*` attributes are stripped.

---

## Generating art with Gemini / ChatGPT

> I read "argon" as a typo and assumed you mean the image generators in Gemini and ChatGPT. The
> workflow below is the same for any image model.

### Why the current Khibi feels flat
It is one hand-coded vector made of primitive ellipses: single flat outline weight, almost no shading,
the *same* body in every mood (only eyes/brows/mouth swap, with a hard cut), one idle loop, and no
coding context (no laptop, mug, headphones). AI art fixes the first four; the checklist below fixes
the last.

### The one rule: lock the character first, then make moods by *editing*
Generators drift if you re-describe the character each time. So:

1. Generate a **character sheet** (front view + a few angles) until you love it.
2. For every mood, upload that sheet/image and ask for **the same character** with a new pose and face
   – don't start fresh prompts.
3. Keep every request in the **same chat** so style, palette and proportions stay put.

### Step 1 – character sheet (Gemini "Nano Banana" or ChatGPT image)
```
Create a character design sheet of an original chibi coding-companion mascot: [describe: e.g. a
fox-eared girl in an oversized mint hoodie, lavender bobbed hair with one ahoge, big glossy
violet eyes, soft blush]. Cute 2-head-tall chibi proportions, clean soft cel-shaded anime style,
thick consistent dark-purple outline, pastel palette, subtle gradient shading and highlights.
Show: full-body front view, 3/4 view, and 4 face close-ups (neutral, happy, sad, surprised).
Plain flat white background, no text, no watermark.
```

### Step 2 – each mood (repeat 10×, attach the approved image)
```
Same character, same outfit, same art style, same proportions and the same camera angle as the
reference – full body, centred, feet near the bottom of the frame, square image, plain flat
[#00FF00 green] background (no shadow, no gradient on the background, nothing cropped).
Pose/expression: [MOOD LINE]
```

| mood | `[MOOD LINE]` |
|---|---|
| normal | relaxed, gentle smile, hands at sides, eyes open |
| happy | eyes closed in happy arches, open smile, arms slightly raised, tiny hearts |
| excited | sparkly star eyes, big open grin, both fists pumped, mid-hop |
| celebrating | arms thrown up, confetti, huge smile, stars around head, jumping |
| worried | brows raised in the middle, wobbly mouth, one sweat drop, hands clasped |
| sad | teary glossy eyes, small frown, slumped shoulders, head tilted down |
| thinking | eyes glancing up-right, finger on chin, small "?" above head |
| surprised | wide round eyes, small "o" mouth, hands up, tiny jump back |
| sleepy | half-lidded eyes, yawning, rubbing one eye, drooping head |
| sleeping | eyes closed, curled up or head on arms, snot bubble, floating "z z z" |

**Bonus coding-flavoured poses** (great for a future version – the engine already accepts extra art):
typing on a tiny laptop, sipping coffee, wearing headphones, holding a magnifying glass (debugging),
holding a "LGTM" sign, waving goodbye.

### Step 3 – turn it into animation (optional, big payoff)
For `happy`, `celebrating`, `normal`, `sleeping` ask for a **second and third frame**:
```
Same image again, but frame 2 of a looping 3-frame animation: [what moves – e.g. "blinking, arms a
little lower, ahoge bent left"]. Keep everything else pixel-identical.
```
Then list them as `"src": ["a.png","b.png","c.png"], "fps": 4`. Blinking frames on `normal` alone make
a huge difference.
Video route: Gemini **Veo** / ChatGPT **Sora** can do a short looping idle clip on a flat colour
background; extract frames with `ffmpeg -i idle.mp4 -vf fps=8 f%02d.png`, then remove the background.

### Step 4 – clean up for the app
1. **Transparent background.** Easiest: ask for a flat `#00FF00` background and key it out, or use
   remove.bg / Photoshop "Remove background" / `rembg` (`pip install rembg`, `rembg p in/ out/`).
   Check the edges on a dark *and* light background (green fringes are the usual flaw).
2. **Same canvas for every file.** Export all as **square 512×512 or 768×768**, character feet at the
   same height in every image, so switching moods doesn't make him jump.
3. **WebP or PNG**, keep each file under ~300 KB (`cwebp -q 85 in.png -o out.webp`).
4. Name files after the moods, write `character.json`, put the folder in **My Characters Folder**,
   run **Khibi: Choose Character**.

### Also worth generating
- **Sound effects** – ElevenLabs/Suno-style short chimes or a few voice lines ("Yatta!") per mood
  (the app currently synthesises sine beeps; audio-file support would be a natural next feature).
- **A 256×256 `icon.png`** for the Marketplace listing.
- **Dialogue** – ask ChatGPT/Gemini for 15 lines per trigger in your character's *personality* (tsundere,
  sleepy cat, hype-man…) to replace `packages/shared/src/dialogues.ts`.

---

## Checklist
- [ ] folder name is lowercase, has `character.json`
- [ ] `expressions.normal` exists
- [ ] transparent background, same canvas size and foot position in every image
- [ ] tested on dark and light editor themes
