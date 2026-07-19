# Country Profiles

<!-- §country1 -->

Sheepfold should use country profiles to adapt:

- available AI assistant providers;
- default emergency-useful sites;
- domain descriptions;
- safety warnings;
- localization defaults.

## Why Country Profiles

The router may be installed in different countries. Useful websites, emergency services, school platforms, banks, and AI-provider availability vary by country.

Country profiles prevent hardcoding Russia-specific assumptions into the whole product.

## Profile Rules

- The user selects the router country during setup.
- The user can change the country later.
- Country selection should not remove manual entries.
- Country selection replaces only entries owned by the country profile; manual entries are preserved.
- Editing a generated entry turns it into a family-owned manual entry.
- Deleting a generated entry creates a persistent exclusion, so switching away and back does not restore it.
- Country selection may change the list of visible AI providers.
- Legal/provider availability must be treated as configuration, not hardcoded truth.
- If provider status is unknown, show it as unavailable until explicitly configured.

## Implemented Storage

Profiles `ru`, `by`, and `cn` live in `root/usr/share/sheepfold/country-profiles/*.json`.
The `sheepfold-country-profile` backend parses them with OpenWrt `jshn`, validates
the schema, domains, field sizes, and duplicates, then replaces only UCI sections
marked with `source=country_profile`. The country is selected during installation
and under `Settings -> General`.

## Russia Profile

### AI Providers

DeepSeek is the preferred default candidate where allowed and reachable.

The profile should support additional providers only when they are allowed and reachable in Russia.

Provider entries should include:

```text
id
display_name
api_base_url
default_model
status: allowed | unavailable | prohibited | unknown
notes
```

### Emergency-Useful Sites

Russia starter list:

| Domain | Display name | Description |
| --- | --- | --- |
| `gosuslugi.ru` | Gosuslugi | Public services portal. |
| `esia.gosuslugi.ru` | Gosuslugi login | Unified identity login. |
| `mos.ru` | Moscow public services | City services for Moscow users. |
| `school.mos.ru` | Moscow school portal | Moscow Electronic School. |
| `dnevnik.ru` | School diary | Electronic diary and school communication. |
| `ya.ru` | Yandex simple search | Minimal Yandex search entrypoint. |
| `2gis.ru` | 2GIS maps | Maps, addresses, organizations, and routes. |
| `mchs.gov.ru` | EMERCOM of Russia | Official emergency and safety information. |
| `psi.mchs.gov.ru` | EMERCOM psychological aid | Crisis assistance information. |
| `minzdrav.gov.ru` | Russian Ministry of Health | Official public health information. |
| `rzd.ru` | Russian Railways | Train schedules and travel information. |

Do not add broad `yandex.ru` to the Russia starter list. See `AGENTS.md` and `docs/domain-allowlist.md`.

### Transport Suggestions

A country profile may show transport sites as suggestions, not as an automatically enabled preset.

For Russia, these may be suggested for manual confirmation:

```text
2gis.ru
rzd.ru
pass.rzd.ru
transport.mos.ru
mosmetro.ru
```

Taxi may be shown only as a separate manual transport list, not as a starter suggestion:

```text
taximaxim.ru
city-mobil.ru
vezet.ru
taxovichkof.ru
```

Do not add Yandex Go or Yandex Taxi to starter suggestions by default. This is too broad a super-app surface: taxi access may also expose marketplaces, food delivery, parcel delivery, carsharing, scooters, and other non-emergency workflows.

## Belarus And China

Belarus uses narrow official domains for emergency management, public health,
government services, and the national railway. China uses official domains for
emergency management, public health, government services, national education,
and China Railway 12306.

## Future Country Profiles

Each country profile should follow the same criteria as Russia:

- government identity and public services;
- school and education platforms;
- emergency and health services;
- maps and transport;
- essential banking if appropriate;
- communication only when it does not turn restricted mode into normal internet access;
- no entertainment, games, short-video, social feeds, streaming, app stores, or broad portals by default.

Suggested next profile files:

```text
country-profiles/us.json
country-profiles/de.json
country-profiles/fr.json
country-profiles/es.json
country-profiles/tr.json
country-profiles/ua.json
country-profiles/kz.json
```
