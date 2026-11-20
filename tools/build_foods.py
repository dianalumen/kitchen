"""Build the `foods` reference table (M7.3) from open nutrition data.

usage (in a virtualenv with `pip install xlrd`, needed only for the CIQUAL .xls):
  python3 -I tools/build_foods.py            # download if needed, check, print a summary
  python3 -I tools/build_foods.py --write    # also write supabase/foods.sql and js/foods-data.js

Every nutrition number comes from a source file; nothing below is a typed-in value. This file
only says WHICH source row stands for each food (USDA first, CIQUAL where USDA lacks the food),
the Polish name and aliases, and which of the source's portions gives the grams of a household
unit ("szt" = the source's "medium", …).

Sources (downloaded into tools/.cache/, which is git-ignored):
  * USDA FoodData Central, SR Legacy (April 2018) and Foundation Foods (2026-10-29), CSV.
    Public domain (CC0 1.0). https://fdc.nal.usda.gov/download-datasets
  * ANSES-CIQUAL 2020 French food composition table, English .xls.
    Licence Ouverte / Open Licence 2.0 (Etalab). https://ciqual.anses.fr/
    The file is checked against the SHA-1 published on data.gouv.fr; if ciqual.anses.fr is down,
    the Internet Archive's copy of the same URL is used (same checksum, so the same file).

Conventions of the generated rows (per 100 g of the food as bought or as named):
  * kcal: USDA "Energy (kcal)" (nutrient 1008); for Foundation foods without it the Atwater
    specific, then general factors (2048, 2047). CIQUAL: the EU 1169/2011 energy column; where
    CIQUAL leaves it empty, the same EU factors on CIQUAL's own values (4 protein, 4 carbs,
    9 fat, 2 fibre).
  * carbs: AVAILABLE carbohydrate, fibre not included, as on EU labels. USDA gives carbohydrate
    "by difference" (fibre included), so its fibre is subtracted; CIQUAL's carbohydrate column is
    already available carbohydrate.
  * CIQUAL values like "< 0,5" or "traces" count as 0; "-" (not measured) counts as 0 for fibre
    and fails the build for anything else.
  * units: grams of one household unit, from the source's portion data: szt, plaster, kromka,
    ząbek (the portion named per food), łyżka (tbsp), łyżeczka (tsp), szklanka (cup), and for
    liquids ml (from a cup, fl oz or litre portion). A food whose own source has no portions
    may borrow them from a named USDA row of the same kind (`units_from`). When the source gives
    only one of tbsp and tsp, the other follows from 1 tbsp = 3 tsp.
  * trace: salt, spices, dried and fresh herbs and water. An unknown amount of these ("szczypta",
    "do smaku") counts as nothing instead of "no data".
"""
import argparse, csv, hashlib, io, json, os, re, sys, urllib.request, zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..")
CACHE = os.path.join(HERE, ".cache")
SQL_OUT = os.path.join(ROOT, "supabase", "foods.sql")
JS_OUT = os.path.join(ROOT, "js", "foods-data.js")

USDA_SR = ("FoodData_Central_sr_legacy_food_csv_2018-04",
           "https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_sr_legacy_food_csv_2018-04.zip")
USDA_FF = ("FoodData_Central_foundation_food_csv_2026-10-29",
           "https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_foundation_food_csv_2026-10-29.zip")
CIQUAL_URL = "https://ciqual.anses.fr/cms/sites/default/files/inline-files/Table%20Ciqual%202020_ENG_2020%2007%2007.xls"
CIQUAL_ARCHIVE = "https://web.archive.org/web/2024id_/" + CIQUAL_URL
CIQUAL_SHA1 = "03b6d972f4acea115c3fdbc68a3c0408d3e396b3"   # published on data.gouv.fr
SOURCES_NOTE = ("USDA FoodData Central SR Legacy 2018-04 and Foundation Foods 2026-10-29 (CC0 1.0); "
                "ANSES-CIQUAL 2020 (Licence Ouverte 2.0)")


def F(id, name, aliases, src, trace=False, liquid=False, units_from=None, **units):
    """One food. src: 'sr:<fdc_id>', 'ff:<fdc_id>' or 'ciq:<alim_code>'. units: Polish unit -> the
    start of the source portion label that gives its grams, e.g. szt="medium"."""
    return dict(id=id, name=name, aliases=aliases, src=src, trace=trace, liquid=liquid,
                units_from=units_from, units=units)


