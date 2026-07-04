<p align="center">
  <img src="docs/assets/sheepfold-logo.png" alt="Sheepfold logo" width="160">
</p>

# Sheepfold : контроль доступа в интернет для семьи

Русский | [English](README.md)

**Sheepfold** — система семейного управления доступом домашних устройств в интернет через OpenWRT-роутер.

Проект планируется как приложение для OpenWRT-роутера с веб-интерфейсом LuCI, backend-сервисом, Android-приложением **Овчарня** и интеграцией с ботом в мессенджере для управления домашним интернетом.

## Установка

Установщик пока является заготовкой до публикации первого release-пакета.
Он спрашивает согласие с пользовательским соглашением и предлагает включить автонастройку: при согласии Sheepfold сможет автоматически назначать уверенно распознанные инфраструктурные устройства в группу `Без ограничений`; при отказе используется урезанный ручной режим.

```sh
wget -O /tmp/sheepfold-install.sh https://raw.githubusercontent.com/kva4991/luci-app-sheepfold-family-internet-control/main/install.sh
sh /tmp/sheepfold-install.sh
```

## Обновление

Скрипт обновления пока является заготовкой до настройки GitHub Releases.

```sh
wget -O /tmp/sheepfold-update.sh https://raw.githubusercontent.com/kva4991/luci-app-sheepfold-family-internet-control/main/update.sh
sh /tmp/sheepfold-update.sh
```

## Удаление с OpenWRT

Скрипт удаления убирает OpenWRT-пакет, сохраняет настройки Sheepfold и список клиентов, а затем показывает отчёт об оставшихся настройках на роутере.

```sh
wget -O /tmp/sheepfold-uninstall.sh https://raw.githubusercontent.com/kva4991/luci-app-sheepfold-family-internet-control/main/uninstall.sh
sh /tmp/sheepfold-uninstall.sh
```

## Названия проекта

- GitHub-репозиторий: `luci-app-sheepfold-family-internet-control`
- OpenWRT-пакет: `luci-app-sheepfold-family-internet-control`
- LuCI EN: `Sheepfold Family Internet Control`
- LuCI RU: `Sheepfold : контроль доступа в интернет для семьи`
- Android-приложение: `Овчарня`
- Android package: `app.sheepfold.android`

## Цели

- Управлять доступом домашних устройств в интернет через OpenWRT-роутер и его веб-интерфейс LuCI.
- Сделать Android-приложение с быстрыми действиями и виджетами.
- Добавить управление через Telegram/VK-бота, VK сделать вариантом по умолчанию при первичной настройке, а MAX оставить экспериментальным адаптером.
- Поддержать белый список, чёрный список, расписания, временные разрешения и доступ к аварийно-полезным сайтам.
- Синхронизировать имена устройств и постоянные IP с постоянной арендой DHCP на OpenWRT-роутере.
- Безопасно работать с `fw4` / `nftables`.
- Сосуществовать с AdGuard Home и Podkop.

## Поддерживаемые версии Android

Android-приложение поддерживает Android 9.0 Pie / API 28 и новее.

Более старые версии Android намеренно не поддерживаются.

## Целевые версии OpenWRT

Sheepfold ориентирован на современные роутеры OpenWRT с `firewall4` / `nftables`.

Поддержка устаревших `firewall3` / `iptables` не планируется. Ожидаемые устройства — достаточно свежие домашние роутеры и прошивки, например класс Xiaomi Mi Router AX3000T.

## Планируемая цепочка трафика

1. Sheepfold решает, разрешён ли устройству доступ в сеть.
2. Разрешённый DNS-трафик может идти через AdGuard Home.
3. Разрешённый и отфильтрованный трафик может идти дальше через Podkop.

Проект не должен ломать AdGuard Home, Dnsmasq, Podkop, sing-box или стандартные правила firewall OpenWRT.

## Приоритет правил

1. Устройства из чёрного списка блокируются всегда.
2. Устройства из белого списка не блокируются глобальными правилами и расписаниями.
3. Одно устройство не может одновременно находиться в белом и чёрном списке.
4. Временные разрешения не должны обходить чёрный список.
5. Расписания применяются только к устройствам, которых нет в белом и чёрном списках.

## Структура репозитория

```text
package/luci-app-sheepfold-family-internet-control/  каркас OpenWRT-пакета
android/                                             Android-приложение
bot/                                                 адаптеры Telegram/VK-бота, экспериментальный MAX
docs/                                                продуктовая и техническая документация
install.sh                                           установщик для роутера
update.sh                                            обновление с роутера
uninstall.sh                                         удаление с роутера с сохранением настроек
```

## Статус

Репозиторий находится на этапе планирования и начального каркаса.

См. также:

- [Product requirements](docs/product-requirements.md)
- [Прямое задание для ИИ-разработчика](docs/developer-task.ru.md)
- [API между Android-приложением и OpenWRT](docs/android-openwrt-api.ru.md)
- [ИИ-помощник для родителей](docs/ai-assistant.ru.md)
- [Передача контекста ИИ-помощнику](docs/ai-context-sharing.ru.md)
- [Черновик промпта ИИ-помощника](docs/ai-assistant-prompt.ru.md)
- [Возрастные сценарии контроля](docs/age-scenarios.ru.md)
- [Расписания доступа](docs/schedules.ru.md)
- [Профили стран](docs/country-profiles.ru.md)
- [Планирование доступа к аварийно-полезным сайтам](docs/domain-allowlist.ru.md)
- [Integrations](docs/integrations.md)
- [Локализация](docs/localization.ru.md)
- [Сообщения и уведомления](docs/messaging.ru.md)
- [Кэш браузера LuCI и версионирование ассетов](docs/luci-cache.ru.md)
- [GitHub and installer plan](docs/github-install-setup.md)
- [Security model](docs/security.md)
- [Пользовательское соглашение](docs/user-agreement.ru.md)
- [Политика приватности](docs/privacy.ru.md)
- [Сравнение роутеров с поддержкой OpenWRT](https://hattabbi4.github.io/openwrt-router-compare/)

## Поддержать проект

Если Sheepfold окажется полезным и вы захотите поддержать разработку, ссылки для донатов будут добавлены здесь до первого публичного релиза.

Возможные варианты:

- GitHub Sponsors для международной аудитории;
- Boosty или ЮMoney для русскоязычных пользователей.

## Лицензия

MIT License.
