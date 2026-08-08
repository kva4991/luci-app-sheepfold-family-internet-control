# Реестр изученных источников

<!-- §aisrvexp1 -->

Проверено 8 августа 2026 года. Реестр фиксирует не «ссылки для красоты», а требования, которые источник изменил в архитектуре. Перед production каждая запись превращается в машинный `evidenceRecord` с хешем, датой проверки, областью применимости и лицензией.

## Управление риском и безопасность LLM

| Источник | Что взято в каркас |
|---|---|
| [NIST AI Risk Management Framework](https://www.nist.gov/itl/ai-risk-management-framework) и [GenAI Profile NIST AI 600-1](https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.600-1.pdf) | Постоянный цикл Govern, Map, Measure, Manage; риск оценивается по контексту применения, а не одной метрике модели |
| [NIST AI RMF Playbook](https://airc.nist.gov/airmf-resources/playbook/) | Повторяемые TEVV-проверки, участие предметных специалистов и пользователей, мониторинг после выпуска |
| [NIST Adversarial Machine Learning 100-2e2025](https://www.nist.gov/news-events/news/2025/03/nist-trustworthy-and-responsible-ai-report-adversarial-machine-learning) | Prompt injection, poisoning, privacy и misuse моделируются как отдельные угрозы; «идеальной защиты» не предполагается |
| [NIST Privacy Framework](https://www.nist.gov/privacy-framework/privacy-framework) | Минимизация данных, управление полным жизненным циклом и измерение privacy-риска |
| [OWASP LLM Top 10](https://owasp.org/www-project-top-10-for-large-language-model-applications/) | Независимые границы для prompt injection, утечек, excessive agency, RAG/embedding и неконтролируемых затрат |
| [OWASP LLM01 Prompt Injection](https://genai.owasp.org/llmrisk/llm01-prompt-injection/) | RAG и fine-tuning не устраняют injection; документы всегда остаются недоверенными данными |
| [OWASP LLM06 Excessive Agency](https://genai.owasp.org/llmrisk/llm062025-excessive-agency/) | Минимальные tools, функции и автономность; высоковлияющие действия подтверждает код и человек |
| [OWASP LLM08 Vector and Embedding Weaknesses](https://genai.owasp.org/llmrisk/llm082025-vector-and-embedding-weaknesses/) | Tenant/visibility-фильтр применяется до vector search; embeddings защищаются как исходный текст |
| [MITRE ATLAS](https://atlas.mitre.org/) | Threat model и red-team сценарии связываются с реальными техниками атак на AI-компоненты |

## Доказательная база и RAG

| Источник | Что взято в каркас |
|---|---|
| [Lewis et al., Retrieval-Augmented Generation](https://papers.neurips.cc/paper_files/paper/2020/hash/6b493230205f780e1bc26945df7481e5-Abstract.html) | Непараметрическая память улучшает обновляемость и provenance, но retrieval и generation оцениваются раздельно |
| [Cochrane Handbook, GRADE](https://training.cochrane.org/handbook/current/chapter-14) | Для медицинских рекомендаций фиксируются применимость, риск смещения, согласованность, точность и публикационное смещение; LLM-confidence этого не заменяет |
| [NICE Evidence Standards Framework](https://www.nice.org.uk/corporate/ecd7) | Уровень доказательств должен соответствовать заявленной функции и риску цифровой технологии |

## Дети, приватность и AI-компаньоны

| Источник | Что взято в каркас |
|---|---|
| [UNICEF Guidance on AI and Children 3.0](https://www.unicef.org/innocenti/reports/policy-guidance-ai-children) | Наивысший интерес ребёнка, безопасность, приватность, недискриминация, прозрачность и участие детей в разработке |
| [UNICEF: When AI becomes a friend](https://www.unicef.org/documents/when-ai-becomes-friend-child-rights-risks) | Отдельные тесты AI-компаньона, зависимости, убеждения, интимной поддержки и детского red teaming |
| [UNICEF: Child Centric AI](https://www.unicef.org/digitalimpact/stories/child-centric-ai) | Возрастная уместность, минимизация и ограничение хранения, реальный контроль ребёнка и развитие самостоятельности вместо оптимизации эмоциональной зависимости |
| [ICO Children’s Code](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/childrens-information/childrens-code-guidance-and-resources/age-appropriate-design-a-code-of-practice-for-online-services/) | Высокая приватность по умолчанию, понятные возрасту объяснения, минимизация, осторожность с nudges и parental controls |
| [APA advisory on adolescent AI well-being](https://www.apa.org/topics/artificial-intelligence-machine-learning/health-advisory-ai-adolescent-well-being) | Ребёнок может переоценивать понимание и намерения бота; нужны границы имитации отношений и AI literacy |

## Психологическая и семейная поддержка

| Источник | Что взято в каркас |
|---|---|
| [APA advisory on GenAI chatbots and mental health](https://www.apa.org/topics/artificial-intelligence-machine-learning/health-advisory-chatbots-wellness-apps) | Не заявлять психотерапию; использовать как ограниченную поддержку, тестировать уязвимые группы и не поощрять единственный источник отношений |
| [WHO Psychological First Aid](https://www.who.int/publications-detail-redirect/9789241548205) | В кризисе сначала гуманная практическая помощь, достоинство, культура и реальные ресурсы человека |
| [UNICEF Caring for the Caregiver](https://www.unicef.org/documents/caring-caregiver) | Саморегуляция и поддержка взрослого влияют на способность заботиться о ребёнке; родительский модуль не сводится к контролю ребёнка |
| [AAMFT Code of Ethics 2026](https://www.aamft.org/common/Uploaded%20files/Legal%20Ethics/AAMFT%20Code%20of%20Ethics.pdf) | В семейном/парном контуре сохраняется конфиденциальность каждого участника; совместная сессия не делает все личные записи общими |
| [WHO: Responding to intimate partner violence and sexual violence](https://www.who.int/publications/i/item/9789241548595) | При возможном насилии обычная медиация уступает безопасности, приватности, отсутствию давления и маршруту к подготовленной живой помощи |

## Обучение

| Источник | Что взято в каркас |
|---|---|
| [UNESCO Guidance for Generative AI in Education](https://www.unesco.org/en/articles/guidance-generative-ai-education-and-research) | Возрастной и human-centred дизайн, privacy и педагогическая валидация до применения |
| [OECD Digital Education Outlook 2026](https://www.oecd.org/en/publications/oecd-digital-education-outlook-2026_062a7394-en.html) | Выполненная с GenAI работа не равна обучению; нужны scaffolding, продуктивное усилие и проверка переноса навыка |
| [U.S. Department of Education: AI and the Future of Teaching and Learning](https://www.ed.gov/sites/ed/files/documents/ai-report/ai-report.pdf) | ИИ усиливает, а не вытесняет роль взрослого/учителя; обратная связь и ответственность остаются у человека |

## Здоровье и скрининг

| Источник | Что взято в каркас |
|---|---|
| [WHO Ethics and Governance of AI for Health](https://www.who.int/publications/i/item/9789240037403) | Автономия человека, безопасность, прозрачность, ответственность, равенство и постоянная оценка |
| [WHO guidance for large multimodal models in health](https://www.who.int/news/item/18-01-2024-who-releases-ai-ethics-and-governance-guidance-for-large-multi-modal-models) | Чёткая intended use, участие медиков и пользователей, независимый post-release audit |
| [WHO responsible AI for mental health, 2026](https://www.who.int/news/item/20-03-2026-towards-responsible-ai-for-mental-health-and-well-being--experts-chart-a-way-forward) | Совместное проектирование с mental-health специалистами и людьми с lived experience, включая молодёжь |
| [FDA Clinical Decision Support Guidance](https://www.fda.gov/regulatory-information/search-fda-guidance-documents/clinical-decision-support-software) | Функция для пациента/опекуна может попадать в регулируемую область; intended use важнее слова «помощник» в интерфейсе |
| [USPSTF: Depression and Suicide Risk Screening in Youth](https://www.uspreventiveservicestaskforce.org/uspstf/recommendation/screening-depression-suicide-risk-children-adolescents) | Возраст, популяция, точность, ложноположительные/ложноотрицательные результаты и наличие follow-up обязательны; доказательность разных скринингов различается |
| [USPSTF: Anxiety Screening in Youth](https://www.uspreventiveservicestaskforce.org/uspstf/index.php/recommendation/screening-anxiety-children-adolescents) | Нельзя переносить рекомендацию и порог между возрастами/популяциями без проверки |
| [WHO mhGAP Intervention Guide](https://www.who.int/publications/i/item/9789241549790) | Даже клинический алгоритм рассчитан на обученных работников и локальную адаптацию, поэтому LLM не копирует его как самостоятельную диагностику |

## API и orchestration

| Источник | Что взято в каркас |
|---|---|
| [RFC 7515: JSON Web Signature](https://www.rfc-editor.org/rfc/rfc7515.html) | Compact JWS подписывает protected header и точные payload octets; application сама ограничивает алгоритмы, проверяет `crit`, защищается от replay и строго разбирает JSON |
| [RFC 8785: JSON Canonicalization Scheme](https://www.rfc-editor.org/rfc/rfc8785.html) | Duplicate keys, NaN/Infinity и lone surrogate несовместимы с однозначной криптографической обработкой; JCS нужен там, где подпись или hash строятся после сериализации объекта |
| [DeepSeek JSON Output](https://api-docs.deepseek.com/guides/json_mode) | Валидный JSON может быть пустым или усечённым; обязательна локальная проверка полной схемы |
| [Gemini Structured Output](https://ai.google.dev/gemini-api/docs/structured-output) и [Safety Settings](https://ai.google.dev/gemini-api/docs/safety-settings) | Провайдер поддерживает подмножество JSON Schema; его safety-фильтр не заменяет оценку тяжести и продуктовую policy |
| [xAI Structured Outputs](https://docs.x.ai/developers/model-capabilities/text/structured-outputs) | Провайдерные structured outputs нормализуются общим adapter contract |
| [LangGraph human-in-the-loop](https://docs.langchain.com/oss/python/langchain/human-in-the-loop) | Interrupt/resume полезен для подтверждений, но требует постоянного checkpoint и идемпотентности повторно запускаемого узла |
| [Haystack evaluation](https://docs.haystack.deepset.ai/docs/evaluation) | Retrieval и end-to-end pipeline должны иметь отдельные статистические и model-based evals; LLM judge не единственный критерий |
| [Temporal architecture](https://github.com/temporalio/temporal/blob/main/docs/architecture/README.md) | Durable execution оправдано для долгих процессов, но избыточно для первого синхронного прототипа |

## Ограничение реестра

Ни один источник выше не сертифицирует Sheepfold и не доказывает, что конкретная реализация безопасна. Для России, Беларуси, Китая и нейтрального профиля отдельно потребуются актуальные правовые обзоры, локальные службы помощи, валидированные переводы и проверка реальной доступности специалистов.
