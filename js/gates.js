// Full-screen gates shown instead of the app: O1 sign in / sign up / reset password, O2 create or
// join a household, and the boot error screens (no config, no network, database error).
import { t } from "./i18n.js";
import { $, esc, icon } from "./ui.js";
import { errorText } from "./store.js";

let ctx = null; // { backend, onSignedIn(user), onHousehold(), signOut() }
let authState = { mode: "signin", email: "", err: "", note: "" };

export function initGates(c) { ctx = c; }

function show(html) {
  document.body.classList.add("gate");
  $("app").hidden = true;
  $("tabbar").hidden = true;
  $("gate").hidden = false;
  $("gate").innerHTML = '<div class="app"><div class="gate">' + html + "</div></div>";
  const first = $("gate").querySelector("[autofocus]");
  if (first && matchMedia("(hover: hover)").matches) first.focus();
}

export function hideGates() {
  document.body.classList.remove("gate");
  $("gate").hidden = true;
  $("gate").innerHTML = "";
  $("app").hidden = false;
  $("tabbar").hidden = false;
}

const msgs = (err, note) =>
  (err ? '<div class="msg" role="alert">' + esc(err) + "</div>" : "") +
  (note ? '<div class="msg ok" role="status">' + esc(note) + "</div>" : "");

const logo = () => '<div class="logo rise" aria-hidden="true">' + icon("pot") + "</div>";

function busy(btn) {
  btn.disabled = true;
  btn.dataset.label = btn.textContent;
  btn.textContent = t("working");
}

// ---------------------------------------------------------------------------
// O1: sign in / sign up (segmented), forgot password
// ---------------------------------------------------------------------------
export function authGate(mode = authState.mode, err = "", note = "") {
  authState = { ...authState, mode, err, note };
  const up = mode === "signup";
  show(
    logo() +
    '<h1 class="big rise" style="--d:40ms">' + esc(t("app_name")) + "</h1>" +
    '<p class="lead rise" style="--d:80ms">' + esc(t("app_tagline")) + "</p>" +
    '<div class="seg rise" style="--d:120ms;margin-top:8px" role="group">' +
    '<button type="button" data-mode="signin" aria-pressed="' + !up + '">' + esc(t("auth_signin")) + "</button>" +
    '<button type="button" data-mode="signup" aria-pressed="' + up + '">' + esc(t("auth_signup")) + "</button></div>" +
    msgs(err, note) +
    '<form class="rise" style="--d:160ms" novalidate>' +
    '<div><label class="lbl" for="au-mail">' + esc(t("auth_email")) + '</label><input class="fld" id="au-mail" name="email" type="email" autocomplete="username" inputmode="email" autocapitalize="off" spellcheck="false" placeholder="' + esc(t("auth_email_ph")) + '" value="' + esc(authState.email) + '"' + (authState.email ? "" : " autofocus") + "></div>" +
    '<div><label class="lbl" for="au-pass">' + esc(t("auth_password")) + '</label><input class="fld" id="au-pass" name="password" type="password" autocomplete="' + (up ? "new-password" : "current-password") + '" placeholder="' + esc(up ? t("auth_password_hint") : "••••••••") + '"' + (authState.email ? " autofocus" : "") + "></div>" +
    '<button class="btn black wide" type="submit">' + esc(t(up ? "auth_signup" : "auth_signin")) + "</button></form>" +
    (up ? "" : '<button type="button" class="link" data-forgot>' + esc(t("auth_forgot")) + "</button>") +
    '<button type="button" class="link" data-demo style="margin-top:auto">' + esc(t("demo_open")) + "</button>"
  );
  const g = $("gate");
  g.querySelectorAll("[data-mode]").forEach((b) => b.addEventListener("click", () => {
    authState.email = g.querySelector("#au-mail").value.trim();
    authGate(b.dataset.mode);
  }));
  g.querySelector("[data-demo]").addEventListener("click", () => { location.href = location.pathname + "?demo"; });
  const forgot = g.querySelector("[data-forgot]");
  if (forgot) forgot.addEventListener("click", () => sendReset(forgot));
  g.querySelector("form").addEventListener("submit", (e) => { e.preventDefault(); submitAuth(e.target, up); });
}

async function submitAuth(form, up) {
  const email = form.email.value.trim();
  const password = form.password.value;
  authState.email = email;
  const mode = up ? "signup" : "signin";
  if (!email || !password) return authGate(mode, t("auth_err_fill"));
  if (up && password.length < 6) return authGate(mode, t("auth_err_short"));
  busy(form.querySelector("[type=submit]"));
  try {
    const res = up ? await ctx.backend.signUp(email, password) : await ctx.backend.signIn(email, password);
    if (res.error) throw res.error;
    if (!res.data.session) return authGate("signin", "", t("auth_confirm_sent")); // e-mail confirmation is on
    await ctx.onSignedIn(res.data.session.user);
  } catch (e) {
    authGate(mode, authError(e));
  }
}

async function sendReset(btn) {
  const email = $("au-mail").value.trim();
  authState.email = email;
  if (!email) return authGate("signin", t("auth_err_email"));
  busy(btn);
  const { error } = await ctx.backend.sendReset(email);
  if (error) return authGate("signin", authError(error));
  authGate("signin", "", t("auth_reset_sent"));
}

