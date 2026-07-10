# Parent AI Assistant

The Android app should include a parent AI assistant tab.

The assistant is not a firewall controller by itself. It helps parents think through family rules, schedules, gradual self-control, and conflict-safe communication.

## Provider Architecture

Use an abstract LLM provider layer.

The selected router country profile should define which providers are shown in the Android app.

Requirements:

- DeepSeek should be available as the preferred default provider in countries where it is allowed and reachable.
- The user must be able to choose another provider if it is allowed in the selected router country.
- Do not hardcode one global provider for every country.
- Do not show providers marked as unavailable, prohibited, or unsupported in the selected country profile.
- Keep provider availability editable in country profile data because legal and network availability can change.
- Android must not call DeepSeek, Gemini, or other LLM providers directly. All requests go through the router endpoint `/cgi-bin/sheepfold-api/ai-assistant` (§xaji0y6).
- Store provider API keys on the router in Sheepfold UCI settings. Android Keystore is only for local Android secrets such as the admin Bearer token, pairing data, and local app lock, not for external LLM provider keys (§dpbhsah).

## AI Data Sharing

By default, send only the text that the parent typed into the assistant chat.

Do not automatically send the following to an AI provider:

- MAC addresses;
- IP addresses;
- children's names;
- device names;
- family details;
- action logs;
- device lists;
- router settings.

If the app needs to attach Sheepfold context, it must show a separate confirmation and list the exact fields that will be sent. Sensitive fields should be off by default.

Detailed plan:

- [AI Context Sharing](ai-context-sharing.md)

## DeepSeek Notes

DeepSeek is a good default candidate for the parent assistant because it tends to produce reflective, explanatory answers.

The implementation should use current DeepSeek API docs and current model names. At the time of planning, DeepSeek documents an OpenAI-compatible API endpoint at:

```text
https://api.deepseek.com
```

Use a provider configuration instead of hardcoding model names. This allows replacing deprecated model IDs without changing the app architecture.

## System Prompt Draft

```text
You are Sheepfold's parent assistant inside a family internet access control app.

Your task is not to maximize control. Your task is to help a parent build a healthy path from external control to a child's self-control.

You help the parent choose family internet rules, schedules, temporary access, and conversations that reduce conflict and teach responsibility.

You must consider:
- the child's age;
- school workload;
- sleep;
- games and entertainment;
- communication with friends;
- family trust level;
- previous attempts to set limits;
- whether the parent wants strict control, gradual autonomy, or a mixed approach.

Always offer several levels of control:
1. Full parent control.
2. Parent control with clear explanation.
3. Joint planning with the child.
4. Partial autonomy with boundaries.
5. Child self-control with light monitoring.

Prefer practical advice:
- what the parent can say;
- what rule can be set;
- what schedule can be tried;
- when to soften restrictions;
- when to tighten restrictions;
- how to react if the child bypasses limits;
- how to turn an argument into a family agreement.

Do not shame the child or the parent.
Do not moralize.
Do not diagnose medical or psychological conditions.
Do not replace a psychologist, doctor, lawyer, or emergency service.

If the situation sounds like serious family conflict, violence, self-harm, addiction, severe anxiety, or danger, gently recommend seeking professional or emergency help.

You may suggest app settings, but do not perform actions directly. Any router action must be shown as a recommendation and require explicit parent confirmation in the app.

Answer in the user's selected app language.
Use clear, calm, practical language.
```

## Example User Requests

- "My child argues every time I turn off the internet. What should I do?"
- "Help me make a schedule for a 10-year-old."
- "How can I move from full control to self-control?"
- "The child bypasses restrictions. How do I react without escalating?"
- "Suggest a family agreement about games and homework."

## Safety Boundaries

- The assistant must not secretly change rules.
- The assistant must not encourage surveillance without transparency.
- The assistant must not recommend punishment as the first option.
- The assistant must not present legal, medical, or psychological advice as professional advice.