# Order matters only for ties in the matcher (same alias length): earlier wins.
FOODS = [
    # --- eggs and dairy ------------------------------------------------------
    F("egg", "Jajko", ["jajka", "jaja", "jaja kurze", "jaja kurze całe", "jajko kurze", "jajo"], "sr:171287", szt="large"),
    F("milk-2", "Mleko 2%", ["mleko", "mleko krowie", "mleko 2%", "mleko 1,5%"], "sr:171267", liquid=True),
    F("milk-whole", "Mleko 3,2%", ["mleko 3,2%", "mleko pełne", "mleko pełnotłuste"], "sr:171265", liquid=True),
    F("milk-lactose-free", "Mleko bez laktozy", ["mleko bez laktozy", "mleko bez laktozy 1,5%", "mleko bez laktozy 2%"],
      "ciq:19060", liquid=True, units_from="sr:170872"),
    F("yogurt-plain", "Jogurt naturalny", ["jogurt", "jogurt naturalny", "jogurt bez laktozy", "jogurt naturalny bez laktozy"],
      "sr:170886", units_from="sr:171256"),
    F("yogurt-greek", "Jogurt grecki", ["jogurt grecki", "jogurt typu greckiego"], "sr:171304", units_from="sr:171256"),
    F("yogurt-plant", "Jogurt roślinny naturalny", ["jogurt roślinny", "jogurt kokosowy", "jogurt sojowy",
      "jogurt kokosowy z wapniem", "jogurt kokosowy naturalny"], "sr:175227", units_from="sr:171256"),
    F("kefir", "Kefir", ["kefir", "maślanka"], "sr:170904", liquid=True),
    F("cream-18", "Śmietanka 18%", ["śmietanka", "śmietanka 18%", "śmietanka do kawy", "śmietanka 12%"], "sr:170857", liquid=True),
    F("cream-30", "Śmietanka 30%", ["śmietanka 30%", "śmietanka kremówka", "kremówka", "śmietanka 36%"], "sr:170859", liquid=True),
    F("sour-cream", "Śmietana 12%", ["śmietana", "śmietana 12%", "śmietana kwaśna"], "sr:171256"),
    F("plant-cream", "Śmietanka roślinna", ["śmietanka ryżowa", "śmietanka sojowa", "śmietanka owsiana", "śmietanka roślinna"],
      "ciq:11214", liquid=True, units_from="sr:170857"),
    F("butter", "Masło", ["masło", "masło extra", "masło klarowane"], "sr:173430"),
    F("mozzarella", "Mozzarella", ["mozzarella", "ser mozzarella", "mozzarella light"], "sr:170847"),
    F("parmesan", "Parmezan", ["parmezan", "ser parmezan", "grana padano"], "sr:170848"),
    F("gouda", "Ser żółty", ["ser", "ser żółty", "ser gouda", "gouda", "ser edamski", "ser w plastrach", "ser tarty"], "sr:171241",
      units_from="ff:328637"),
    F("cheddar", "Cheddar", ["cheddar", "ser cheddar"], "sr:173414"),
    F("feta", "Feta", ["feta", "ser feta", "ser sałatkowy", "ser typu feta"], "sr:173420"),
    F("cottage", "Serek wiejski", ["serek wiejski", "twarożek ziarnisty", "serek ziarnisty"], "sr:172179"),
    F("cream-cheese", "Serek śmietankowy", ["serek śmietankowy", "serek kremowy", "ser kremowy", "philadelphia"], "sr:173418"),

    # --- meat and fish -------------------------------------------------------
    F("chicken-breast", "Pierś z kurczaka", ["kurczak", "pierś z kurczaka", "pierś kurczaka", "piersi kurczaka",
      "piersi z kurczaka", "filet z kurczaka", "filet z piersi kurczaka", "mięso z piersi kurczaka", "filety z kurczaka"],
      "sr:171077", szt="piece"),
    F("chicken-thigh", "Udko z kurczaka bez skóry", ["udko z kurczaka", "udka z kurczaka", "udko kurczaka", "filet z udka kurczaka",
      "filet z udka", "filety z udek", "mięso z udek kurczaka", "udziec z kurczaka"], "sr:173627", szt="thigh"),
    F("turkey-breast", "Pierś z indyka", ["indyk", "pierś z indyka", "pierś indyka", "filet z indyka", "mięso z piersi indyka",
      "filet z piersi indyka"], "sr:174515"),
    F("turkey-ham", "Szynka z indyka", ["szynka z indyka", "wędlina z indyka", "polędwica z indyka"], "sr:172941", plaster="slice"),
    F("ham", "Szynka", ["szynka", "szynka wieprzowa", "szynka gotowana", "wędlina"], "sr:173863", plaster="slice"),
    F("beef-ground", "Wołowina mielona", ["wołowina mielona", "mielona wołowina", "wołowina mielona z rostbefu",
      "mięso mielone wołowe", "wołowina"], "sr:174030"),
    F("pork-ground", "Mięso mielone", ["mięso mielone", "mielone mięso", "mielone", "mięso mielone wieprzowe",
      "mięso mielone wieprzowo wołowe"], "sr:167902"),
    F("pork-loin", "Schab", ["schab", "schab wieprzowy", "kotlet schabowy"], "sr:168286", szt="chop"),
    F("bacon", "Boczek", ["boczek", "boczek wędzony", "bekon"], "sr:168277", plaster="slice"),
    F("kielbasa", "Kiełbasa", ["kiełbasa", "kiełbasa wieprzowa", "kiełbasa śląska", "kiełbasa zwyczajna"], "sr:174577"),
    F("salmon", "Łosoś", ["łosoś", "łosoś świeży", "filet z łososia", "łososia"], "sr:175167"),
    F("cod", "Dorsz", ["dorsz", "filet z dorsza"], "sr:171955", szt="fillet"),
    F("tuna", "Tuńczyk w sosie własnym", ["tuńczyk", "tuńczyk w sosie własnym", "tuńczyk w puszce"], "sr:173709", units_from="ff:334194", szt="can drained"),
    F("shrimp", "Krewetki", ["krewetki", "krewetka", "krewetki królewskie"], "sr:175179", units_from="sr:174210", szt="medium"),

    # --- grains, bread, legumes ----------------------------------------------
    F("oats", "Płatki owsiane", ["płatki owsiane", "płatki owsiane górskie", "płatki owsiane błyskawiczne", "owies"], "sr:173904"),
    F("rice-white", "Ryż biały", ["ryż", "ryż biały", "ryż basmati", "ryż jaśminowy", "ryż długoziarnisty", "ryż do sushi"], "sr:169756"),
    F("rice-brown", "Ryż brązowy", ["ryż brązowy", "ryż pełnoziarnisty"], "sr:169703"),
    F("quinoa", "Komosa ryżowa", ["komosa", "komosa ryżowa", "quinoa"], "sr:168874"),
    F("buckwheat", "Kasza gryczana", ["kasza gryczana", "kasza gryczana niepalona", "kasza gryczana palona", "gryka"], "sr:170286"),
    F("millet", "Kasza jaglana", ["kasza jaglana", "jaglanka"], "sr:169702"),
    F("barley", "Kasza jęczmienna", ["kasza jęczmienna", "pęczak", "kasza pęczak", "kasza perłowa"], "sr:170284"),
    F("couscous", "Kuskus", ["kuskus", "kasza kuskus", "couscous"], "sr:169699"),
    F("bulgur", "Bulgur", ["bulgur", "kasza bulgur"], "sr:170688"),
    F("pasta", "Makaron pszenny", ["makaron", "makaron pszenny", "makaron spaghetti", "spaghetti", "penne", "makaron penne",
      "świderki", "makaron świderki", "tagliatelle", "makaron tagliatelle", "kokardki"], "sr:168927"),
    F("pasta-ww", "Makaron pełnoziarnisty", ["makaron pełnoziarnisty", "makaron razowy"], "sr:169738"),
    F("rice-noodles", "Makaron ryżowy", ["makaron ryżowy", "makaron vermicelli", "vermicelli", "makaron sojowy", "makaron do pad thai"],
      "sr:169742"),
    F("rice-paper", "Papier ryżowy", ["papier ryżowy", "papier ryżowy do spring rolls"], "sr:169714"),
    F("flour", "Mąka pszenna", ["mąka", "mąka pszenna", "mąka tortowa", "mąka typ 450", "mąka typ 650"], "sr:168894"),
    F("flour-spelt", "Mąka orkiszowa", ["mąka orkiszowa", "mąka orkiszowa pełnoziarnista"], "ff:2003587", units_from="sr:168894"),
    F("bread-white", "Chleb pszenny", ["chleb", "pieczywo", "chleb pszenny", "bułka", "bułka pszenna", "chleb tostowy", "bagietka"],
      "sr:174924", kromka="slice", szt="slice"),
    F("bread-ww", "Chleb pełnoziarnisty", ["chleb pełnoziarnisty", "chleb razowy", "chleb orkiszowy", "chleb graham",
      "chleb wieloziarnisty", "bułka pełnoziarnista"], "sr:172688", kromka="slice", szt="slice"),
    F("bread-rye", "Chleb żytni", ["chleb żytni", "chleb żytni razowy"], "sr:172684", kromka="slice, regular", szt="slice, regular"),
    F("tortilla-ww", "Tortilla pełnoziarnista", ["tortilla pełnoziarnista", "wrap pełnoziarnisty", "tortille pełnoziarniste"],
      "sr:174081", szt="tortilla"),
    F("tortilla", "Tortilla pszenna", ["tortilla", "tortille", "wrap", "wrapy", "placki tortilla", "tortilla pszenna"],
      "sr:175037", szt="tortilla"),
    F("crispbread", "Pieczywo chrupkie", ["pieczywo chrupkie", "pieczywo chrupkie żytnie", "wasa"], "sr:172739", szt="crispbread"),
    F("butter-cookies", "Herbatniki", ["herbatniki", "herbatnik", "ciastka maślane"], "sr:172819", szt="cookie"),
    F("lentils-red", "Soczewica czerwona", ["soczewica", "soczewica czerwona", "makaron z czerwonej soczewicy",
      "makaron z soczewicy", "makaron z soczewicy czerwonej"], "sr:174284"),
    F("kidney-beans", "Fasola czerwona z puszki", ["fasola czerwona", "fasola czerwona konserwowa", "fasola kidney",
      "czerwona fasola"], "sr:174285", units_from="sr:175195", szt="can drained"),
    F("white-beans", "Fasola biała z puszki", ["fasola biała", "fasola biała konserwowa", "biała fasola", "fasola"], "sr:175204", units_from="sr:174285", szt="can drained"),
    F("chickpeas", "Ciecierzyca z puszki", ["ciecierzyca", "cieciorka", "ciecierzyca konserwowa"], "sr:173800", szt="can drained"),
    F("tofu", "Tofu", ["tofu", "tofu naturalne"], "sr:172475"),
    F("hummus", "Hummus", ["hummus", "humus"], "sr:174289"),

    # --- vegetables ----------------------------------------------------------
    F("potato", "Ziemniaki", ["ziemniak", "ziemniaki", "kartofle", "młode ziemniaki"], "sr:170026", szt="potato small"),
    F("sweet-potato", "Batat", ["batat", "bataty", "słodki ziemniak", "słodkie ziemniaki"], "sr:168482", szt="sweetpotato"),
    F("carrot", "Marchew", ["marchew", "marchewka", "marchewki", "marchwi"], "sr:170393", szt="medium"),
    F("onion", "Cebula", ["cebula", "cebulka", "cebula biała", "cebula czerwona", "cebule"], "sr:170000", szt="medium"),
    F("spring-onion", "Dymka", ["dymka", "cebulka dymka", "cebula dymka", "szczypior"], "sr:170005", szt="medium"),
    F("chives", "Szczypiorek", ["szczypiorek"], "sr:169994", trace=True),
    F("garlic", "Czosnek", ["czosnek", "ząbek czosnku", "ząbki czosnku", "czosnek świeży"], "sr:169230", ząbek="clove"),
    F("leek", "Por", ["por", "pory"], "sr:169246", szt="leek"),
    F("celery", "Seler naciowy", ["seler naciowy", "selery naciowe", "łodyga selera"], "sr:169988", szt="stalk, medium"),
    F("celeriac", "Seler korzeniowy", ["seler", "seler korzeniowy"], "sr:170400"),
    F("broccoli", "Brokuł", ["brokuł", "brokuły", "brokułów", "różyczki brokuła"], "sr:170379", szt="bunch"),
    F("cauliflower", "Kalafior", ["kalafior", "różyczki kalafiora"], "sr:169986", szt="head medium"),
    F("cabbage", "Kapusta biała", ["kapusta", "kapusta biała", "kapusta włoska"], "sr:169975", szt="head, medium"),
    F("zucchini", "Cukinia", ["cukinia", "cukinie", "cukinii"], "sr:169291", szt="medium"),
    F("bell-pepper", "Papryka", ["papryka", "papryka czerwona", "papryka żółta", "papryka zielona", "papryki"],
      "sr:170108", szt="medium"),
    F("roasted-pepper", "Papryka pieczona ze słoika", ["papryka pieczona", "papryka pieczona ze słoika", "papryka marynowana",
      "papryka konserwowa", "papryka ze słoika"], "sr:168546"),
    F("tomato", "Pomidor", ["pomidor", "pomidory", "pomidor malinowy", "pomidory malinowe"], "sr:170457", szt="medium whole"),
    F("cherry-tomato", "Pomidorki koktajlowe", ["pomidorki koktajlowe", "pomidory koktajlowe", "pomidorki cherry",
      "pomidory cherry", "pomidorki"], "ff:321360", szt="tomatoes"),
    F("cucumber", "Ogórek", ["ogórek", "ogórki", "ogórek zielony", "ogórek szklarniowy", "ogórek gruntowy"], "sr:168409",
      szt="cucumber"),
    F("pickle-sour", "Ogórek kiszony", ["ogórek kiszony", "ogórki kiszone", "ogórka kiszonego"], "sr:169379", szt="medium"),
    F("pickle-vinegar", "Ogórek konserwowy", ["ogórek konserwowy", "ogórki konserwowe", "korniszony"], "ciq:11097",
      units_from="sr:169379", szt="medium"),
    F("lettuce-romaine", "Sałata rzymska", ["sałata rzymska", "rzymska"], "sr:169247"),
    F("lettuce-iceberg", "Sałata lodowa", ["sałata lodowa", "sałata", "mix sałat"], "sr:169248", szt="head, medium"),
    F("lettuce-butter", "Sałata masłowa", ["sałata masłowa"], "sr:168429", szt="head"),
    F("arugula", "Rukola", ["rukola", "rokietta"], "sr:169387"),
    F("spinach", "Szpinak", ["szpinak", "szpinak świeży", "baby szpinak", "młody szpinak", "szpinak baby"], "sr:168462"),
    F("spinach-frozen", "Szpinak mrożony", ["szpinak mrożony", "mrożony szpinak"], "sr:169287"),
    F("kale", "Jarmuż", ["jarmuż"], "sr:168421"),
    F("mushrooms", "Pieczarki", ["pieczarki", "pieczarka", "grzyby", "pieczarek"], "sr:169251", szt="medium"),
    F("green-beans", "Fasolka szparagowa", ["fasolka", "fasolka szparagowa", "fasolka szparagowa mrożona"], "sr:169961"),
    F("peas", "Groszek zielony", ["groszek", "groszek konserwowy", "groszek zielony", "zielony groszek"], "sr:170104"),
    F("peas-frozen", "Groszek mrożony", ["groszek mrożony", "mrożony groszek"], "sr:170016"),
    F("corn", "Kukurydza konserwowa", ["kukurydza", "kukurydza konserwowa", "kukurydza z puszki"], "sr:169214"),
    F("beets", "Buraki gotowane", ["burak", "buraki", "buraki gotowane", "buraczki", "burak gotowany"], "sr:169146", szt="beets"),
    F("squash", "Dynia", ["dynia", "dynia hokkaido", "dyni"], "sr:170489"),
    F("butternut", "Dynia piżmowa", ["dynia piżmowa", "dynia butternut"], "sr:169295"),
    F("eggplant", "Bakłażan", ["bakłażan", "oberżyna"], "sr:169228"),
    F("radish", "Rzodkiewka", ["rzodkiewka", "rzodkiewki"], "sr:169276", szt="medium"),
    F("mixed-veg", "Mieszanka warzyw mrożonych", ["mieszanka warzyw", "mieszanka warzyw na patelnię", "warzywa na patelnię",
      "warzywa mrożone", "mieszanka warzyw mrożonych"], "sr:170471"),
    F("sprouts", "Kiełki", ["kiełki", "kiełki brokuła", "kiełki lucerny", "kiełki rzodkiewki"], "sr:168384"),
    F("avocado", "Awokado", ["awokado"], "sr:171705", szt="avocado"),
    F("olives-black", "Oliwki czarne", ["oliwki", "oliwki czarne"], "sr:169094", szt="large"),
    F("olives-green", "Oliwki zielone", ["oliwki zielone"], "sr:169096", szt="olive"),
    F("nori", "Nori", ["nori", "glony nori", "arkusze nori", "wodorosty"], "sr:168458", szt="sheets"),
    F("tomato-paste", "Koncentrat pomidorowy", ["koncentrat pomidorowy", "koncentrat pomidorowy 30%"], "sr:170459"),
    F("passata", "Passata", ["passata", "passata pomidorowa", "przecier pomidorowy"], "sr:170460", liquid=True),
    F("canned-tomatoes", "Pomidory z puszki", ["pomidory z puszki", "pomidory w puszce", "pomidory krojone",
      "pomidory krojone z puszki"], "sr:170051", szt="can"),
    F("tomato-sauce", "Sos pomidorowy", ["sos pomidorowy", "sos do makaronu", "sos marinara"], "sr:171192", liquid=True,
      units_from="sr:171597"),
    F("bolognese", "Sos bolognese", ["sos bolognese", "sos bołoński", "sos boloński"], "ciq:11114", liquid=True,
      units_from="sr:171597"),
    F("curry-sauce", "Sos curry", ["sos curry", "tikka masala", "sos tikka masala"], "ciq:11132", liquid=True,
      units_from="sr:171597"),
    F("mushroom-sauce-mix", "Sos grzybowy w proszku", ["sos grzybowy", "sos grzybowy w proszku", "sos pieczeniowy"], "sr:171171"),

    # --- fruit ---------------------------------------------------------------
    F("banana", "Banan", ["banan", "banany", "banana"], "sr:173944", szt="medium"),
    F("apple", "Jabłko", ["jabłko", "jabłka"], "sr:171688", szt="medium"),
    F("pear", "Gruszka", ["gruszka", "gruszki"], "sr:169118", szt="medium"),
    F("orange", "Pomarańcza", ["pomarańcza", "pomarańcze"], "sr:169097", szt="fruit"),
    F("mandarin", "Mandarynka", ["mandarynka", "mandarynki", "klementynki", "klementynka"], "sr:169105", szt="medium"),
    F("lemon", "Cytryna", ["cytryna", "cytryny"], "sr:167746", szt="fruit (2-1/8"),
    F("lemon-juice", "Sok z cytryny", ["sok z cytryny", "sok cytrynowy", "sok z limonki"], "sr:167747", liquid=True,
      units_from="sr:167746"),
    F("strawberries", "Truskawki", ["truskawki", "truskawka"], "sr:167762"),
    F("strawberries-frozen", "Truskawki mrożone", ["truskawki mrożone", "mrożone truskawki"], "sr:168173"),
    F("blueberries", "Borówki", ["borówki", "borówki amerykańskie", "jagody"], "sr:171711"),
    F("blueberries-frozen", "Borówki mrożone", ["borówki mrożone", "jagody mrożone", "mrożone borówki"], "sr:173950"),
    F("raspberries", "Maliny", ["maliny", "malina"], "sr:167755"),
    F("raspberries-frozen", "Maliny mrożone", ["maliny mrożone", "mrożone maliny"], "sr:168209"),
    F("cherries-sour", "Wiśnie", ["wiśnie", "wiśnie mrożone", "wiśnia"], "sr:171718"),
    F("grapes", "Winogrona", ["winogrona", "winogrono"], "sr:174683"),
    F("kiwi", "Kiwi", ["kiwi"], "sr:168153", szt="fruit"),
    F("raisins", "Rodzynki", ["rodzynki"], "sr:168165"),
    F("dates", "Daktyle", ["daktyle", "daktyle suszone", "daktyle medjool"], "sr:168191", szt="date"),
    F("jam", "Dżem", ["dżem", "konfitura", "powidła", "dżem wiśniowy", "dżem truskawkowy", "dżem malinowy"], "sr:169641"),

    # --- nuts, seeds, fats, sauces, sweet ------------------------------------
    F("almonds", "Migdały", ["migdały", "migdał", "płatki migdałowe"], "sr:170567"),
    F("walnuts", "Orzechy włoskie", ["orzechy włoskie", "orzech włoski"], "sr:170187"),
    F("cashews", "Orzechy nerkowca", ["orzechy nerkowca", "nerkowce", "orzechy nerkowca bez soli"], "sr:170162"),
    F("hazelnuts", "Orzechy laskowe", ["orzechy laskowe", "orzech laskowy"], "sr:170581"),
    F("peanut-butter", "Masło orzechowe", ["masło orzechowe", "masło z orzeszków ziemnych", "pasta orzechowa"], "sr:172470"),
    F("tahini", "Tahini", ["tahini", "pasta sezamowa", "tahina"], "sr:170189"),
    F("sesame", "Sezam", ["sezam", "ziarna sezamu", "nasiona sezamu"], "sr:170150"),
    F("flaxseed", "Siemię lniane", ["siemię lniane", "siemię lniane mielone", "len mielony"], "sr:169414",
      łyżka="tbsp, whole", łyżeczka="tsp, whole"),
    F("chia", "Nasiona chia", ["chia", "nasiona chia"], "sr:170554", units_from="sr:169414",
      łyżka="tbsp, whole", łyżeczka="tsp, whole"),
    F("pumpkin-seeds", "Pestki dyni", ["pestki dyni", "pestki dyni łuskane", "dynia pestki", "dynia nasiona", "nasiona dyni"], "sr:170556"),
    F("sunflower-seeds", "Słonecznik", ["słonecznik", "pestki słonecznika", "słonecznik łuskany"], "sr:170562"),
    F("coconut-milk", "Mleczko kokosowe", ["mleczko kokosowe", "mleczko kokosowe 21%", "mleko kokosowe"], "sr:170173", liquid=True),
    F("olive-oil", "Oliwa z oliwek", ["oliwa", "oliwa z oliwek", "oliwa extra virgin"], "sr:171413", liquid=True),
    F("canola-oil", "Olej rzepakowy", ["olej", "olej rzepakowy", "olej roślinny"], "sr:172336", liquid=True),
    F("sunflower-oil", "Olej słonecznikowy", ["olej słonecznikowy"], "sr:171017", liquid=True),
    F("flax-oil", "Olej lniany", ["olej lniany"], "sr:167702", liquid=True),
    F("coconut-oil", "Olej kokosowy", ["olej kokosowy"], "sr:171412"),
    F("mayonnaise", "Majonez", ["majonez"], "sr:171009"),
    F("mustard", "Musztarda", ["musztarda", "musztarda sarepska", "musztarda dijon"], "sr:172234", łyżeczka="tsp"),
    F("ketchup", "Ketchup", ["ketchup"], "sr:168556"),
    F("vinegar", "Ocet", ["ocet", "ocet spirytusowy", "ocet ryżowy", "ocet winny", "ocet jabłkowy"], "sr:172237",
      trace=True, liquid=True),
    F("balsamic", "Ocet balsamiczny", ["ocet balsamiczny", "krem balsamiczny"], "sr:172241", liquid=True),
    F("soy-sauce", "Sos sojowy", ["sos sojowy", "tamari", "sos sojowy bezglutenowy"], "sr:174278", liquid=True),
    F("miso", "Pasta miso", ["miso", "pasta miso"], "sr:172442"),
    F("horseradish", "Chrzan", ["chrzan", "chrzan tarty"], "sr:173472"),
    F("honey", "Miód", ["miód"], "sr:169640"),
    F("maple-syrup", "Syrop klonowy", ["syrop klonowy"], "sr:169661", liquid=True),
    F("sugar", "Cukier", ["cukier", "cukier biały", "cukier trzcinowy"], "sr:169655"),
    F("dark-chocolate", "Czekolada gorzka", ["czekolada", "czekolada gorzka", "czekolada gorzka 70%", "czekolada gorzka 85%",
      "gorzka czekolada"], "sr:170273"),
    F("cocoa", "Kakao", ["kakao", "kakao naturalne", "kakao 11%"], "sr:169593"),
    F("rice-drink", "Napój ryżowy", ["napój ryżowy", "mleko ryżowe"], "sr:171942", liquid=True),
    F("soy-drink", "Napój sojowy", ["napój sojowy", "mleko sojowe"], "sr:172446", liquid=True),
    F("water", "Woda", ["woda", "wody", "woda przegotowana"], "sr:173647", trace=True, liquid=True),

    # --- salt, spices, herbs (trace) -----------------------------------------
    F("salt", "Sól", ["sól", "sól biała", "sól himalajska", "sól morska", "szczypta soli"], "sr:173468", trace=True),
    F("pepper", "Pieprz czarny", ["pieprz", "pieprz czarny", "pieprz czarny mielony", "pieprz mielony"], "sr:170931", trace=True,
      łyżeczka="tsp, ground", łyżka="tbsp, ground"),
    F("paprika", "Papryka słodka mielona", ["słodka papryka", "mielona słodka papryka", "papryka słodka mielona",
      "papryka mielona", "papryka wędzona", "mielona papryka wędzona", "papryka wędzona mielona", "papryka słodka"],
      "sr:171329", trace=True),
    F("chili", "Chili mielone", ["chili", "papryka chili", "mielona papryka chili", "chili mielone", "pieprz cayenne",
      "płatki chili", "ostra papryka"], "sr:170932", trace=True),
    F("cinnamon", "Cynamon", ["cynamon", "cynamon mielony"], "sr:171320", trace=True),
    F("nutmeg", "Gałka muszkatołowa", ["gałka muszkatołowa", "mielona gałka muszkatołowa"], "sr:171326", trace=True),
    F("turmeric", "Kurkuma", ["kurkuma", "kurkuma mielona"], "sr:172231", trace=True),
    F("cumin", "Kmin rzymski", ["kmin rzymski", "kumin", "kmin rzymski kumin"], "sr:170923", trace=True,
      łyżeczka="tsp", łyżka="tbsp"),
    F("curry-powder", "Curry w proszku", ["curry", "przyprawa curry", "curry w proszku"], "sr:170924", trace=True),
    F("ginger", "Imbir", ["imbir", "imbir świeży", "korzeń imbiru"], "sr:169231"),
    F("ginger-ground", "Imbir mielony", ["imbir mielony", "mielony imbir"], "sr:170926", trace=True),
    F("garlic-powder", "Czosnek granulowany", ["czosnek granulowany", "czosnek w proszku", "czosnek suszony"], "sr:171325", trace=True),
    F("oregano", "Oregano", ["oregano", "oregano suszone"], "sr:171328", trace=True, łyżeczka="tsp, leaves"),
    F("basil-dried", "Bazylia suszona", ["bazylia suszona", "suszona bazylia"], "sr:171317", trace=True,
      łyżeczka="tsp, leaves", łyżka="tbsp, leaves"),
    F("basil", "Bazylia świeża", ["bazylia", "bazylia świeża", "świeża bazylia", "liście bazylii"], "sr:172232", trace=True),
    F("thyme", "Tymianek", ["tymianek", "tymianek suszony"], "sr:170938", trace=True, łyżeczka="tsp, leaves", łyżka="tbsp, leaves"),
    F("herbes-de-provence", "Zioła prowansalskie", ["zioła prowansalskie", "zioła", "zioła suszone"], "ciq:11060", trace=True,
      units_from="sr:170938", łyżeczka="tsp, leaves", łyżka="tbsp, leaves"),
    F("parsley", "Natka pietruszki", ["natka", "natka pietruszki", "pietruszka", "pietruszka natka", "pietruszka liście"],
      "sr:170416", trace=True),
    F("dill", "Koperek", ["koper", "koperek", "koper ogrodowy"], "sr:172233", trace=True),
    F("mint", "Mięta", ["mięta", "mięta świeża", "liście mięty"], "sr:173475", trace=True),
]

