// S1: settings sheet, opened from the gear in the headers. Household name, invite code (share,
// new code), members, theme (per device), accent (per household), categories, sign out.
import { t, fmtDay } from "./i18n.js";
import { esc, icon, openSheet, toast, store, applyTheme, ACCENTS } from "./ui.js";
import { state, onChange, saveSettings, getBackend, errorText, changed } from "./store.js";

// Swatch colors for the picker (Matcha shows its per-theme value through --accent-matcha).
const SWATCH = { matcha: "var(--matcha)", tomato: "#FF8A65", apricot: "#FFB86B", lavender: "#B4A5FF", mint: "#7EDCC0", sunflower: "#FFD84D" };

export const formatCode = (c) => String(c || "").replace(/(.{4})(?=.)/g, "$1-");

let signOut = () => {};
export function initSettings(opts) { signOut = opts.signOut; }

function memberName(m) {
  const local = String(m.email || "").split("@")[0] || "?";
  return local.charAt(0).toUpperCase() + local.slice(1);
}

function body() {
  const hh = state.household || {};
  const theme = store("theme") || "auto";
  const accent = (state.settings && state.settings.accent) || "matcha";
  const me = state.user && state.user.id;
  const members = [...state.members].sort((a, b) => (a.userId === me ? -1 : b.userId === me ? 1 : 0));
  return (
    '<div class="group">' +
    '<button type="button" class="rowbtn" data-set="rename"><span class="ic">' + icon("home") + '</span><span class="nm">' + esc(hh.name) + '<span class="sub">' + esc(t("set_household_name")) + "</span></span>" + icon("right", "chev") + "</button>" +
    '<div class="rowbtn"><span class="ic">' + icon("key") + '</span><span class="nm"><span class="code">' + esc(formatCode(hh.code)) + '</span><span class="sub">' + esc(t("set_invite_code")) + "</span></span>" +
    '<button type="button" class="round" data-set="new-code" aria-label="' + esc(t("set_new_code")) + '" style="width:36px;height:36px;background:var(--bg)">' + icon("refresh") + "</button>" +
    '<button type="button" class="btn black mini" data-set="share">' + icon("share") + esc(t("set_share")) + "</button></div>" +
    "</div>" +
    '<div class="group" aria-label="' + esc(t("set_members")) + '">' +
    members.map((m) => '<div class="rowbtn"><span class="ic" aria-hidden="true">' + esc(memberName(m).charAt(0)) + '</span><span class="nm">' + esc(memberName(m)) +
      '<span class="sub">' + esc(m.userId === me ? t("set_member_you") : t("set_member_since", { date: fmtDay(m.joinedAt) })) + "</span></span></div>").join("") +
    "</div>" +
    '<div><span class="lbl">' + esc(t("set_theme")) + '</span><div class="seg" role="group" aria-label="' + esc(t("set_theme")) + '">' +
    ["auto", "light", "dark"].map((k) => '<button type="button" data-theme-pick="' + k + '" aria-pressed="' + (theme === k) + '">' + esc(t("set_theme_" + k)) + "</button>").join("") +
    "</div></div>" +
    '<div class="group"><span class="lbl">' + esc(t("set_accent")) + '</span><div class="swatches" role="group" aria-label="' + esc(t("set_accent")) + '">' +
    ACCENTS.map((k) => '<button type="button" data-accent-pick="' + k + '" style="--c:' + SWATCH[k] + '" aria-pressed="' + (accent === k) + '" aria-label="' + esc(t("accent_" + k)) + '">' + icon("check") + "</button>").join("") +
    "</div></div>" +
    '<div class="group"><button type="button" class="rowbtn" data-set="categories"><span class="ic">' + icon("list") + '</span><span class="nm">' + esc(t("set_categories")) + '<span class="sub">' + esc(t("set_categories_sub")) + "</span></span>" + icon("right", "chev") + "</button></div>" +
    '<button type="button" class="btn danger wide" data-set="signout">' + esc(t(state.demo ? "set_demo_exit" : "set_signout")) + "</button>"
  );
}

