// R4: cooking mode, full screen without the tab bar. "Krok 2/5" with progress segments (tap one to
// jump), the step in big type, the ingredients this step mentions (scaled to the servings picked in
// the recipe view), a timer for steps that have one, and big Wstecz / Dalej. The screen stays on
// (Screen Wake Lock) while this view is open; swiping or the arrow keys also change the step.
// Route: #cook/<recipe id>/<servings>.
import { t, fmtAmount } from "../i18n.js";
import { esc, icon, toast } from "../ui.js";
import { byId } from "../store.js";
import { registerView, on } from "../shell.js";
import { ingredientsOf, stepsOf, scaled, stepIngredients, haveIt } from "../recipes-data.js";
import { nameKey } from "../parse.js";

let cur = { id: null, i: 0, servings: 2 };
// One timer at a time; it keeps running when you move to another step.
let timer = null; // { id, step, total, left, endsAt (ms) | null, done }
let tick = 0;
let wake = null;
let keyHandler = null;
let visHandler = null;

const mmss = (sec) => {
  sec = Math.max(0, Math.ceil(sec));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return (h ? h + ":" + String(m).padStart(2, "0") : m) + ":" + String(s).padStart(2, "0");
};
const leftNow = () => (timer.endsAt ? (timer.endsAt - Date.now()) / 1000 : timer.left);

// ---------------------------------------------------------------- wake lock
async function lockScreen(root) {
  if (!("wakeLock" in navigator) || document.hidden) return paintWake(root);
  try {
    wake = await navigator.wakeLock.request("screen");
    wake.addEventListener("release", () => { wake = null; paintWake(root); });
  } catch (e) { wake = null; }
  paintWake(root);
}
function paintWake(root) {
  const el = root.querySelector("[data-wake]");
  if (el) el.hidden = !wake;
}

// ---------------------------------------------------------------- sound at the end of a timer
let audio = null;
function unlockAudio() {
  try {
    const A = window.AudioContext || window.webkitAudioContext;
    if (!A) return;
    if (!audio) audio = new A();
    if (audio.state === "suspended") audio.resume();
  } catch (e) { audio = null; }
}
function beep() {
  if (!audio) return;
  try {
    const now = audio.currentTime;
    [0, 0.35, 0.7].forEach((d) => {
      const o = audio.createOscillator(), g = audio.createGain();
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.0001, now + d);
      g.gain.exponentialRampToValueAtTime(0.25, now + d + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, now + d + 0.25);
      o.connect(g).connect(audio.destination);
      o.start(now + d);
      o.stop(now + d + 0.3);
    });
  } catch (e) { /* no sound: the vibration and the toast still tell */ }
}