UNIT_AUTO = {   # Polish unit -> source portion labels that count as it when the food names none
    "łyżka": ("tbsp", "tablespoon"),
    "łyżeczka": ("tsp", "teaspoon"),
    "szklanka": ("cup",),
}
ML_FROM = {"cup": 236.588, "fl oz": 29.5735, "liter": 1000.0, "milliliter": 1.0}
CUP_LIKE = re.compile(r"^cup( |$|, (fluid|unthawed|thawed|whole kernels)| \(not packed\))")


# --- downloads ----------------------------------------------------------------

def fetch(url, path):
    if os.path.exists(path):
        return path
    os.makedirs(os.path.dirname(path), exist_ok=True)
    print("downloading", url)
    req = urllib.request.Request(url, headers={"User-Agent": "kitchen-build-foods/1.0"})
    with urllib.request.urlopen(req, timeout=120) as r, open(path + ".part", "wb") as f:
        f.write(r.read())
    os.replace(path + ".part", path)
    return path


def sha1(path):
    h = hashlib.sha1()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def get_ciqual():
    path = os.path.join(CACHE, "ciqual", "ciqual_2020_eng.xls")
    if os.path.exists(path) and sha1(path) == CIQUAL_SHA1:
        return path
    for url in (CIQUAL_URL, CIQUAL_ARCHIVE):
        if os.path.exists(path):
            os.remove(path)
        try:
            fetch(url, path)
        except Exception as e:  # the official site is sometimes in maintenance (HTTP 503)
            print("  failed:", e)
            continue
        if sha1(path) == CIQUAL_SHA1:
            return path
        print("  wrong checksum from", url)
    sys.exit("Could not get the CIQUAL 2020 table with the published checksum.")


