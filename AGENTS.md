# Agent Guidelines

These rules apply to the whole repository.

## Project Naming

- Use `Sheepfold` as the main project and product name in English and Russian text.
- Use `Овчарня` only when referring to the Android app name or the Russian LuCI display name.
- Do not use `Овчарня` as the generic Russian name for the whole project outside direct app/interface naming.

Correct examples:

- `Sheepfold — система семейного управления доступом...`
- `Android-приложение: Овчарня`
- `LuCI RU: Овчарня : контроль доступа в интернет для семьи`

Avoid:

- `Овчарня — система...`
- `Если Овчарня окажется полезной...`

## User-Facing Wording

- Prefer clear router-based wording over internal-only LuCI wording.
- In Russian, write `через OpenWRT-роутер и его веб-интерфейс LuCI` instead of only `через LuCI`.
- Keep README files approachable for non-developers.

## Platform Scope

- Target modern OpenWRT with `firewall4` / `nftables`.
- Do not add legacy `firewall3` / `iptables` support unless explicitly requested later.
- Target Android 9.0 Pie / API 28 and newer.

## Repository Hygiene

- Keep `README.md` in English.
- Keep `README.ru.md` in Russian.
- Keep shell scripts and OpenWRT package files LF-only.
- Do not commit secrets, tokens, router passwords, or local environment files.