export function openSettings() {
  let off = null;
  openSheet({
    title: t("settings"),
    body: '<div class="stack" data-settings style="gap:12px">' + body() + "</div>",
    onMount(sheet, close) {
      const box = sheet.querySelector("[data-settings]");
      // Repaint keeps keyboard focus on the same control.
      const repaint = () => {
        const a = document.activeElement;
        const key = a && box.contains(a) ? ["data-theme-pick", "data-accent-pick", "data-set"].find((k) => a.hasAttribute(k)) : null;
        const sel = key ? "[" + key + '="' + a.getAttribute(key) + '"]' : null;
        box.innerHTML = body();
        if (sel) { const el = box.querySelector(sel); if (el) el.focus({ preventScroll: true }); }
      };
      off = onChange((c) => { if (c.has("all") || c.has("household") || c.has("members") || c.has("settings")) repaint(); });
      box.addEventListener("click", async (e) => {
        const th = e.target.closest("[data-theme-pick]");
        if (th) {
          const k = th.dataset.themePick;
          store("theme", k === "auto" ? null : k);
          applyTheme(k);
          repaint();
          return;
        }
        const ac = e.target.closest("[data-accent-pick]");
        if (ac) {
          if (state.settings && state.settings.accent !== ac.dataset.accentPick) saveSettings({ accent: ac.dataset.accentPick });
          return;
        }
        const b = e.target.closest("[data-set]");
        if (!b) return;
        const act = b.dataset.set;
        if (act === "share") return share();
        if (act === "rename") { close(true); return renameSheet(); }
        if (act === "new-code") { close(true); return newCodeSheet(); }
        if (act === "categories") { close(true); return categoriesSheet(); }
        if (act === "signout") return signOut();
      });
    },
    onClose() { if (off) off(); }
  });
}

async function share() {
  const code = formatCode(state.household.code);
  const text = t("set_share_text", { code });
  if (navigator.share) {
    try { await navigator.share({ title: t("app_name"), text }); return; }
    catch (e) { if (e && e.name === "AbortError") return; }
  }
  try { await navigator.clipboard.writeText(code); toast(t("toast_copied")); }
  catch (e) { toast(code); }
}

function renameSheet() {
  openSheet({
    title: t("set_rename_title"),
    body: '<form class="stack" novalidate style="gap:12px"><input class="fld" name="name" maxlength="60" autocomplete="off" aria-label="' + esc(t("set_rename_title")) + '" value="' + esc(state.household.name) + '" autofocus>' +
      '<button class="btn black wide" type="submit">' + esc(t("save")) + "</button></form>",
    onMount(sheet, close) {
      sheet.querySelector("form").addEventListener("submit", async (e) => {
        e.preventDefault();
        const name = e.target.name.value.trim();
        if (!name || name.length > 60) { toast(t("err_BAD_NAME")); return; }
        const before = state.household.name;
        state.household = { ...state.household, name }; // optimistic
        changed("household");
        close(true);
        openSettings();
        try { await getBackend().renameHousehold(name); toast(t("toast_renamed")); }
        catch (err) { state.household = { ...state.household, name: before }; changed("household"); toast(errorText(err, "toast_not_saved")); }
      });
    },
  });
}

function newCodeSheet() {
  openSheet({
    title: t("set_new_code"),
    body: "<p>" + esc(t("set_new_code_lead")) + '</p><div class="acts"><button type="button" class="btn" data-sheet-close>' + esc(t("cancel")) + '</button><button type="button" class="btn black" data-make>' + esc(t("set_new_code_make")) + "</button></div>",
    onMount(sheet, close) {
      sheet.querySelector("[data-make]").addEventListener("click", async (e) => {
        e.target.disabled = true;
        e.target.textContent = t("working");
        try {
          const code = await getBackend().newCode();
          state.household = { ...state.household, code };
          changed("household");
          close(true);
          openSettings();
          toast(t("toast_new_code"));
        } catch (err) { close(true); toast(errorText(err, "toast_not_saved")); }
      });
    }
  });
}

// Placeholder until M3: the categories in aisle order, read-only.
function categoriesSheet() {
  const cats = [...state.categories].sort((a, b) => a.position - b.position);
  openSheet({
    title: t("set_categories"),
    body: "<p>" + esc(t("set_categories_soon")) + '</p><div class="group">' +
      cats.map((c, i) => '<div class="rowbtn"><span class="ic num">' + (i + 1) + '</span><span class="nm">' + esc(c.name) + "</span></div>").join("") + "</div>",
    onClose: (replaced) => { if (!replaced) openSettings(); }
  });
}