# --- reading the sources -------------------------------------------------------

def read_usda(name, url, want):
    """{fdc_id: dict(name, kcal, protein, fat, carbs, fiber, portions)} for the wanted ids."""
    z = zipfile.ZipFile(fetch(url, os.path.join(CACHE, "usda", name + ".zip")))
    rd = lambda f: csv.DictReader(io.TextIOWrapper(z.open(name + "/" + f), encoding="utf-8"))
    out = {r["fdc_id"]: dict(name=r["description"], n={}, portions=[]) for r in rd("food.csv") if r["fdc_id"] in want}
    for r in rd("food_nutrient.csv"):
        if r["fdc_id"] in out and r["nutrient_id"] in ("1008", "2047", "2048", "1003", "1004", "1005", "1079") and r["amount"] != "":
            out[r["fdc_id"]]["n"][r["nutrient_id"]] = float(r["amount"])
    units = {r["id"]: r["name"] for r in rd("measure_unit.csv")}
    for r in rd("food_portion.csv"):
        if r["fdc_id"] in out and r["gram_weight"]:
            unit = units.get(r["measure_unit_id"], "")
            label = " ".join(x for x in (unit if unit != "undetermined" else "", r["modifier"], r["portion_description"]) if x)
            amount = float(r["amount"] or 1) or 1
            out[r["fdc_id"]]["portions"].append((re.sub(r"\s+", " ", label).strip().lower(), float(r["gram_weight"]) / amount))
    for fid, f in out.items():
        n = f["n"]
        kcal = n.get("1008", n.get("2048", n.get("2047")))
        if kcal is None or "1003" not in n or "1004" not in n or "1005" not in n:
            sys.exit(f"USDA {fid} {f['name']}: missing energy or a macronutrient")
        fiber = n.get("1079")
        f.update(kcal=kcal, protein=n["1003"], fat=n["1004"], fiber=fiber,
                 carbs=max(0.0, n["1005"] - (fiber or 0.0)))
    return out


