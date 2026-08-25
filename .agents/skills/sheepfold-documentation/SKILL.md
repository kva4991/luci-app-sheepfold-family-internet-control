---
name: sheepfold-documentation
description: Create, restructure, or review Sheepfold Markdown documentation while keeping implemented behavior, experiments, plans, and known limitations distinct. Use for READMEs, focused design documents, ADR-related current-state pages, runbooks, troubleshooting, API references, and agent handoff documentation in this repository.
---

# Sheepfold documentation

Create documentation that lets a parent, developer, operator, or future agent understand the real Sheepfold system without relying on chat history.

## Establish the contract

Before writing:

1. Read the applicable repository instructions and `docs/owner-communication-profile.ru.md`.
2. Identify the reader and the single main job of the page.
3. Verify product claims against the current code, tests, schema, interface, or runtime evidence.
4. Mark each material statement as implemented, experimental, planned, a known limitation, or not yet verified where the distinction matters.
5. Find the focused document and registered section tag that already own the topic. Update them instead of creating a second source of truth.

Read [the Sheepfold writing standard](../../../docs/documentation-writing-standard.ru.md) before creating a page, substantially restructuring one, or reviewing documentation quality.

## Choose the document form

- Use a README or entry page to orient a reader and route them to maintained details.
- Use a how-to page for one goal and one supported path.
- Use a reference page for exact fields, commands, defaults, errors, and compatibility limits.
- Use a runbook for prerequisites, safe execution, expected evidence, changed state, restoration, common failures, and escalation.
- Use a troubleshooting page that starts from an observable symptom.
- Use an ADR to preserve why a stable architecture decision was accepted. Keep current behavior in the focused topic document.

Do not copy the same procedure into several pages. Maintain it once and use descriptive links elsewhere.

## Preserve Sheepfold terminology

Project terminology overrides a general style guide. In particular:

- distinguish the device allowlist, device blocklist, site allowlist, site blocklist, and emergency-useful sites;
- distinguish LuCI at `http://<router-ip>/cgi-bin/luci/...` from the protected Android API endpoint;
- never describe a UI placeholder, reference model, test fixture, or plan as working router behavior;
- keep exact UCI keys, API fields, package identities, commands, filenames, and section tags unchanged.

## Verify the result

From the repository root, run the smallest applicable checks:

```powershell
npm.cmd run quality:docs
git diff --check
```

Run `npm.cmd run quality:docs:all` after changing navigation, section tags, the documentation skill, or the documentation audit itself. Test commands and procedures at the boundary they claim to support when the task permits it.

The audit checks Markdown structure and repository references. It does not prove technical truth, clarity, legal correctness, external-link availability, or successful execution on a real OpenWRT router or Android device.