// ---------------------------------------------------------------- mount and paint
function mount(root, [id, servings]) {
  const r = byId("recipes", id);
  if (!r) { location.replace("#recipes"); return; }
  if (cur.id !== id) cur = { id, i: 0, servings: Number(servings) || r.servings || 2 };
  else cur.servings = Number(servings) || cur.servings;
  root.innerHTML =
    '<div class="cook">' +
    '<div class="cook-top"><button type="button" class="round" data-act="cook-close" aria-label="' + esc(t("close")) + '">' + icon("plus", "x") + "</button>" +
    '<div class="cook-head"><div class="eyebrow" data-count></div><div class="cook-name" data-name></div></div>' +
    '<span class="wake" data-wake hidden>' + icon("sun") + esc(t("cook_awake")) + "</span></div>" +
    '<div class="segs" data-segs role="group" aria-label="' + esc(t("recipe_steps")) + '"></div>' +
    '<button type="button" class="pill other" data-other hidden></button>' +
    '<div class="cook-body" data-body aria-live="polite"></div>' +
    '<div class="cook-nav"><button type="button" class="btn outline" data-prev>' + icon("back") + esc(t("back")) + "</button>" +
    '<button type="button" class="btn black" data-next></button></div></div>';

  root.querySelector("[data-segs]").addEventListener("click", (e) => {
    const b = e.target.closest("[data-seg]");
    if (b) goStep(root, Number(b.dataset.seg));
  });
  root.querySelector("[data-prev]").addEventListener("click", () => goStep(root, cur.i - 1));
  root.querySelector("[data-next]").addEventListener("click", () => {
    if (cur.i >= stepsOf(cur.id).length - 1) return finish();
    goStep(root, cur.i + 1);
  });
  root.querySelector("[data-other]").addEventListener("click", () => { if (timer) goStep(root, timer.step); });
  root.querySelector("[data-body]").addEventListener("click", (e) => {
    const b = e.target.closest("[data-timer]");
    if (!b) return;
    unlockAudio();
    const act = b.dataset.timer;
    const st = stepsOf(cur.id)[cur.i];
    if (act === "start") {
      if (!timer || timer.step !== cur.i || timer.id !== cur.id || timer.done) {
        timer = { id: cur.id, step: cur.i, total: st.timerMinutes * 60, left: st.timerMinutes * 60, endsAt: null, done: false };
      }
      timer.endsAt = Date.now() + timer.left * 1000;
    } else if (act === "pause" && timer) {
      timer.left = leftNow();
      timer.endsAt = null;
    } else if (act === "reset") {
      timer = null;
    }
    paintTimer(root);
    const again = root.querySelector('[data-body] [data-timer]');
    if (again) again.focus({ preventScroll: true });
  });

  // Swipe left/right on the step to move.
  let sx = 0, sy = 0, swiping = false;
  const body = root.querySelector("[data-body]");
  body.addEventListener("pointerdown", (e) => { if (e.target.closest("button")) return; sx = e.clientX; sy = e.clientY; swiping = true; });
  body.addEventListener("pointerup", (e) => {
    if (!swiping) return;
    swiping = false;
    const dx = e.clientX - sx, dy = e.clientY - sy;
    if (Math.abs(dx) > 60 && Math.abs(dy) < 50) goStep(root, cur.i + (dx < 0 ? 1 : -1));
  });
  body.addEventListener("pointercancel", () => { swiping = false; });

  keyHandler = (e) => {
    if (document.body.classList.contains("sheet-open") || e.target.closest("input,textarea")) return;
    if (e.key === "ArrowRight") goStep(root, cur.i + 1);
    if (e.key === "ArrowLeft") goStep(root, cur.i - 1);
  };
  document.addEventListener("keydown", keyHandler);
  visHandler = () => { if (!document.hidden) { lockScreen(root); paintTimer(root); } };
  document.addEventListener("visibilitychange", visHandler);
  clearInterval(tick);
  tick = setInterval(() => paintTimer(root), 250);

  paint(root);
  lockScreen(root);
}

function unmount() {
  clearInterval(tick);
  tick = 0;
  if (keyHandler) document.removeEventListener("keydown", keyHandler);
  if (visHandler) document.removeEventListener("visibilitychange", visHandler);
  keyHandler = visHandler = null;
  if (wake) { wake.release().catch(() => {}); wake = null; }
  timer = null; // leaving cooking mode stops the timer (there is nothing to show it elsewhere)
}

function goStep(root, i) {
  const n = stepsOf(cur.id).length;
  if (i < 0 || i >= n || i === cur.i) return;
  cur.i = i;
  paint(root);
  window.scrollTo(0, 0);
}

function finish() {
  if (history.length > 1) history.back();
  else location.replace("#recipe/" + cur.id);
}

const setHtml = (el, html) => { if (el && el._h !== html) { el._h = html; el.innerHTML = html; } };