def ciq_num(v, what, code, zero_if_missing=False):
    s = str(v).strip().replace(",", ".")
    if s.startswith("<") or s.lower() == "traces":
        return 0.0
    if s in ("-", ""):
        if zero_if_missing:
            return 0.0
        sys.exit(f"CIQUAL {code}: no value for {what}")
    return float(s)


def read_ciqual(want):
    import xlrd   # pip install xlrd (only this source is an .xls)
    sh = xlrd.open_workbook(get_ciqual()).sheet_by_index(0)
    hdr = [str(c.value) for c in sh.row(0)]
    col = lambda prefix: next(i for i, h in enumerate(hdr) if h.startswith(prefix))
    c = dict(code=col("alim_code"), name=col("alim_nom_eng"), kcal=col("Energy, Regulation EU No 1169/2011 (kcal"),
             protein=col("Protein (g/100g)"), carbs=col("Carbohydrate (g/100g)"), fat=col("Fat (g/100g)"),
             fiber=col("Fibres (g/100g)"))
    out = {}
    for r in range(1, sh.nrows):
        code = str(int(sh.cell_value(r, c["code"])))
        if code not in want:
            continue
        v = lambda k, **kw: ciq_num(sh.cell_value(r, c[k]), k, code, **kw)
        protein, carbs, fat, fiber = v("protein"), v("carbs"), v("fat"), v("fiber", zero_if_missing=True)
        raw_kcal = str(sh.cell_value(r, c["kcal"])).strip()
        kcal = float(raw_kcal.replace(",", ".")) if raw_kcal not in ("-", "") else 4 * protein + 4 * carbs + 9 * fat + 2 * fiber
        out[code] = dict(name=str(sh.cell_value(r, c["name"])).strip(), kcal=kcal, protein=protein, fat=fat,
                         carbs=carbs, fiber=fiber, portions=[], kcal_computed=raw_kcal in ("-", ""))
    return out


