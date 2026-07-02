# Country Profiles

Sheepfold should use country profiles to adapt:

- available AI assistant providers;
- default emergency-useful site suggestions;
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
- Country selection may update suggested emergency-useful sites, but it must not enable them automatically without parent confirmation.
- Country selection may change the list of visible AI providers.
- Legal/provider availability must be treated as configuration, not hardcoded truth.
- If provider status is unknown, show it as unavailable until explicitly configured.

## Russia Profile Draft

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

## Future Country Profiles

Each country profile should follow the same criteria as Russia:

- government identity and public services;
- school and education platforms;
- emergency and health services;
- maps and transport;
- essential banking if appropriate;
- communication only when it does not turn restricted mode into normal internet access;
- no entertainment, games, short-video, social feeds, streaming, app stores, or broad portals by default.

Suggested initial profile files:

```text
country-profiles/ru.json
country-profiles/us.json
country-profiles/de.json
country-profiles/fr.json
country-profiles/es.json
country-profiles/tr.json
country-profiles/ua.json
country-profiles/kz.json
```
