# Design — kitchen

UI design for v1 (and where v2 fits). **What** we build is in [PRODUCT.md](PRODUCT.md), **how** in [TECH-GUIDELINES.md](TECH-GUIDELINES.md). This file records the design deliverables and the chosen direction.

## Artifact

**Canvas:** https://claude.ai/artifact/YbZ1pd22wgBKPT8NK55e1L (Claude Design, private until shared from the page's Share menu)

It has two pages:

| Page | Artboards |
|---|---|
| **Wireframes (v1)** | `Main.dc.html` (Shopping list), `WF-Pantry.dc.html`, `WF-Recipes.dc.html`, `WF-Account.dc.html` |
| **Hi-fi proposals A–D** | `Hifi-A-Leaflet.dc.html`, `Hifi-B-Revolut.dc.html`, `Hifi-C-Wolt.dc.html`, `Hifi-D-Tiles.dc.html` (each: 3 screens × light + dark, plus a token/type column), `Hifi-A-Accents.dc.html` (accent options for A) |

All screens are 390×844 phone frames. UI copy is Polish; notes, file names and token names are English (TECH-GUIDELINES §0).

---

## 1. Screen inventory (wireframes)

| # | Screen / state | Key elements | Artboard |
|---|---|---|---|
| L1 | **List — default** | Eyebrow + title, gear → settings, add field pinned on top, items grouped by category in aisle order (dot + name + amount + check circle), "Kupione 3" collapsed with *Wyczyść* / *Do spiżarni*, floating tab bar | Shopping list |
| L2 | **List — add with autocomplete** | Focused field `mle 2 l`, dropdown with sources: pantry ("w domu 1 l"), history ("ostatnio"), and "Dodaj „mle”, 2 l" with auto-category; amount parsed from text ("Ilość wpisz po nazwie: mleko 2 l"); tab bar hidden while typing | Shopping list |
| L3 | **List — edit item sheet** | Bottom sheet: name, amount + unit chips, category row, note, *Usuń* (outline) / *Zapisz* (ink) | Shopping list |
| L4 | **List — empty + offline + undo** | "Wszystko kupione" empty state with link to recipes, offline pill under the title, undo toast "Usunięto 3 kupione" + *Cofnij* above the tab bar | Shopping list |
| P1 | **Pantry — default** | Search, horizontally scrolling category chips, "Zużyj wkrótce" and "Mało" sections first (only when non-empty), then categories; values right-aligned (amount, date, "8 dni") | Pantry |
| P2 | **Pantry — item sheet** | Big −/+ stepper, "Mało" toggle, "Termin" with *Dzień / Miesiąc* segmented control, *Dodaj do listy* (ink) and *Usuń* | Pantry |
| P3 | **Pantry — search, no results** | "Nie ma „tahini”" ("0 wyników w spiżarni") with *Dodaj do spiżarni* / *Dodaj do listy* | Pantry |
| R1 | **Recipes — grid** | Search + new, meal-type chips (Wszystkie · Śniadanie · Obiad · Kolacja), 2-column cards with photo, title, "Obiad · 30 min · 3/6" (ingredients you have / total, from the pantry) | Recipes |
| R2 | **Recipe detail** | Photo hero with back/edit, meta chips, servings stepper (rescales amounts), ingredients with have ✓ / missing (dashed), header "3/6 w domu", dock: *Dodaj 3 do listy* + *Gotuj* | Recipes |
| R3 | **Recipe editor** | Tall sheet (88 vh): photo, name, meal type chips, time, servings, ingredients with drag handles, steps, *Zapisz* in the sheet header | Recipes |
| R4 | **Cooking mode** | Full screen, "Krok 2/5" + progress segments, 31 px step text, ingredients for this step, timer, "Ekran nie zgaśnie" (wake lock), big *Wstecz* / *Dalej* | Recipes |
| O1 | **Sign in / sign up** | One screen with segmented *Zaloguj się / Załóż konto*, e-mail, password, reset link | Account |
| O2 | **Household — create or join** | Two cards: create (name → get a code) or join with a 6-character code | Account |
| S1 | **Settings sheet** | Household name, invite code with *Udostępnij*, members, theme *Auto / Jasny / Ciemny*, accent swatches, categories & order, *Wyloguj się* | Account |
| V2 | **Plan tab placement (v2)** | Tab bar grows to 4: List · Pantry · Recipes · **Plan** (Plan is the 4th slot, rightmost). Sketch of the week strip, meals with "3/6 w domu", and *Dodaj braki do listy* | Account |

