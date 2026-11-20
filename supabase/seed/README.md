# supabase/seed

Local working folder for one-off imports. **Everything here except this README is git-ignored**, because the inputs and the generated SQL contain personal data.

| File | Made by | What it is |
|---|---|---|
| `home_app_import.sql` | `tools/import_home_app.py <dump> --write` | The old home-app data (M6) |
| `dietitian-plan.html` | you: a saved copy of the dietitian meal-plan page | Input for the dietitian import |
| `dietitian_import.sql` | `tools/import_dietitian.py supabase/seed/dietitian-plan.html --write` | 28 dietitian recipes with macros (M7.2) |
| `dietitian_meals.json` | `tools/import_dietitian.py supabase/seed/dietitian-plan.html --json` | The same 28 meals for the accuracy check in `tests/macros.html` (M7.3) |

`supabase/foods.sql` is not here: it is public reference data and is committed.

Each generated SQL file has the invite code at the top (`<== EDIT`), runs in one transaction in the Supabase SQL Editor, and is safe to run twice.