function paint(root) {
  const r = byId("recipes", cur.id);
  const steps = r ? stepsOf(cur.id) : [];
  if (!r || !steps.length) { location.replace(r ? "#recipe/" + cur.id : "#recipes"); return; }
  if (cur.i >= steps.length) cur.i = steps.length - 1;
  if (timer && (timer.id !== cur.id || timer.step >= steps.length)) timer = null;
  const st = steps[cur.i];
  const count = t("cook_step", { n: cur.i + 1, total: steps.length });
  const countEl = root.querySelector("[data-count]");
  if (countEl.textContent !== count) countEl.textContent = count;
  const nameEl = root.querySelector("[data-name]");
  if (nameEl.textContent !== r.title) nameEl.textContent = r.title;

  setHtml(root.querySelector("[data-segs]"), steps.map((s, n) =>
    '<button type="button" data-seg="' + n + '" class="' + (n < cur.i ? "done" : n === cur.i ? "now" : "") + '" aria-label="' + esc(t("cook_step", { n: n + 1, total: steps.length })) + '"' +
    (n === cur.i ? ' aria-current="step"' : "") + "></button>").join(""));

  const ings = stepIngredients(st, ingredientsOf(cur.id));
  setHtml(root.querySelector("[data-body]"),
    '<p class="cook-text">' + esc(st.text) + "</p>" +
    (ings.length ? '<div class="group ing cook-ings">' + ings.map((i) => {
      const have = haveIt(i.nameKey || nameKey(i.name));
      return '<div class="rowbtn"><span class="ic ' + (have ? "have" : "miss") + '" role="img" aria-label="' + esc(t(have ? "recipe_have" : "recipe_missing")) + '">' + (have ? icon("check") : "") + "</span>" +
        '<span class="nm">' + esc(i.name) + (i.note ? '<span class="sub">' + esc(i.note) + "</span>" : "") + '</span><span class="val">' + esc(fmtAmount(scaled(i.amount, r, cur.servings), i.unit)) + "</span></div>";
    }).join("") + "</div>" : "") +
    '<div data-timerbox></div>');
  const tb = root.querySelector("[data-timerbox]");
  tb._h = null;
  tb._shape = null;

  root.querySelector("[data-prev]").disabled = cur.i === 0;
  const next = root.querySelector("[data-next]");
  const last = cur.i === steps.length - 1;
  const nextHtml = esc(t(last ? "done" : "cook_next")) + icon(last ? "check" : "right");
  if (next._h !== nextHtml) { next._h = nextHtml; next.innerHTML = nextHtml; }
  paintTimer(root);
}

function paintTimer(root) {
  const box = root.querySelector("[data-timerbox]");
  const other = root.querySelector("[data-other]");
  if (!box || !other) return;
  const steps = stepsOf(cur.id);
  const st = steps[cur.i];
  if (timer && !timer.done && timer.endsAt && leftNow() <= 0) {
    timer.done = true;
    timer.endsAt = null;
    timer.left = 0;
    if (navigator.vibrate) navigator.vibrate([300, 150, 300, 150, 300]);
    beep();
    toast(t("cook_timer_done", { n: timer.step + 1 }), { ms: 6000 });
  }
  // The timer of another step, as a pill under the segments.
  if (timer && timer.step !== cur.i) {
    const txt = t("cook_step_short", { n: timer.step + 1 }) + ", " + (timer.done ? t("cook_timer_end") : mmss(leftNow()));
    if (other.textContent !== txt) other.textContent = txt;
    other.hidden = false;
    other.classList.toggle("ring", timer.done);
  } else other.hidden = true;

  if (!st || !st.timerMinutes) { box._shape = null; setHtml(box, ""); return; }
  const mine = timer && timer.step === cur.i ? timer : null;
  const running = !!(mine && mine.endsAt);
  const done = !!(mine && mine.done);
  const left = mine ? leftNow() : st.timerMinutes * 60;
  const btn = running
    ? '<button type="button" class="round big" data-timer="pause" aria-label="' + esc(t("cook_pause")) + '">' + icon("pause") + "</button>"
    : '<button type="button" class="round big" data-timer="start" aria-label="' + esc(t(done ? "cook_again" : "cook_start")) + '">' + icon(done ? "refresh" : "play") + "</button>";
  const reset = mine && !done && !running ? '<button type="button" class="link" data-timer="reset">' + esc(t("cook_reset")) + "</button>" : "";
  // While only the time changes, update just the digits (keeps the button under the finger).
  const shape = cur.i + "|" + running + "|" + done + "|" + !!reset;
  const tv = box.querySelector(".tv");
  if (box._shape === shape && tv) {
    const txt = done ? t("cook_timer_end") : mmss(left);
    if (tv.textContent !== txt) tv.textContent = txt;
    return;
  }
  box._shape = shape;
  setHtml(box, '<div class="timer' + (running ? " on" : "") + (done ? " end" : "") + '">' + icon("timer") +
    '<span class="tv" role="timer">' + esc(done ? t("cook_timer_end") : mmss(left)) + "</span>" + reset + btn + "</div>");
}

registerView("cook", {
  tab: false,
  mount,
  unmount,
  update(root) { paint(root); }
});

on({ "cook-close": () => finish() });