# --- building -------------------------------------------------------------------

def pick_portion(portions, key):
    key = key.lower()
    for label, g in portions:
        if label == key or label.startswith(key):
            return g
    return None


def units_for(food, portions):
    units = {}
    for unit, key in food["units"].items():
        g = pick_portion(portions, key)
        if g is None:
            sys.exit(f"{food['id']}: no portion '{key}' for {unit}; the source has: {[p[0] for p in portions]}")
        units[unit] = g
    for unit, keys in UNIT_AUTO.items():
        if unit in units:
            continue
        for label, g in portions:
            if label in keys or (unit == "szklanka" and CUP_LIKE.match(label)):
                units[unit] = g
                break
    if "łyżka" in units and "łyżeczka" not in units:
        units["łyżeczka"] = units["łyżka"] / 3
    elif "łyżeczka" in units and "łyżka" not in units:
        units["łyżka"] = units["łyżeczka"] * 3
    if food["liquid"]:
        for label, g in portions:
            if label in ML_FROM:
                units["ml"] = g / ML_FROM[label]
                break
    return {k: round(v, 2) for k, v in units.items()}


def build():
    want = {"sr": set(), "ff": set(), "ciq": set()}
    for f in FOODS:
        for s in (f["src"], f["units_from"]):
            if s:
                kind, sid = s.split(":")
                want[kind].add(sid)
    src = {"sr": read_usda(*USDA_SR, want["sr"]), "ff": read_usda(*USDA_FF, want["ff"]) if want["ff"] else {},
           "ciq": read_ciqual(want["ciq"]) if want["ciq"] else {}}
    rows, seen_ids, seen_alias = [], set(), {}
    for f in FOODS:
        kind, sid = f["src"].split(":")
        s = src[kind].get(sid)
        if not s:
            sys.exit(f"{f['id']}: {f['src']} not found in the source")
        portions = list(s["portions"])
        if f["units_from"]:
            k2, s2 = f["units_from"].split(":")
            portions += src[k2][s2]["portions"]
        if f["id"] in seen_ids:
            sys.exit(f"duplicate id {f['id']}")
        seen_ids.add(f["id"])
        aliases = []
        for a in [f["name"]] + f["aliases"]:
            k = norm(a)
            if k in seen_alias and seen_alias[k] != f["id"]:
                sys.exit(f"alias '{a}' of {f['id']} is already used by {seen_alias[k]}")
            seen_alias[k] = f["id"]
            if a != f["name"] and a.lower() not in [x.lower() for x in aliases]:
                aliases.append(a.lower())
        rows.append(dict(
            id=f["id"], name=f["name"], aliases=aliases,
            kcal=round(s["kcal"], 1), protein_g=round(s["protein"], 2), fat_g=round(s["fat"], 2),
            carbs_g=round(s["carbs"], 2), fiber_g=None if s["fiber"] is None else round(s["fiber"], 2),
            units=units_for(f, portions), trace=f["trace"],
            source={"sr": "usda-sr", "ff": "usda-ff", "ciq": "ciqual"}[kind], source_id=sid, source_name=s["name"],
            units_from=f["units_from"], kcal_computed=s.get("kcal_computed", False)))
    return rows