Cross-cutting rules shown in the wireframes (copy follows the UX copy rules below since 2026-11-12):
- Floating tab bar: dark pill, 3 slots in v1, 4 in v2; hidden on recipe detail, cooking mode and while typing in the add field.
- Every add/edit is a bottom sheet (30 px top radius, grab handle); no full-page forms.
- Undo toast instead of confirm dialogs (delete, clear bought, move to pantry).
- Offline pill under the screen title; writes queue and sync on reconnect.
- 44 px minimum touch targets; list rows are 56–62 px.

---

## 2. Hi-fi proposals

All three use the same three screens (Shopping list, Pantry, Recipe detail) with the same Polish sample data, in light and dark.

### A — "Leaflet" (calm)
Your own Leaflet applied to food: Instrument Sans (the serif italic accent word was dropped on 2026-11-12; headings are plain sans), 24 px cards on `--soft` with no borders or shadows, 44 px icon circles, ink pills for actions, one user-chosen accent. Ticking fills the whole card with the accent before it collapses into "Kupione". Pantry alerts are two tiles (accent + soft) above grouped rows. Recipe detail uses an accent-colored image tile (or photo), a big servings pill, and an ink *Dodaj brakujące (3)* dock.

Tokens (light / dark): `--accent #FFD84D` · `--bg #FFFFFF / #121211` · `--soft #F4F3EF / #22211E` · `--ink #141414 / #F2F0EA` · `--muted #6E6C65 / #A6A39B` · `--line #E9E7E1 / #34332F` · `--bar #141414 / #2A2926` · `--danger #C8323A / #FF8A8A`. Type: 34/500 titles, 17/600 rows, 13/500 secondary.

### B — "Revolut" (dense)
Inter with tabular numerals; one white container per category with hairline-separated 52 px rows, 40 px tinted icon circles, values right-aligned. A big "5 do kupienia" counter, member avatars in the header, three KPI tiles on the pantry (154 / 2 / 2), a KPI strip on the recipe (30 min · servings stepper · 3/6 missing). Ticking = filled check + strikethrough. Labelled floating tab bar.

Tokens (light / dark): `--brand #4F55F1 / #8A8FFF` · `--bg #F3F4F8 / #0B0C10` · `--surface #FFFFFF / #17181E` · `--ink #0E1117 / #F4F5F9` · `--muted #5E6573 / #9CA2AF` · `--line #E8EAF0 / #262831` · `--warn #B45309 / #F5A75B` · `--ok #11883F / #4ED68A`. Type: 28/800 titles, 40/700 counters, 16/600 rows.

### C — "Wolt" (playful)
Nunito 600–900; every item gets a 52 px colored category tile, quick-add chips from history under the add field, a 3×2 grid of category tiles in the pantry with "Zjedz najpierw" cards, and a 300 px photo hero on the recipe with a rounded sheet over it. Bright lagoon-blue brand, coral for "brak"/expiry. Category tile palette has separate light and dark sets.

Tokens (light / dark): `--brand #00A6D6 / #3BC4F0` · `--cta #0090C8 / #3BC4F0` · `--brand-soft #DDF3FB / #123544` · `--bg #FFFFFF / #0E1418` · `--soft #F2F5F8 / #1A2228` · `--ink #0B1B26 / #EEF3F6` · `--muted #5A6B78 / #9AAAB5` · `--pop #C2410C / #FF9C77`. Type: 30/900 titles, 17/800 rows.

