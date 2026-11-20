# Design — kitchen

UI design for v1 (and where v2 fits). **What** we build is in [PRODUCT.md](PRODUCT.md), **how** in [TECH-GUIDELINES.md](TECH-GUIDELINES.md). This file records the design deliverables and the chosen direction.

## Artifact

**Canvas:** https://claude.ai/artifact/YbZ1pd22wgBKPT8NK55e1L (Claude Design, private until shared from the page's Share menu)

It has three pages:

| Page | Artboards |
|---|---|
| **Wireframes (v1)** | `Main.dc.html` (Shopping list), `WF-Pantry.dc.html`, `WF-Recipes.dc.html`, `WF-Account.dc.html` |
| **Hi-fi proposals A–D** | `Hifi-A-Leaflet.dc.html`, `Hifi-B-Revolut.dc.html`, `Hifi-C-Wolt.dc.html`, `Hifi-D-Tiles.dc.html` (each: 3 screens × light + dark, plus a token/type column), `Hifi-A-Accents.dc.html` (accent options for A) |
| **Plan (M8–M9)** | `Plan-Day.dc.html` (V2–V4), `Plan-People.dc.html` (V5–V6), `Plan-AtHome.dc.html` (V7–V8), `Plan-Edge.dc.html` (V9–V11); direction A, Matcha, light + dark |

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
| V2 (wireframe) | **Plan tab placement (v2)** | Tab bar grows to 4: List · Pantry · Recipes · **Plan** (Plan is the 4th slot, rightmost). Sketch of the week strip, meals with "3/6 w domu", and *Dodaj braki do listy* | Account |

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

### Deliberate differences in the build (M2)
Recorded per the working rules; each can be changed back if it reads wrong on the phone.
- **Gear on every tab header.** The A board shows the gear on the list and a "+" on the pantry. Settings must be reachable from every tab, so M2 puts the gear on all three; M4/M5 add their own "+" next to it.
- **Invite code is 8 characters** (the database format), typed into one field and shown as `K7Q2-MX4P`; the wireframe's six boxes were a sketch.
- **Members show "od 12 lis"** instead of "dołączył 12 lis" (no gendered verb).
- **New invite code** is a small round button next to *Udostępnij*, with a confirm sheet ("Stary kod przestanie działać"), since it cannot be undone.
- **Demo banner** uses Leaflet's ink pill (dark bar, accent button) rather than 3d-print's soft bar.
- **"Zużyj wkrótce" tile** carries the small `--warn-dot`, as in the accent board; the plain A pantry board had none.
- **Month-precision dates** count as "Zużyj wkrótce" during their month ("lis 2026 / do końca mies."), day dates within the household threshold (7 days).

### Deliberate differences in the build (M3)
- **Editing a row:** the A board makes the whole card the tick target and the wireframe opens the sheet on the name. To keep the big tick target in the store, a tap anywhere on the card ticks; the 44 px icon circle on the left opens the edit sheet, and holding the row (about half a second) does too.
- **Amounts stay on the second line** with the note ("2 l, łaciate"), as on the A board, not right-aligned.
- **Kupione expands** to the bought rows (outlined, name struck through, ink check); tapping one puts it back on the list.
- **"ostatnio"** comes from the last 80 adds on this phone (the list keeps no history after *Wyczyść* or *Do spiżarni*); the list and pantry sources are shared.
- **Picking a category in the edit sheet saves a category rule** for that name, so both phones file it the same way next time.
- **Offline pill** reads "Bez połączenia" plus "zapisze się później" while writes are waiting.
- **Category order** is changed with a drag handle (or arrow keys on it), not up/down buttons.

### Deliberate differences in the build (M4)
- **Each item appears once.** An item in "Zużyj wkrótce" or "Mało" is not repeated in its category group; while searching, the two sections are hidden and results are grouped by category.
- **Month precision = last day of the month**, so "Zużyj wkrótce" starts in the last week of that month (threshold days), not on the 1st.
- **Tiles are buttons** that scroll to their section; a tile with 0 is disabled, and the whole tile row is hidden when both are 0.
- **Month picker is two selects** (month, year) because iOS Safari has no `type="month"`; day uses the native date input.
- **Stepping up clears *Mało*** (you just added some); the switch stays manual otherwise.
- **The item sheet has no name field**; delete and re-add to rename.