def norm(s):
    """Same as normName() in js/macros.js: lowercase, no diacritics, words only."""
    import unicodedata
    s = unicodedata.normalize("NFD", str(s).lower().replace("ł", "l"))
    s = "".join(ch for ch in s if unicodedata.category(ch) != "Mn")
    return " ".join(re.findall(r"[a-z0-9]+", s))


# --- output -------------------------------------------------------------------

def q(v):
    if v is None:
        return "null"
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, (int, float)):
        return repr(v)
    return "'" + str(v).replace("'", "''") + "'"


def arr(xs):
    return "array[" + ", ".join(q(x) for x in xs) + "]::text[]" if xs else "'{}'::text[]"


def gen_sql(rows):
    vals = ",\n  ".join(
        "(" + ", ".join([q(r["id"]), q(r["name"]), arr(r["aliases"]), q(r["kcal"]), q(r["protein_g"]), q(r["fat_g"]),
                         q(r["carbs_g"]), q(r["fiber_g"]), q(json.dumps(r["units"], ensure_ascii=False)) + "::jsonb",
                         q(r["trace"]), q(r["source"]), q(r["source_id"]), q(r["source_name"])]) + ")"
        for r in rows)
    return f"""-- kitchen: the foods reference table (M7.3), {len(rows)} rows.
-- GENERATED by tools/build_foods.py from open data; do not edit by hand, change the script.
-- Sources: {SOURCES_NOTE}.
-- Per 100 g: kcal, protein, fat, available carbohydrate (fibre not included) and fibre.
-- units: grams of one household unit, from the source's portion data.
--
-- HOW TO RUN: after supabase/schema.sql (which creates the table), paste this whole file into
-- the Supabase SQL Editor and press Run. Safe to run again: rows are updated in place by id,
-- and a food that is no longer in the list is removed (ingredients that pointed at it keep
-- their row, with food_id cleared by the foreign key).

begin;

insert into public.foods (id, name, aliases, kcal, protein_g, fat_g, carbs_g, fiber_g, units, trace,
                          source, source_id, source_name)
values
  {vals}
on conflict (id) do update set
  name = excluded.name, aliases = excluded.aliases, kcal = excluded.kcal, protein_g = excluded.protein_g,
  fat_g = excluded.fat_g, carbs_g = excluded.carbs_g, fiber_g = excluded.fiber_g, units = excluded.units,
  trace = excluded.trace, source = excluded.source, source_id = excluded.source_id,
  source_name = excluded.source_name, updated_at = now();

delete from public.foods where id not in ({", ".join(q(r["id"]) for r in rows)});

select count(*) as foods from public.foods;

commit;
"""