// Supabase Auth messages → Polish.
export function authError(e) {
  const m = String((e && e.message) || e || "").toLowerCase();
  if ((e && e.status === 429) || m.includes("rate limit")) return t("auth_err_rate");
  if (m.includes("invalid login")) return t("auth_err_login");
  if (m.includes("already registered") || m.includes("already been registered")) return t("auth_err_exists");
  if (m.includes("not confirmed")) return t("auth_err_unconfirmed");
  if (m.includes("signups not allowed")) return t("auth_err_closed");
  if (m.includes("weak") || m.includes("at least")) return t("auth_err_weak");
  if (m.includes("expired") || m.includes("otp")) return t("auth_err_link");
  if (m.includes("fetch") || m.includes("network")) return t("toast_not_saved");
  return t("err_generic");
}

// ---------------------------------------------------------------------------
// Password recovery: the e-mail link signs the user in with a PASSWORD_RECOVERY event
// ---------------------------------------------------------------------------
export function resetGate(err = "") {
  show(
    logo() +
    '<h1 class="big">' + esc(t("auth_reset_title")) + "</h1>" +
    '<p class="lead">' + esc(t("auth_reset_lead")) + "</p>" + msgs(err) +
    '<form novalidate><div><label class="lbl" for="np-pass">' + esc(t("auth_password_new")) + '</label><input class="fld" id="np-pass" name="password" type="password" autocomplete="new-password" placeholder="' + esc(t("auth_password_hint")) + '" autofocus></div>' +
    '<button class="btn black wide" type="submit">' + esc(t("auth_reset_save")) + "</button></form>"
  );
  $("gate").querySelector("form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const p = e.target.password.value;
    if (p.length < 6) return resetGate(t("auth_err_short"));
    busy(e.target.querySelector("[type=submit]"));
    const { data, error } = await ctx.backend.setPassword(p);
    if (error) return resetGate(authError(error));
    await ctx.onSignedIn(data.user);
  });
}

// ---------------------------------------------------------------------------
// O2: create a household or join one with a code
// ---------------------------------------------------------------------------
export function householdGate(err = "", errFor = "") {
  const errHtml = (k) => (err && errFor === k ? msgs(err) : "");
  show(
    '<div><div class="eyebrow">' + esc(t("hh_step")) + '</div><h1 class="ttl">' + esc(t("hh_title")) + "</h1></div>" +
    '<p class="lead">' + esc(t("hh_lead")) + "</p>" +
    '<form class="opt" data-create novalidate><h2>' + esc(t("hh_create_title")) + "</h2><p>" + esc(t("hh_create_lead")) + "</p>" +
    '<label class="lbl" for="hh-name">' + esc(t("hh_name")) + '</label><input class="fld on-soft" id="hh-name" name="name" maxlength="60" autocomplete="off" value="' + esc(t("hh_name_default")) + '">' +
    errHtml("create") + '<button class="btn black wide" type="submit">' + esc(t("hh_create")) + "</button></form>" +
    '<div class="or">' + esc(t("hh_or")) + "</div>" +
    '<form class="opt" data-join novalidate><h2>' + esc(t("hh_join_title")) + "</h2>" +
    '<label class="lbl" for="hh-code">' + esc(t("hh_code")) + '</label><input class="fld code on-soft" id="hh-code" name="code" maxlength="12" autocomplete="off" autocapitalize="characters" spellcheck="false" inputmode="text" placeholder="' + esc(t("hh_code_ph")) + '">' +
    errHtml("join") + '<button class="btn wide on-soft-btn" type="submit">' + esc(t("hh_join")) + "</button></form>" +
    '<button type="button" class="link" data-signout>' + esc(t("set_signout")) + "</button>"
  );
  const g = $("gate");
  g.querySelector("[data-create]").addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = e.target.name.value.trim();
    if (!name) return householdGate(t("err_BAD_NAME"), "create");
    busy(e.target.querySelector("[type=submit]"));
    try { await ctx.backend.createHousehold(name); await ctx.onHousehold(); }
    catch (err2) { householdGate(errorText(err2), "create"); }
  });
  g.querySelector("[data-join]").addEventListener("submit", async (e) => {
    e.preventDefault();
    const code = e.target.code.value.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
    if (!code) return householdGate(t("hh_err_code_empty"), "join");
    busy(e.target.querySelector("[type=submit]"));
    try { await ctx.backend.joinHousehold(code); await ctx.onHousehold(); }
    catch (err2) { householdGate(errorText(err2), "join"); }
  });
  g.querySelector("[data-signout]").addEventListener("click", () => ctx.signOut());
}

// ---------------------------------------------------------------------------
// Boot errors
// ---------------------------------------------------------------------------
export function errorGate(kind, detail = "") {
  // kind: "setup" (no config.js), "offline" (supabase-js could not load), "db" (load failed)
  const title = t("boot_" + kind + "_title");
  const lead = t("boot_" + kind + "_lead");
  show(
    logo() + '<h1 class="big">' + esc(title) + '</h1><p class="lead">' + esc(lead) + "</p>" + msgs(detail) +
    (kind !== "setup" ? '<button type="button" class="btn black wide" data-retry>' + esc(t("retry")) + "</button>" : "") +
    (kind === "db" ? '<button type="button" class="link" data-signout>' + esc(t("set_signout")) + "</button>" : "") +
    '<button type="button" class="link" data-demo style="margin-top:auto">' + esc(t("demo_open")) + "</button>"
  );
  const g = $("gate");
  const retry = g.querySelector("[data-retry]");
  if (retry) retry.addEventListener("click", () => location.reload());
  const so = g.querySelector("[data-signout]");
  if (so) so.addEventListener("click", () => ctx && ctx.signOut());
  g.querySelector("[data-demo]").addEventListener("click", () => { location.href = location.pathname + "?demo"; });
}