### Deliberate differences in the build (M5)
- **Dodaj N do listy counts only what the list doesn't have yet.** A missing ingredient already on the list shows "na liście" and is not added again; when every missing item is on the list the button reads "Wszystko na liście" (disabled). With nothing missing the dock shows only *Gotuj*.
- **The recipe view shows the steps** ("Przygotowanie", numbered, with timer tags) and the source link below the ingredients; the A board showed only ingredients.
- **Przekąska** is a fourth meal chip, shown only when a recipe has that meal type (the database allows it).
- **Editor sections are header rows** between ingredients (dragged like ingredients) instead of a section field on every ingredient; the note goes after a comma ("pomidory, w puszce").
- **Prep and cook time are two fields** ("Przygotowanie, min" and "Gotowanie, min"); cards and the view show the sum.
- **Cooking mode** shows only the ingredients the step mentions (matched by name); a step without a timer has no timer control. One timer runs at a time and stops when cooking mode is closed.
- **Servings in the recipe view are not saved**; they reset to the recipe's servings when another recipe is opened.

### Deliberate differences in the build (M7, release review)
Found in the pass over every screen at 320 px and 480 px, light and dark (2026-11-15).
- **Sheets and the on-screen keyboard.** While the keyboard is up, the sheet's bottom rests on the keyboard and the sheet scrolls inside; its surface continues behind the keyboard's translucent bars. A tap on the scrim closes a sheet only if the touch also started on the scrim. (The M4 rule that moved sheets to the top half on focus is gone: it made iOS close the sheet when a lower field was tapped.)
- **Every small control is 44 px**: the settings buttons (*Nowy kod*, *Udostępnij*, the *Zużyj wkrótce* −/+), the editor's *Dodaj sekcję*, and the cooking-mode progress segments (the visible bar stays 6 px, the tap area is 44 px).
- **Invite code row wraps** on narrow phones: *Nowy kod* and *Udostępnij* move under the code instead of squeezing it.
- **Accent swatches** keep six per row; below 360 px the gaps shrink, so a swatch is about 39 px with the gap making up the rest.
- **The pantry item sheet's list button reads *Dodaj do listy*** (it said "Na listę zakupów"), as on P2/P3.
- **Placeholders name the action only**: *Dodaj składnik*, *Nazwa sekcji*. The ingredient example moved to the hint above the field ("Ilość po nazwie, notatka po przecinku: pomidory 400 g, w puszce"). The recipe name keeps "Np. szakszuka", because that field fills in a value rather than adding something.
- **The demo banner's *Wyjdź* stays 36 px** (demo only, inside a 48 px bar).

### Deliberate differences in the build (M7.2, dietitian recipes)
No board exists for these; they follow the A components.
- **Dietetyk chip** is a toggle after the meal-type chips, so "Dietetyk + Śniadanie" works; *Wszystkie* clears both.
- **Macros in R2** sit between the title and the servings row: kcal at 22 px with a small soft *Dietetyk* pill, then four soft tiles (B, T, W, Bł) with the letter muted and the grams in ink. Screen readers hear the full words ("Białko 39 g"). The numbers are for the servings in the stepper, rounded to whole numbers.
- **"ok." marks estimated macros**, including dietitian numbers changed by hand in the editor; the *Dietetyk* pill shows only for unchanged dietitian numbers.
- **Uwagi** (the recipe's notes, e.g. the dietitian's tips) show as a soft block after the steps; the editor does not edit them yet.

### Deliberate differences in the build (M7.3, macro estimates)
No board exists for these either; they reuse the M7.2 macros block and the A list components.
- **Estimates look like typed-in macros:** "ok. 480 kcal" and the same four tiles. Under them, "2 składniki bez danych" is a muted underlined text button that opens the editor at *Produkty*; when nothing can be computed (no amounts at all), only that line shows.
- **Produkty in R3** sits inside *Makro na porcję*, not on each ingredient row, so the rows stay as they are. The head shows matched/total ("6/7"), the hint gives the live estimate per serving. Rows without data come first in a soft group (name, "Bez danych" or the food with "bez ilości", and *Wybierz* or *Zmień*); matched rows fold under "6 dopasowanych".
- **Food picker** is a stacked tall sheet over the editor: the ingredient's name, a search field, then a radio list (*Dopasuj po nazwie* first, then every food with "143 kcal w 100 g").

---

## 4. Plan tab (M8) and list from the plan (M9), hi-fi

Added 2026-11-20, before any M8 code. Direction A, Matcha accent, the copy rules above. Canvas page **Plan (M8–M9)**; each board shows light (top row) and dark (bottom row) at 390 px.

Sample data on every board: range pt 20 – cz 26 lis (the default "next 7 days"), people Diana (1 700 kcal target) and Gienek (no target), slot shares 25/15/35/25%.