def gen_js(rows):
    keep = ("id", "name", "aliases", "kcal", "protein_g", "fat_g", "carbs_g", "fiber_g", "units", "trace", "source", "source_id")
    camel = lambda k: re.sub(r"_([a-z])", lambda m: m.group(1).upper(), k)
    data = [{camel(k): r[k] for k in keep} for r in rows]
    body = ",\n".join("  " + json.dumps(d, ensure_ascii=False, separators=(",", ":")) for d in data)
    return f"""// GENERATED by tools/build_foods.py: the same rows as supabase/foods.sql, for ?demo and
// tests/macros.html (the real app reads the foods table). Sources: {SOURCES_NOTE}.
// Per 100 g; carbsG is available carbohydrate (fibre not included).
export const FOODS = [
{body}
];
"""


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--write", action="store_true", help="write supabase/foods.sql and js/foods-data.js")
    ap.add_argument("--list", action="store_true", help="print every row")
    a = ap.parse_args()
    rows = build()
    by = {}
    for r in rows:
        by[r["source"]] = by.get(r["source"], 0) + 1
    print(f"foods: {len(rows)} ({', '.join(f'{k} {v}' for k, v in sorted(by.items()))})")
    print("aliases:", sum(len(r["aliases"]) + 1 for r in rows), "| with household units:", sum(bool(r["units"]) for r in rows),
          "| trace:", sum(r["trace"] for r in rows))
    for r in rows:
        if r["kcal_computed"]:
            print(f"  note: {r['id']}: CIQUAL has no energy value; computed with the EU factors = {r['kcal']} kcal")
    if a.list:
        for r in rows:
            print(f"  {r['id']:20s} {r['name']:28s} {r['kcal']:6.1f} B{r['protein_g']:6.2f} T{r['fat_g']:6.2f} "
                  f"W{r['carbs_g']:6.2f} Bł{r['fiber_g'] if r['fiber_g'] is not None else '-':>6} {r['source']}:{r['source_id']} "
                  f"{r['source_name'][:50]} {json.dumps(r['units'], ensure_ascii=False)}")
    if a.write:
        with open(SQL_OUT, "w", encoding="utf-8") as f:
            f.write(gen_sql(rows))
        with open(JS_OUT, "w", encoding="utf-8") as f:
            f.write(gen_js(rows))
        print("written:", os.path.relpath(SQL_OUT), os.path.relpath(JS_OUT))


if __name__ == "__main__":
    main()
