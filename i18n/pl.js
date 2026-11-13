// Polish UI strings. Keys are English; every visible string in the app comes from here.
// UX copy rules (DESIGN.md §3): counts as 3/6, 1–2 word labels, no brackets, no middle dot,
// buttons say the result, placeholders name the action.
// Plural forms: [one, few, many] picked by t() in js/i18n.js.

export default {
  app_name: "Kuchnia",
  app_tagline: "Lista zakupów, spiżarnia i przepisy. Wspólne, na dwóch telefonach.",

  // Tabs
  tab_list: "Lista",
  tab_pantry: "Spiżarnia",
  tab_recipes: "Przepisy",
  tabs_label: "Sekcje",

  // Common
  settings: "Ustawienia",
  close: "Zamknij",
  save: "Zapisz",
  cancel: "Anuluj",
  undo: "Cofnij",
  back: "Wstecz",
  working: "Chwila…",
  retry: "Spróbuj ponownie",
  offline: "Bez połączenia",
  offline_hint: "Zmiany pojawią się, gdy wróci sieć",

  // Demo mode
  demo_banner: "Przykładowe dane, nic się nie zapisuje",
  demo_exit: "Wyjdź",
  demo_open: "Zobacz przykład",

  // O1: sign in / sign up / reset
  auth_signin: "Zaloguj się",
  auth_signup: "Załóż konto",
  auth_email: "E-mail",
  auth_email_ph: "ty@przyklad.pl",
  auth_password: "Hasło",
  auth_password_new: "Nowe hasło",
  auth_password_hint: "Co najmniej 6 znaków",
  auth_forgot: "Nie pamiętasz hasła?",
  auth_reset_send: "Wyślij link do zmiany hasła",
  auth_reset_sent: "Wysłaliśmy link. Sprawdź skrzynkę.",
  auth_reset_title: "Nowe hasło",
  auth_reset_lead: "Wpisz hasło, którym będziesz się logować.",
  auth_reset_save: "Zapisz hasło",
  auth_confirm_sent: "Konto założone. Kliknij link w mailu, potem zaloguj się.",
  auth_back_to_signin: "Wróć do logowania",
  auth_err_fill: "Wpisz e-mail i hasło",
  auth_err_email: "Wpisz e-mail",
  auth_err_short: "Hasło musi mieć co najmniej 6 znaków",
  auth_err_login: "Zły e-mail lub hasło",
  auth_err_exists: "To konto już istnieje. Zaloguj się.",
  auth_err_unconfirmed: "Najpierw kliknij link w mailu",
  auth_err_rate: "Za dużo prób. Spróbuj za chwilę.",
  auth_err_closed: "Zakładanie kont jest wyłączone",
  auth_err_weak: "Hasło jest za słabe",
  auth_err_link: "Link wygasł. Wyślij nowy.",

  // O2: household
  hh_step: "Krok 2/2",
  hh_title: "Twoja kuchnia",
  hh_lead: "Wszystko jest wspólne. Oboje możecie wszystko edytować.",
  hh_create_title: "Załóż nową",
  hh_create_lead: "Potem wyślesz kod drugiej osobie.",
  hh_name: "Nazwa",
  hh_name_default: "Nasza kuchnia",
  hh_create: "Załóż kuchnię",
  hh_or: "albo",
  hh_join_title: "Dołącz kodem",
  hh_code: "Kod zaproszenia",
  hh_code_ph: "ABCD-1234",
  hh_join: "Dołącz",
  hh_err_code_empty: "Wpisz kod",

  // RPC error codes (supabase/schema.sql §7)
  err_NOT_SIGNED_IN: "Zaloguj się ponownie",
  err_NO_HOUSEHOLD: "Najpierw załóż kuchnię albo dołącz do niej",
  err_ALREADY_IN_HOUSEHOLD: "Należysz już do innej kuchni",
  err_BAD_NAME: "Nazwa musi mieć od 1 do 60 znaków",
  err_BAD_CODE: "Nie ma kuchni z tym kodem",
  err_BAD_SERVINGS: "Porcje od 1 do 100",
  err_NOT_FOUND: "Tego już nie ma",
  err_generic: "Coś poszło nie tak",

  // Boot / failure screens
  boot_offline_title: "Brak połączenia",
  boot_offline_lead: "Nie udało się wczytać aplikacji. Sprawdź internet.",
  boot_setup_title: "Brak konfiguracji",
  boot_setup_lead: "Brakuje pliku config.js z adresem bazy.",
  boot_db_title: "Baza nie odpowiada",
  boot_db_lead: "Nie udało się wczytać danych.",

  // Toasts
  toast_not_saved: "Bez połączenia, ta zmiana się nie zapisała",
  toast_copied: "Kod skopiowany",
  toast_new_code: "Nowy kod gotowy",
  toast_renamed: "Nazwa zmieniona",
  toast_deleted: "Usunięto „{name}”",

  // S1: settings
  set_household_name: "Nazwa kuchni",
  set_invite_code: "Kod zaproszenia",
  set_share: "Udostępnij",
  set_new_code: "Nowy kod",
  set_new_code_lead: "Stary kod przestanie działać.",
  set_new_code_make: "Utwórz nowy kod",
  set_share_text: "Dołącz do mojej kuchni w aplikacji Kuchnia. Kod: {code}",
  set_members: "Osoby",
  set_member_you: "ty",
  set_member_since: "od {date}",
  set_theme: "Motyw",
  set_theme_auto: "Auto",
  set_theme_light: "Jasny",
  set_theme_dark: "Ciemny",
  set_accent: "Kolor akcentu",
  set_categories: "Kategorie i kolejność",
  set_categories_sub: "Jak alejki w sklepie",
  set_categories_soon: "Zmiana kolejności wkrótce",
  set_signout: "Wyloguj się",
  set_demo_exit: "Wyjdź z przykładu",
  set_rename_title: "Nazwa kuchni",

  // Accent swatch names (keys match household_settings.accent)
  accent_matcha: "Matcha",
  accent_tomato: "Pomidor",
  accent_apricot: "Morela",
  accent_lavender: "Lawenda",
  accent_mint: "Mięta",
  accent_sunflower: "Słonecznik",

  // Shopping list (placeholder until M3)
  list_title: "Lista zakupów",
  list_to_buy: "{n} do kupienia",
  list_add: "Dodaj produkt",
  list_add_go: "Dodaj",
  list_no_category: "Inne",
  list_bought: "Kupione",
  list_empty_title: "Wszystko kupione",
  list_empty_tip: "Ilość wpisz po nazwie: mleko 2 l",
  list_tick: "Odhacz",

  // Pantry (placeholder until M4)
  pantry_title: "Spiżarnia",
  pantry_count: ["{n} produkt", "{n} produkty", "{n} produktów"],
  pantry_search: "Szukaj w spiżarni",
  pantry_all: "Wszystko",
  pantry_soon: "Zużyj wkrótce",
  pantry_low: "Mało",
  pantry_until: "do {date}",
  days: ["{n} dzień", "{n} dni", "{n} dni"],
  today: "dziś",
  expired: "po terminie",
  month_end: "do końca mies.",

  // Recipes (placeholder until M5)
  recipes_title: "Przepisy",
  recipes_count: ["{n} przepis", "{n} przepisy", "{n} przepisów"],
  recipes_all: "Wszystkie",
  recipes_at_home: "{have}/{total} w domu",
  recipe_ingredients: "Składniki",
  minutes: "{n} min",
  meal_breakfast: "Śniadanie",
  meal_lunch: "Obiad",
  meal_dinner: "Kolacja",
  meal_snack: "Przekąska",

  // Short month names for dates ("20 lis", "lis 2026")
  months_short: ["sty", "lut", "mar", "kwi", "maj", "cze", "lip", "sie", "wrz", "paź", "lis", "gru"]
};