| ID | Screen / state | Key elements | Board |
|---|---|---|---|
| V2 | **Plan, day view** | Eyebrow "4/7 dni zaplanowane", title *Plan*, gear. Range pill "pt 20 – cz 26 lis" (opens V3) and *Lista z planu* (opens V7). Day strip = Leaflet `.week`: ring around each date fills by planned slots (0–4), ink pill on the selected day, arrows page through the range. Day head "Piątek, 20 lis" + *Kopiuj dzień*. Day totals per person: "ok. 1 717 kcal / cel 1 700" with "B 78 g, T 52 g, W 214 g"; "bez celu" when no target. Four slots with their share; each meal card: accent glyph tile, name, portion pills "Diana 1,2" "Gienek 1", right "3/6 w domu". 4-slot tab bar, Plan active. | Plan-Day |
| V3 | **Range sheet** | Presets *7 dni od dziś* (default), *5 dni od jutra*, *Ten tydzień*, *Weekend*; month calendar, range as an accent band with ink start/end; past days faint. Button says the result: *Pokaż 7 dni*. | Plan-Day |
| V4 | **Add meal sheet** | Title = slot ("Obiad"), date under it. Search, chips (slot preselected, *Dietetyk*, *Wszystkie*), radio list of recipes with "ok. 496 kcal, 30 min" and "3/6 w domu". *Kto je*: person chips, all on by default, dashed *+ Gość*. Live portion preview per person ("1,2 porcji, 35% z 1 700 kcal, 595 kcal"; "1 porcja, bez celu"). Button *Dodaj do obiadu*. | Plan-Day |
| V5 | **People and slot shares** | From Ustawienia → *Kto je*: people rows (name, "1 700 kcal dziennie" or "Bez celu", *Gość* tag), dashed *Dodaj osobę*. *Podział kalorii na posiłki* with a 4-part bar and a ±5% stepper per slot, total "100%", hint "Dotyczy osób z celem kcal", *Przywróć 25/15/35/25*. | Plan-People |
| V6 | **Person sheet (new guest)** | *Imię*, *Cel kcal* (placeholder "Bez celu", suffix "kcal dziennie"), hint "Bez celu porcja to 1", switch *Gość* ("Nie dodawaj do „Wszyscy”"), *Dodaj osobę*. | Plan-People |
| V7 | **Co jest w domu (M9)** | Opened by *Lista z planu*. Eyebrow "4 dni, 15 posiłków, 2 osoby". Day picker (planned days on, empty days outlined and off). Three groups: *Do kupienia 14* (checked; "potrzeba 400 g, w domu 0" and the amount to add "+400 g"; "na liście 2" when already on the list), *W domu 4* (unchecked, "w domu" tag), *Przyprawy i podstawy 4* (unchecked). Sticky *Dodaj 14 do listy*. Shown twice: top and scrolled. | Plan-AtHome |
| V8 | **List after adding** | Items merged into their categories with "z planu" in the second line ("400 g, z planu"); toast "Dodano 14 z planu" + *Cofnij* removes the whole batch. | Plan-AtHome |
| V9 | **No plan yet** | Empty rings, *Lista z planu* disabled, accent icon, "Nic nie zaplanowane", *Dodaj śniadanie*, link "Kto je: Diana, Gienek". | Plan-Edge |
| V10 | **Meal sheet, person without target** | Tap a meal: per-person portion and kcal, "Razem do zakupów 2,2 porcji" (what M9 uses), note "Bez celu porcja to 1." + *Ustaw cel*, chips *Powtórz jutro*, *Przenieś*, *Kto je*, *Usuń z planu* / *Otwórz przepis*. | Plan-Edge |
| V11 | **Recipe without macros** | Meal card gets an outlined "bez makro" pill, portions stay 1; day totals say "1 posiłek bez makro" and use "ok."; note "Bez makro porcja to 1, a suma dnia jest niepełna." + *Uzupełnij* (opens R3 at *Produkty*). | Plan-Edge |

### Rules shown on the boards
- **Portion** for a person with a target = slot share × target ÷ recipe kcal per serving, shown with one decimal ("1,2"). Without a target or without macros it is 1. Total servings for M9 = the sum over people.
- **"ok."** on a day total whenever any meal in it is estimated or has no macros.
- **Accent use** stays as in A: selected day ring and slot tiles, active tab, "w domu" tags; warnings are outlined, never accent-filled.
- **No new components**: everything is a Leaflet card, group row, chip, sheet, or `.week`; the 4-slot tab bar is 330 px.

### Open questions (decide before M8 code)
1. **Portion rounding:** one decimal ("1,2 porcji") as drawn, or kitchen-friendly quarters ("1¼")? Quarters are easier to cook but miss the kcal target by up to ~10%.
2. **Guests:** a normal person you add and delete later, or a *Gość* flag that keeps them out of the "everyone" default (as drawn in V6)? The flag needs one boolean on `meal_people`.
3. **Staples in M9:** a fixed list (sól, pieprz, oliwa, cukier, mąka…) or a per-product "zawsze w domu" switch in the pantry? The switch is more accurate but adds UI to P2.
4. **Past days:** may the range include past days (for copying a good day), or only today onward?
5. **Copy a day / repeat a meal:** V2 has *Kopiuj dzień* and V10 *Powtórz jutro*; is "repeat for the next 2 days" (the dietitian's rule) a separate action or the same one used twice?