### D — "Soft tiles" (from the user's reference screenshots)
Added after the first review, inspired by three references (an energy app with a huge "96%" and partly filled battery tile, health/fitness apps with pastel tiles and pill stats, a shared family organiser). Inter Tight; titles end with a full stop and have a grey second line ("Lista. / 5 do kupienia."); one big figure per screen (3/8 bought, 2 + 2 pantry alerts, 3/6 ingredients at home); pastel tiles with meaning — matcha = done/have, peach = use soon, sky = low; progress shown as a matcha fill inside a soft tile; white floating tab bar whose active tab is an ink pill with its label; a "Gienek w sklepie" presence pill on the list.

Tokens (light / dark): `--matcha #D4F09F / #B5DC6E` · `--peach #F8CDB4 / #E8A987` · `--sky #BFE3EE / #8FCBDD` · `--bg #FFFFFF / #121211` · `--soft #F3F2EF / #1F1E1C` · `--ink #161616 / #F2F0EA` · `--sub #8C8A84 / #7F7D77` (grey second line, large text only) · `--muted #6E6C65 / #A6A39B`. Type: 32/600 titles, 48–96/500 hero numbers, 17/600 rows. Text on pastel tiles is always `#161616`.

Pros: status at a glance; colors carry meaning; still plain CSS. Cons: hero figures cost ~130–200 px, so the list starts lower than in A; more colors than A to keep disciplined.

### Comparison

| | A — Leaflet | B — Revolut | C — Wolt | D — Soft tiles |
|---|---|---|---|---|
| **Ticking speed in a store** | Best: 62 px full-width cards, check on the thumb side, whole card fills with accent | Good: 52 px rows, small 26 px check; more mis-taps while walking | Good: 64 px rows, 34 px check, but tile + amount chip crowd the name | 58 px rows, 32 px check on the left; ticked = matcha check + strike |
| **One-handed use** | Strong: big targets, actions in a bottom dock / tab bar | Medium: denser targets, header avatars/gear at the top | Strong targets, but the photo hero pushes content down | Strong: dock + labelled tab bar at the bottom |
| **Readability (bright kitchen, dark mode)** | High, calm, few colors; dark mode is the existing Leaflet set | Highest for numbers (dates, amounts in a column); text slightly small | Good; many colors make dark mode harder to keep consistent | High; big numbers, pastels keep ink text in both themes |
| **Items visible per screen (list)** | ~6–7 | ~8–9 | ~6 | ~4–5 (progress tile on top) |
| **Pantry scanning** | Good (tiles + grouped rows) | Best (KPIs, aligned values) | Visual (category tiles), slower for exact amounts | Fast for "what needs attention" (two tiles), normal for the rest |
| **Recipes** | Clean; works without photos (accent tile) | Functional, least appetizing | Most appetizing, but needs a photo per recipe | 3/6 hero answers "can we cook this?" instantly; no photo needed |
| **User-chosen accent (PRODUCT §3)** | Native | Fixed brand, weak fit | Fixed brand, weak fit | Matcha is part of the meaning system; accent choice would swap only the "done" color |
| **Build cost (plain CSS, no build step)** | Lowest — Leaflet components already exist | Low | Medium — tile palettes ×2 themes, photo handling | Low |
| **Feels like** | "Our home app" | A finance app | A delivery app | A calm dashboard for the home |

---

## 3. Recommendation

**Go with A — Leaflet**, with two borrowings:

1. **From B:** in the pantry, values right-aligned in tabular numerals with a muted second line ("20 lis / za 8 dni"). A already does this in its rows; keep it strict.
2. **From C:** colored category glyphs in the 44 px icon circles (green produce, blue dairy, coral fish…) instead of a plain white circle, so items are recognisable before reading. Keep them as small circles, not big tiles.

Why: A is the fastest to tick one-handed, has the least visual noise for two people using it daily, supports the user-chosen accent the product already plans for, and reuses Leaflet's tokens and components, so M2 (app shell) is mostly porting. B's density isn't worth smaller targets in a store, and C depends on recipe photos the imported data mostly doesn't have.

