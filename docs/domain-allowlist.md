# Emergency-Useful Sites Planning

User-facing setting name:

- EN: `Access to emergency-useful sites`
- RU: `Доступ к аварийно-полезным сайтам`

The emergency-useful sites list is intended for restricted mode: a device has no normal internet access, but can still open a small set of useful websites.

Think of it as emergency-useful access: enough for necessary services, but not enough for normal entertainment browsing.

The goal is to allow necessary services without opening video, games, social feeds, or entertainment platforms.

## Product Rules

- Keep emergency-useful sites disabled by default until the user enables it.
- Use one editable domain list, not built-in presets. AdGuard Home already has presets and filtering lists; Sheepfold should not duplicate that job.
- Let parents edit the whole list.
- Prefer narrow domains and subdomains over broad parent domains.
- Explain that domain allowlisting is imperfect because of HTTPS, CDN hosting, mobile apps, DoH, shared domains, and browser cache.
- Do not include movie, game, social network, short-video, streaming, or app-store domains in the default allowlist.
- Do not include marketplaces, super-app storefronts, food delivery catalogs, app stores, or broad portals that enable shopping or entertainment workflows in the default allowlist.

## Editable Starter List

The first-run UI may suggest this list, but parents should review and confirm it before enabling restricted access:

| Domain | Display name | Description |
| --- | --- | --- |
| `gosuslugi.ru` | Gosuslugi | Russian public services portal: documents, applications, benefits, appointments, and household public-service tasks. |
| `esia.gosuslugi.ru` | Gosuslugi login | Unified identity login used by many Russian government and education services. |
| `mos.ru` | Moscow public services | Moscow city services, appointments, school and healthcare links for Moscow users. |
| `school.mos.ru` | Moscow school portal | Moscow Electronic School and school-related services. |
| `dnevnik.ru` | School diary | Electronic diary and school communication platform used in many regions. |
| `ya.ru` | Yandex simple search | Minimal Yandex search entrypoint. Prefer this over broad `yandex.ru`. |
| `2gis.ru` | 2GIS maps | Maps, addresses, organizations, pharmacies, hospitals, ATMs, and route planning. |

Every automatically suggested entry must have:

- domain;
- user-visible display name;
- short explanation;
- optional warning;
- source type, for example `starter`, `manual`, `imported`, or `integration`.

## Useful Domains To Consider

These are not presets. They are examples for the editable list.

### Government And Identity

```text
gosuslugi.ru
esia.gosuslugi.ru
lk.gosuslugi.ru
pos.gosuslugi.ru
mos.ru
my.mos.ru
school.mos.ru
```

### School And Education

These should be editable because school platforms vary by region.

```text
dnevnik.ru
login.dnevnik.ru
school.mos.ru
edu.gosuslugi.ru
myschool.edu.ru
edu.gov.ru
edu.ru
uchi.ru
yaklass.ru
interneturok.ru
foxford.ru
resh.edu.ru
```

### Search, Maps, And Basic Tools

Use carefully. Search engines can lead to entertainment content even when the top-level domain looks harmless.

```text
ya.ru
google.com
translate.google.com
maps.google.com
2gis.ru
```

### Yandex Warning

Do not add broad Yandex domains by default.

Tooltip text:

```text
Yandex services are difficult to allow narrowly. For example, Yandex Maps may require broad Yandex domains and shared static domains. Adding yandex.ru can open much more than maps: video, music, games, feeds, entertainment pages, and other Yandex services. Prefer ya.ru for simple search and 2gis.ru for maps. Add broader Yandex domains only manually and knowingly.
```

Yandex Maps is useful, but it is not ideal for a strict starter list. In browser traffic it may require broad Yandex domains and shared static domains. Adding broad domains can open more than maps.

Prefer `2gis.ru` by default. If parents explicitly want Yandex Maps, they can try adding:

```text
maps.yandex.ru
yandex.ru
yandex.com
yastatic.net
api-maps.yandex.ru
static-maps.yandex.ru
```

Avoid adding broad Yandex domains by default:

```text
yandex.ru
video.yandex.ru
kinopoisk.ru
music.yandex.ru
games.yandex.ru
dzen.ru
```

If Yandex search is needed, prefer `ya.ru` first and let parents explicitly add broader Yandex domains later.

### Banks

Bank access can be useful for parents or household essentials, but it should not be part of the strict child-focused default list. Bank mobile apps may require additional API and CDN domains that differ from browser domains.

Suggested browser domains to try:

```text
sberbank.ru
www.sberbank.ru
sberbank.com
www.sberbank.com
online.sberbank.ru
tbank.ru
www.tbank.ru
business.tbank.ru
cdn-tinkoff.ru
alfabank.ru
click.alfabank.ru
web.alfabank.ru
```

### Emergency, Health, And Public Services

Useful for adults during household or emergency situations. These domains should still be reviewed by parents before adding them.

```text
mchs.gov.ru
psi.mchs.gov.ru
emias.info
zdrav.mos.ru
mos.ru
gosuslugi.ru
esia.gosuslugi.ru
nalog.gov.ru
lkfl2.nalog.ru
fssp.gov.ru
gibdd.ru
pochta.ru
rzd.ru
```

### Transport And City Navigation

```text
2gis.ru
rzd.ru
pass.rzd.ru
mosmetro.ru
transport.mos.ru
```

### Taxi And Super-Apps

Taxi access can be useful in household or emergency situations, but taxi domains should not be part of the strict starter list.

Reason: many taxi services are now super-apps. They may expose ride hailing together with marketplaces, food delivery, grocery delivery, carsharing, scooters, advertising, and other non-emergency workflows.

For Russia, keep taxi as a separate manual list. It is not part of the starter list and should be enabled only by a parent who understands the tradeoff.

Do not suggest Yandex Go by default: it is too broad a super-app surface.

Domains to review manually:

```text
taximaxim.ru
city-mobil.ru
vezet.ru
taxovichkof.ru
```

Yandex Go / Yandex Taxi may be added only manually if the parent explicitly accepts the risk:

```text
go.yandex
taxi.yandex.ru
```

Do not add or suggest these by default:

```text
market.yandex.ru
eda.yandex.ru
lavka.yandex.ru
dostavka.yandex.ru
business.go.yandex
```

### Communication And Safety

Optional. These can be useful, but they may also become a way around restrictions.

```text
mail.google.com
mail.yandex.ru
web.whatsapp.com
telegram.org
```

Do not enable this block by default.
