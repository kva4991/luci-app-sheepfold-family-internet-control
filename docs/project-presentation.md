# Project presentation

## What Sheepfold is

**Sheepfold** is a self-hosted family internet access control system for OpenWrt routers.
It helps parents manage when and how home devices can access the internet through the router and its LuCI web interface, without relying on a developer-operated cloud backend for family controls.

## Core idea

Sheepfold applies internet access rules at the router level instead of depending on software installed on child devices.
This makes the router the main enforcement point for schedules, allowlists, blocklists, temporary access, and trusted-device handling.

## Main components

The project includes:

- an OpenWrt package (`luci-app-sheepfold-family-internet-control`);
- a LuCI interface for setup and daily management;
- a router-side backend service;
- an Android companion app for parent administrators (`Sheepfold`);
- one active messenger bot on the router for notifications and confirmed remote commands;
- an optional AI assistant for parents, with explicit consent before sending extended context.

## What parents can do

With Sheepfold, parents can:

- view all known devices on the home network;
- allow or block internet access for specific devices;
- use allowlist and blocklist rules;
- create schedules for devices or groups;
- grant temporary access such as 15 minutes, 1 hour, or until bedtime;
- manage Wi-Fi-related family shortcuts safely;
- receive alerts about new unknown devices;
- use a messenger bot for short confirmed actions when away from home.

## Privacy and security

Sheepfold is built as a local-first, self-hosted system. Full management is intended for the local network, while remote usage is limited to short, confirmed messenger actions.

Sensitive data — device identifiers, child names, logs, router settings, and similar private details — must not be sent to AI providers automatically. Extended AI context requires a preview screen and explicit user confirmation before anything beyond the parent's own text is shared.

The project avoids a mandatory central cloud backend and is designed to work alongside existing OpenWrt services instead of silently taking control of them. An optional, user-triggered feedback form may send the displayed message fields to the project owner's Yandex Cloud endpoint.

## Integration philosophy

Sheepfold is designed to coexist with existing router software and home services. Its target traffic chain is:

```
Sheepfold -> AdGuard Home -> Podkop
```

In this model:

- Sheepfold decides whether a device may access the network;
- AdGuard Home can handle DNS filtering;
- Podkop can route already-allowed traffic.

The project does not blindly overwrite third-party configurations.

## Why this project exists

Many parental control tools are cloud-centered, app-centered, or too easy to bypass. Sheepfold takes another approach:

- router-first instead of child-device-first;
- self-hosted instead of cloud-dependent;
- family-oriented instead of enterprise-oriented;
- understandable for parents, not only for technical users;
- cautious with privacy, logs, and sensitive data.

## Status

Sheepfold is an actively designed OpenWrt family-control project with LuCI, Android, messenger, integration, and AI-related architecture already defined. The product direction is focused on safe local control, explainable behavior, and practical day-to-day family use.

## Short description

Sheepfold is a self-hosted OpenWrt family internet control system with a LuCI app, Android companion, messenger integration, and privacy-aware parent tools.