**Decision (2026-11-12): direction A chosen.**

### Accent color
Yellow is no longer the assumed default. The canvas board **A — accent options** (`Hifi-A-Accents.dc.html`) shows the List screen in six accents, light and dark. The A board also has an `accent` tweak to preview all three screens.

| Name (UI) | Token value | Ink text on accent | On dark tab bar | Note |
|---|---|---|---|---|
| **Matcha** | light `#D4F09F` · dark `#B5DC6E` | 14.7:1 · 11.8:1 | — · 9.3:1 | **Chosen default.** "Fresh / bought" feel. In light mode the pale fill is close to `--soft`, so the ink check (not the fill) carries the ticked state |
| Pomidor | `#FF8A65` | 8.0:1 | 6.3:1 | Warm, appetizing alternative |
| Morela | `#FFB86B` | 10.8:1 | 8.5:1 | Close to yellow, warmer |
| Lawenda | `#B4A5FF` | 8.6:1 | 6.8:1 | Least food-like |
| Mięta | `#7EDCC0` | 11.3:1 | 8.9:1 | Cool, fresh |
| Słonecznik | `#FFD84D` | 13.3:1 | 10.5:1 | The original Leaflet yellow |

All six are the settings-sheet swatches. Text on the accent is always `#141414`.

Rule that comes with a non-yellow accent: **the accent means only "selected / done / primary"**. Warnings such as "Kończy się termin" use a soft tile with a small orange dot (`#E0662E`), not the accent fill. Otherwise "ticked" and "expiring" would look the same. This changes the default in IMPLEMENTATION-PLAN decision 3 from Leaflet yellow to Matcha. The accent is a per-theme token: `--accent:#D4F09F` in light, `#B5DC6E` in dark.

### UX copy rules (apply to every direction)
Decided 2026-11-12. Short, scannable, numbers instead of sentences.

| Before | After | Rule |
|---|---|---|
| "brakuje 3 z 6", "masz wszystko" | **3/6**, **6/6** (+ "w domu" where context is missing) | Counts as fractions: have/total |
| "Kończy się termin" | **Zużyj wkrótce** | Say what to do, 1–2 words |
| "Zostało mało" | **Mało** | Shortest word that is still clear |
| "za 8 dni", "ten miesiąc" | **8 dni**, **lis** / **do końca mies.** | Drop filler words in values |
| "Kupione (3)" | **Kupione 3** (number in ink, label muted) | No brackets and no middle dot `·` separators anywhere in the UI; use a comma ("2 l, łaciate", "Obiad, 30 min") or put the value in its own element |
| "Dodaj brakujące (3)" | **Dodaj 3 do listy** | Buttons say the result |
| "Dodaj, np. „mleko 2 l”" | **Dodaj produkt** | Placeholder names the action; the "mleko 2 l" tip shows once, in onboarding/empty state |
| "Czwartek, 12 listopada · 6 do kupienia" | **5 do kupienia** | No date in the eyebrow; only the number that matters |
| "masz 1 kg", "brak" under each ingredient | (icon only) + **na liście** when relevant | Status by icon; text only for extra info |
| "Twoja *spiżarnia*" | **Spiżarnia** | No italic accent words in headings |

### Notes for implementation
- **Contrast fix:** Leaflet's `--muted #77756E` on `--soft #F4F3EF` is about 4.1:1, below 4.5:1 for 13 px text. The proposal uses `#6E6C65` (≈ 4.6:1). Update the token in TECH-GUIDELINES §10 when M2 starts.
- Accent text is always `#141414` on the accent fill, whatever accent the user picks; the picker offers only the six light, saturated swatches above.
- Tick animation: Leaflet `.card .fill` clip-path circle from the tap point, then the item moves into "Kupione" after ~600 ms (enough time to undo by tapping again).
- Categories have no colors (the colored dots were removed from A after review, so borrowing 2 from C above is dropped); the accent is the only big fill.
- No photos yet for most recipes: show the accent tile with a meal-type glyph as the fallback.
