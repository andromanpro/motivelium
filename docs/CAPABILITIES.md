# Карта возможностей Motivelium

Сверка 2026-10-31. Канонические данные — [capabilities.json](capabilities.json); новые приращения — [DEVELOPMENT.md](DEVELOPMENT.md).

**35 возможностей есть в исходниках выпущенной beta.1; 2 добавлены после неё; 2 — лаборатория/внешнее производство. 16 веток развития с отдельными статусами; их наличие не является поручением запустить их все. Статус выполненного этапа указан в его карточке.**

В последнем этапе новыми были MEDIA-02 (нативное видео) и MEDIA-03 (оформление записи). MCP, история, примерка, ZIP и ручная студия уже существовали и были повторно использованы.

## Как читать статусы

- «В beta.1» проверено по production-маркерам в архиве исходников сборки 20261030-beta1; это не новый запуск установленного EXE.
- «Рабочая сборка» означает реализацию и ограниченные технические проверки, но ещё не поставку пользователям.
- «Лаборатория» — отдельный HTML/скрипт/фильм, который нельзя объявить функцией студии.
- «Готово» в техническом смысле не означает художественную приёмку. Конкретный ярлык и все GPU этой картой не проверялись.

42 определения эффектов; отдельно shader-bank: 66 генераторов, 110 фильтров, 176 переходов; 3 сочетания; 37 MCP-инструментов. Это разные уровни каталога, не сумма уникальных художественных возможностей.

`node tools/capability-map.mjs --find "курсор"` — поиск перед новой задачей. `--check` — проверка ссылок/маркеров/SHA, статусов, зависимостей и счётчиков. Изменившийся SHA требует перечитать основание, а не автоматически признать функцию сломанной.

## Основа и история

| ID и возможность | Где доступно | Ручная работа / MCP |
|---|---|---|
| [CORE-01 · Документ, сцены и ресурсы](#core-01) | В исходниках выпущенной beta.1 | Да / Обычные операции |
| [CORE-02 · Операции, ревизии и история](#core-02) | В исходниках выпущенной beta.1 | Да / Отдельный инструмент |
| [CORE-03 · Общий покадровый рендер](#core-03) | В исходниках выпущенной beta.1 | Да / Отдельный инструмент |

## Замысел и раскадровка

| ID и возможность | Где доступно | Ручная работа / MCP |
|---|---|---|
| [PLAN-01 · Раскадровка внутри проекта](#plan-01) | В исходниках выпущенной beta.1 | Да / Отдельный инструмент |
| [PLAN-02 · Сборка сцен из раскадровки](#plan-02) | В исходниках выпущенной beta.1 | Да / Отдельный инструмент |

## Ручная шлифовка

| ID и возможность | Где доступно | Ручная работа / MCP |
|---|---|---|
| [EDIT-01 · Ручная работа со слоями](#edit-01) | В исходниках выпущенной beta.1 | Да / Обычные операции |
| [EDIT-02 · Перемещение и размер на холсте](#edit-02) | В исходниках выпущенной beta.1 | Да / Обычные операции |
| [EDIT-03 · Ключи движения и размера](#edit-03) | В исходниках выпущенной beta.1 | Да / Обычные операции |
| [EDIT-04 · Камеры и пролёты](#edit-04) | В исходниках выпущенной beta.1 | Частично / Обычные операции |
| [EDIT-05 · Сравнение версий](#edit-05) | В исходниках выпущенной beta.1 | Да / Обычные операции |

## Создание и проверка через ИИ

| ID и возможность | Где доступно | Ручная работа / MCP |
|---|---|---|
| [AI-01 · Внешний MCP для сборки ролика](#ai-01) | В исходниках выпущенной beta.1 | Частично / Отдельный инструмент |
| [AI-02 · Компактное чтение и каталоги](#ai-02) | В исходниках выпущенной beta.1 | Да / Отдельный инструмент |
| [AI-03 · Рецепты времени и превью переходов](#ai-03) | В исходниках выпущенной beta.1 | Частично / Отдельный инструмент |
| [AI-04 · Черновики, реальные кадры и бюджет](#ai-04) | В исходниках выпущенной beta.1 | Да / Отдельный инструмент |
| [AI-05 · Встроенный GLM видит и проверяет объект](#ai-05) | В исходниках выпущенной beta.1 | Да / Нет / не требуется |

## Визуальный язык

| ID и возможность | Где доступно | Ручная работа / MCP |
|---|---|---|
| [FX-01 · Накопление, шлейфы и дым](#fx-01) | В исходниках выпущенной beta.1 | Да / Обычные операции |
| [FX-02 · Превращения контуров и маски](#fx-02) | В исходниках выпущенной beta.1 | Да / Обычные операции |
| [FX-03 · Детали 3D и импорт моделей](#fx-03) | В исходниках выпущенной beta.1 | Да / Отдельный инструмент |
| [FX-04 · Объёмный свет и материалы](#fx-04) | В исходниках выпущенной beta.1 | Да / Обычные операции |
| [FX-05 · Готовые редактируемые сочетания](#fx-05) | В исходниках выпущенной beta.1 | Да / Отдельный инструмент |
| [FX-06 · Шейдерный банк и галерея](#fx-06) | В исходниках выпущенной beta.1 | Да / Отдельный инструмент |
| [FX-07 · Кинетическая типографика](#fx-07) | В исходниках выпущенной beta.1 | Да / Обычные операции |
| [FX-08 · ASCII-анимация](#fx-08) | В исходниках выпущенной beta.1 | Да / Обычные операции |
| [FX-09 · Электричество и предметная сцена](#fx-09) | В исходниках выпущенной beta.1 | Да / Обычные операции |

## Материалы и скринкасты

| ID и возможность | Где доступно | Ручная работа / MCP |
|---|---|---|
| [MEDIA-01 · Импорт изображений, аудио и моделей](#media-01) | В исходниках выпущенной beta.1 | Да / Отдельный инструмент |
| [MEDIA-02 · Нативный MP4-видеослой](#media-02) | Рабочая сборка, ещё не в выпуске | Да / Обычные операции |
| [MEDIA-03 · Курсор, щелчки и автозум записи](#media-03) | Рабочая сборка, ещё не в выпуске | Да / Отдельный инструмент |

## Звук и музыкальный монтаж

| ID и возможность | Где доступно | Ручная работа / MCP |
|---|---|---|
| [AUDIO-01 · Дорожки и общий микс](#audio-01) | В исходниках выпущенной beta.1 | Да / Обычные операции |
| [AUDIO-02 · Звуки на действия](#audio-02) | В исходниках выпущенной beta.1 | Да / Отдельный инструмент |
| [AUDIO-03 · Музыкальная сетка и метки](#audio-03) | В исходниках выпущенной beta.1 | Да / Отдельный инструмент |

## Экспорт и перенос

| ID и возможность | Где доступно | Ручная работа / MCP |
|---|---|---|
| [OUT-01 · Экспорт MP4 со звуком](#out-01) | В исходниках выпущенной beta.1 | Да / Отдельный инструмент |
| [OUT-02 · Переносимый ZIP](#out-02) | В исходниках выпущенной beta.1 | Да / Отдельный инструмент |

## Приложение и поставка

| ID и возможность | Где доступно | Ручная работа / MCP |
|---|---|---|
| [UX-01 · Проекты, навигация и хранилище](#ux-01) | В исходниках выпущенной beta.1 | Да / Отдельный инструмент |
| [UX-02 · Шаблоны и примеры](#ux-02) | В исходниках выпущенной beta.1 | Да / Отдельный инструмент |
| [UX-03 · Темы и языки](#ux-03) | В исходниках выпущенной beta.1 | Да / Нет / не требуется |
| [UX-04 · Иллюстрированная справка и компоненты](#ux-04) | В исходниках выпущенной beta.1 | Да / Нет / не требуется |
| [DIST-01 · Windows EXE, Setup, portable и лицензии](#dist-01) | В исходниках выпущенной beta.1 | Да / Нет / не требуется |

## Лаборатория и внешнее производство

| ID и возможность | Где доступно | Ручная работа / MCP |
|---|---|---|
| [LAB-01 · Исторические HTML-фильмы и раскадровки](#lab-01) | Лаборатория / внешний процесс | Внешний процесс / Нет / не требуется |
| [LAB-02 · Платная двухголосая озвучка урока](#lab-02) | Лаборатория / внешний процесс | Внешний процесс / Нет / не требуется |

## Границы и основания по каждой возможности

<a id="core-01"></a>
### CORE-01 — Документ, сцены и ресурсы

Project v2, строгая схема, иерархия узлов, рациональный FPS, идентификаторы, ресурсы и семена.

**Граница:** Изменение размера/FPS готового монтажа не равно созданию проекта нового формата.

**Реализация:** [studio/domain/schema.ts](../studio/domain/schema.ts) · `validateProject`.

**Проверки:** [studio/tests/schema.test.ts](../studio/tests/schema.test.ts); [studio/tests/schema-strict.test.ts](../studio/tests/schema-strict.test.ts)

<a id="core-02"></a>
### CORE-02 — Операции, ревизии и история

Пакеты правок, проверка ревизии, явное применение, Undo/Redo и защита повторных запросов.

**Граница:** История отмен локальна и не переносится как прежняя история через ZIP.

**Реализация:** [studio/domain/operations.ts](../studio/domain/operations.ts) · `applyOperations`; [server/storage.ts](../server/storage.ts) · `expectedRevision`.

**Проверки:** [studio/tests/transaction.test.ts](../studio/tests/transaction.test.ts); [studio/tests/storage-protocol.test.ts](../studio/tests/storage-protocol.test.ts)

<a id="core-03"></a>
### CORE-03 — Общий покадровый рендер

Один расчёт кадра для студии, PNG/MCP и MP4, обычные и двухкадровые переходы.

**Граница:** Равенство графа/времени не обещает побитно одинаковую картинку на разных GPU.

**Реализация:** [studio/render/evaluate.ts](../studio/render/evaluate.ts) · `evaluateFrame`; [studio/render/renderFrame.ts](../studio/render/renderFrame.ts) · `renderFrame`.

**Проверки:** [studio/tests/render.test.ts](../studio/tests/render.test.ts); [studio/tests/time-matrix.test.ts](../studio/tests/time-matrix.test.ts)

<a id="plan-01"></a>
### PLAN-01 — Раскадровка внутри проекта

Замысел, карточки, эскизы, снимки монтажа, источники, замечания и связь со сценами.

**Граница:** Состояние «Выбран» не означает приёмку; перестановка карточки сама не перестраивает монтаж.

**Реализация:** [studio/domain/storyboard.ts](../studio/domain/storyboard.ts) · `storySignature`; [mcp/storyboard.ts](../mcp/storyboard.ts) · `listStoryboard`.

**Проверки:** [studio/tests/storyboard.test.ts](../studio/tests/storyboard.test.ts)

<a id="plan-02"></a>
### PLAN-02 — Сборка сцен из раскадровки

Редактируемая заготовка из выбранных карточек: screen/poster/data, примерка, применение и отмена.

**Граница:** Заготовку нужно режиссировать; это не автоматический качественный фильм по любой статье.

**Реализация:** [studio/domain/storyMontage.ts](../studio/domain/storyMontage.ts) · `buildStoryMontage`; [mcp/bridge.ts](../mcp/bridge.ts) · `assemble_storyboard`.

**Проверки:** [studio/tests/storyboard.test.ts](../studio/tests/storyboard.test.ts)

<a id="edit-01"></a>
### EDIT-01 — Ручная работа со слоями

Добавление, удаление, выбор, миниатюры, видимость, блокировка и свойства.

**Граница:** Детали 3D выбираются в отдельной мастерской модели.

**Реализация:** [studio/src/editor/TreePanel.tsx](../studio/src/editor/TreePanel.tsx) · `data-node-id`; [studio/src/editor/LayerDialog.tsx](../studio/src/editor/LayerDialog.tsx) · `LayerDialog`.

**Проверки:** [studio/tests/layers.test.ts](../studio/tests/layers.test.ts)

<a id="edit-02"></a>
### EDIT-02 — Перемещение и размер на холсте

Перетаскивание, углы размера, порядок слоёв перетаскиванием, обычная отмена.

**Граница:** Это редактирование узлов, не отдельный свободный видеомонтаж NLE.

**Реализация:** [studio/src/editor/useCanvasTransform.ts](../studio/src/editor/useCanvasTransform.ts) · `useCanvasTransform`; [studio/src/editor/useLayerOrder.ts](../studio/src/editor/useLayerOrder.ts) · `useLayerOrder`.

**Проверки:** [studio/tests/direct-manipulation.test.ts](../studio/tests/direct-manipulation.test.ts)

<a id="edit-03"></a>
### EDIT-03 — Ключи движения и размера

Transform keys положения, масштаба, поворота и прозрачности; smooth/linear/hold.

**Граница:** Графического редактора произвольных кривых пока нет.

**Реализация:** [studio/domain/animation.ts](../studio/domain/animation.ts) · `transformAtFrame`; [studio/src/editor/KeyframePanel.tsx](../studio/src/editor/KeyframePanel.tsx) · `KeyframePanel`.

**Проверки:** [studio/tests/animation.test.ts](../studio/tests/animation.test.ts)

<a id="edit-04"></a>
### EDIT-04 — Камеры и пролёты

Общая камера и камеры интервалов; числовая ручная правка scoped-камер в «Композиции → Камера и звук».

**Граница:** Не считать камеры отсутствующими. Единая визуальная дорожка всех камер/траекторий и кривых — отдельное расширение.

**Реализация:** [studio/render/evaluate.ts](../studio/render/evaluate.ts) · `cameraAtFrame`; [studio/src/editor/CompositionLibrary.tsx](../studio/src/editor/CompositionLibrary.tsx) · `function CameraEditor`.

**Проверки:** [studio/tests/compositions.test.ts](../studio/tests/compositions.test.ts)

<a id="edit-05"></a>
### EDIT-05 — Сравнение версий

Синхронное сопоставление проектов/версий с перемоткой и общим звуком.

**Граница:** HTML-страницы истории роликов отдельно; наличие сравнения не означает автоматическое слияние версий.

**Реализация:** [studio/src/editor/ProjectComparison.tsx](../studio/src/editor/ProjectComparison.tsx) · `ProjectComparison`; [studio/domain/comparison.ts](../studio/domain/comparison.ts) · `export`.

**Проверки:** [studio/tests/comparison.test.ts](../studio/tests/comparison.test.ts)

<a id="ai-01"></a>
### AI-01 — Внешний MCP для сборки ролика

Проекты, импорт, сцены, узлы, эффекты, раскадровка, звук, примерки и экспорт через stdio.

**Граница:** Модель живёт во внешнем ИИ-клиенте; встроенный GLM и MCP — разные подключения.

**Реализация:** [mcp/server.mjs](../mcp/server.mjs) · `serveStdio`; [mcp/bridge.ts](../mcp/bridge.ts) · `createBridge`.

**Проверки:** [studio/tests/mcp.test.ts](../studio/tests/mcp.test.ts); [studio/tests/mcp-installed-config.test.ts](../studio/tests/mcp-installed-config.test.ts)

<a id="ai-02"></a>
### AI-02 — Компактное чтение и каталоги

Пагинация объектов/эффектов/карточек, свойства по ID, каталоги и стабильные идентификаторы категорий.

**Граница:** Усечённые поля помечены; их нельзя возвращать как полную замену.

**Реализация:** [mcp/query.ts](../mcp/query.ts) · `QUERY_MAX_BYTES`; [mcp/catalog.ts](../mcp/catalog.ts) · `searchCatalog`.

**Проверки:** [studio/tests/catalogIds.test.ts](../studio/tests/catalogIds.test.ts); [studio/tests/mcp.test.ts](../studio/tests/mcp.test.ts)

<a id="ai-03"></a>
### AI-03 — Рецепты времени и превью переходов

Появление/уход без предварительного показа текста, настоящие A→B образцы переходов.

**Граница:** Наличие рецепта не снимает проверки первого/последнего кадра и стыка.

**Реализация:** [mcp/recipes.ts](../mcp/recipes.ts) · `timingOperations`; [mcp/transitions.ts](../mcp/transitions.ts) · `transitionSample`.

**Проверки:** [studio/tests/motionTiming.test.ts](../studio/tests/motionTiming.test.ts)

<a id="ai-04"></a>
### AI-04 — Черновики, реальные кадры и бюджет

propose/refine/render/apply, PNG и короткий клип, общий лимит итераций/превью/времени.

**Граница:** Короткий MCP render_clip без звука; для звука есть студия и полный MP4. Новый draft не сбрасывает бюджет.

**Реализация:** [mcp/budget.ts](../mcp/budget.ts) · `createRunBudget`; [mcp/bridge.ts](../mcp/bridge.ts) · `renderSnapshot`.

**Проверки:** [studio/tests/mcp.test.ts](../studio/tests/mcp.test.ts)

<a id="ai-05"></a>
### AI-05 — Встроенный GLM видит и проверяет объект

Видит кадры до/после выбранного объекта, предлагает правку, ограниченно проверяет и дорабатывает.

**Граница:** Это проверка примерки объекта, не встроенный аудит всего фильма, речи и непрерывного движения.

**Реализация:** [studio/src/editor/AIEditor.tsx](../studio/src/editor/AIEditor.tsx) · `AIEditor`; [server/ai/auto.ts](../server/ai/auto.ts).

**Проверки:** [studio/tests/ai-visual.test.ts](../studio/tests/ai-visual.test.ts); [studio/tests/ai-auto.test.ts](../studio/tests/ai-auto.test.ts)

<a id="fx-01"></a>
### FX-01 — Накопление, шлейфы и дым

Готовые многопроходные эффекты, память движения, восстановление состояния при перемотке.

**Граница:** Ограниченные поля/allowlist; не универсальный импорт любого ISF/compute. История видеокадров пока отключена.

**Реализация:** [studio/render/stateReplay.ts](../studio/render/stateReplay.ts); [studio/render/feedbackRenderer.ts](../studio/render/feedbackRenderer.ts) · `renderFeedback`.

**Проверки:** [studio/tests/feedback.test.ts](../studio/tests/feedback.test.ts)

<a id="fx-02"></a>
### FX-02 — Превращения контуров и маски

Формы, SVG-контур, контурное окно, органическое раскрытие и растворение.

**Граница:** Не любое превращение произвольных объектов и топологий.

**Реализация:** [studio/effects/contours.ts](../studio/effects/contours.ts) · `morphContour`; [studio/render/layerMasks.ts](../studio/render/layerMasks.ts) · `maskLayer`.

**Проверки:** [studio/tests/contours.test.ts](../studio/tests/contours.test.ts)

<a id="fx-03"></a>
### FX-03 — Детали 3D и импорт моделей

Статические GLB/GLTF, выбор деталей, разборка/сборка, ключи частей и 3D-камеры.

**Граница:** Универсальный проигрыватель animation clips, skins и morph targets не реализован.

**Реализация:** [studio/domain/model3d.ts](../studio/domain/model3d.ts) · `PartEdit`; [studio/src/editor/ModelWorkshop.tsx](../studio/src/editor/ModelWorkshop.tsx) · `ModelWorkshop`.

**Проверки:** [studio/tests/model3d.test.ts](../studio/tests/model3d.test.ts)

<a id="fx-04"></a>
### FX-04 — Объёмный свет и материалы

Глубина/туман, материалы, свечение, обработка и отдельный полноразмерный основной 3D-проход.

**Граница:** Лимиты GPU/качества сохраняются. Проверка одного устройства не означает все GPU.

**Реализация:** [studio/render/volume3d.ts](../studio/render/volume3d.ts); [studio/effects/lighting3d.ts](../studio/effects/lighting3d.ts).

**Проверки:** [studio/tests/lighting3d.test.ts](../studio/tests/lighting3d.test.ts)

<a id="fx-05"></a>
### FX-05 — Готовые редактируемые сочетания

Фокус, Реплика, Орбита: камера, текст, частицы, свет и звуковой акцент.

**Граница:** Три встроенных сочетания; пользовательская библиотека рецептов — отдельное расширение.

**Реализация:** [studio/domain/compositions.ts](../studio/domain/compositions.ts) · `COMPOSITIONS`; [mcp/bridge.ts](../mcp/bridge.ts) · `propose_composition`.

**Проверки:** [studio/tests/compositions.test.ts](../studio/tests/compositions.test.ts)

<a id="fx-06"></a>
### FX-06 — Шейдерный банк и галерея

Генераторы фона, фильтры и двухкадровые переходы, живые образцы и примерка.

**Граница:** Количество элементов не гарантирует художественное качество каждой композиции.

**Реализация:** [studio/effects/shaders/library.ts](../studio/effects/shaders/library.ts) · `SHADERS`; [studio/src/editor/ShaderLibrary.tsx](../studio/src/editor/ShaderLibrary.tsx) · `ShaderLibrary`.

**Проверки:** [studio/tests/shader-library.test.ts](../studio/tests/shader-library.test.ts)

<a id="fx-07"></a>
### FX-07 — Кинетическая типографика

Шрифты/начертания, движение глифов, сборка фрагментов и контурный леттеринг.

**Граница:** Контурный леттеринг использует встроенный атлас; произвольный загруженный шрифт не становится автоматически морфингом.

**Реализация:** [studio/effects/typography.ts](../studio/effects/typography.ts); [studio/render/glyphMotion.ts](../studio/render/glyphMotion.ts) · `drawGlyphMotion`.

**Проверки:** [studio/tests/typography.test.ts](../studio/tests/typography.test.ts); [studio/tests/glyphMotion.test.ts](../studio/tests/glyphMotion.test.ts)

<a id="fx-08"></a>
### FX-08 — ASCII-анимация

Преобразование слоя в ASCII, волны/вихрь/дождь/рыбки, параметры и примерка.

**Граница:** Ограниченная сетка; это нативный эффект, а не установка всех найденных ASCII-проектов.

**Реализация:** [studio/render/typography.ts](../studio/render/typography.ts) · `asciiLayer`; [studio/effects/registry.ts](../studio/effects/registry.ts) · `'ascii-screen'`.

**Проверки:** [studio/tests/typography.test.ts](../studio/tests/typography.test.ts)

<a id="fx-09"></a>
### FX-09 — Электричество и предметная сцена

Дуги, Storm Lance, 3D-разряд с освещением, подиум и предметная постановка.

**Граница:** Готовый технический эффект не равен принятому дизайну кадра.

**Реализация:** [studio/effects/registry.ts](../studio/effects/registry.ts) · `'3d-discharge'`; [studio/render/lightningBolt.ts](../studio/render/lightningBolt.ts).

**Проверки:** [studio/tests/dischargePilot.test.ts](../studio/tests/dischargePilot.test.ts); [studio/tests/electricArc.test.ts](../studio/tests/electricArc.test.ts)

<a id="media-01"></a>
### MEDIA-01 — Импорт изображений, аудио и моделей

Ресурсы PNG/JPEG/WebP, WAV/MP3, статические модели, проверка и добавление в сцену.

**Граница:** Общий ресурс до64МиБ; модели имеют отдельный более строгий лимит.

**Реализация:** [server/mediaAssets.ts](../server/mediaAssets.ts) · `createMediaService`; [studio/src/editor/ResourcePanel.tsx](../studio/src/editor/ResourcePanel.tsx) · `ResourcePanel`.

**Проверки:** [studio/tests/media-assets.test.ts](../studio/tests/media-assets.test.ts)

<a id="media-02"></a>
### MEDIA-02 — Нативный MP4-видеослой

H264/AAC CFR, обрезка, скорость, hold/hide, связанный звук, общий декодер UI/MCP/MP4.

**Граница:** Только рабочая сборка после beta.1. До64МиБ, CFR1–120, до4096px; скорость меняет высоту звука. Начало видео привязано к началу сцены.

**Реализация:** [studio/domain/schema.ts](../studio/domain/schema.ts) · `kind:'video'`; [server/videoFrames.ts](../server/videoFrames.ts) · `createVideoFrames`.

**Проверки:** [studio/tests/video-clips.test.ts](../studio/tests/video-clips.test.ts)

<a id="media-03"></a>
### MEDIA-03 — Курсор, щелчки и автозум записи

Точки внимания во времени/координатах исходника, локальное приближение, ручная постановка и JSON.

**Граница:** Только рабочая сборка. Точки заданы/импортированы, а не распознаны из пикселей. Захвата экрана пока нет; проба4.4с на ревью.

**Реализация:** [studio/domain/screenGuide.ts](../studio/domain/screenGuide.ts) · `screenGuideAt`; [mcp/bridge.ts](../mcp/bridge.ts) · `propose_screen_guide`.

**Проверки:** [studio/tests/screenGuide.test.ts](../studio/tests/screenGuide.test.ts)

<a id="audio-01"></a>
### AUDIO-01 — Дорожки и общий микс

Громкость/смещение/mute, trim/fade/pan/duck, общий PCM предпросмотра и MP4.

**Граница:** Нет визуальной обрезки за края полос, шин/плагинов DAW и сохранения высоты при скорости видео.

**Реализация:** [studio/domain/audio.ts](../studio/domain/audio.ts) · `mixProjectAudio`; [studio/src/editor/AudioWorkshop.tsx](../studio/src/editor/AudioWorkshop.tsx) · `AudioWorkshop`.

**Проверки:** [studio/tests/audio-montage.test.ts](../studio/tests/audio-montage.test.ts)

<a id="audio-02"></a>
### AUDIO-02 — Звуки на действия

CC0-библиотека, прослушивание, постановка начала/пика/конца на кадр, кредиты и синтезированные акценты.

**Граница:** Это библиотека SFX и короткие акценты, не генератор полной музыки.

**Реализация:** [server/soundLibrary.ts](../server/soundLibrary.ts); [mcp/bridge.ts](../mcp/bridge.ts) · `propose_sound`.

**Проверки:** [studio/tests/audio-montage.test.ts](../studio/tests/audio-montage.test.ts)

<a id="audio-03"></a>
### AUDIO-03 — Музыкальная сетка и метки

Локальные BPM/атаки/волна, ручная правка первой доли и темпа, авторские метки и привязка ключа.

**Граница:** Это собственный JS-анализ, не установленная librosa. Музыкальный смысл/фразы автоматически не распознаются.

**Реализация:** [studio/domain/musicAnalysis.ts](../studio/domain/musicAnalysis.ts) · `analyzeMusic`; [mcp/bridge.ts](../mcp/bridge.ts) · `propose_music_grid`.

**Проверки:** [studio/tests/audio-montage.test.ts](../studio/tests/audio-montage.test.ts)

<a id="out-01"></a>
### OUT-01 — Экспорт MP4 со звуком

Экспорт неизменяемой ревизии, статус/отмена/готовый файл, проверка параметров и числа кадров.

**Граница:** Одно задание; до5мин/36000кадров/120fps/4096px. Внешние Chrome/FFmpeg/FFprobe.

**Реализация:** [server/videoExport.ts](../server/videoExport.ts) · `snapshot.json`.

**Проверки:** [studio/tests/video-export.test.ts](../studio/tests/video-export.test.ts)

<a id="out-02"></a>
### OUT-02 — Переносимый ZIP

Документ, модели/картинки/музыка/видео, SHA и требования читателя; импорт независимой копией.

**Граница:** История отмен и готовые MP4 в ZIP проекта не входят;256МиБ/64МиБ на ресурс.

**Реализация:** [studio/domain/projectPackage.ts](../studio/domain/projectPackage.ts) · `packageFeatures`; [server/projectPackage.ts](../server/projectPackage.ts) · `exportProject`.

**Проверки:** [studio/tests/project-package.test.ts](../studio/tests/project-package.test.ts); [studio/tests/package-api.test.ts](../studio/tests/package-api.test.ts)

<a id="ux-01"></a>
### UX-01 — Проекты, навигация и хранилище

Новый проект, копии, настройки, папка данных, безопасный перенос из другой библиотеки.

**Граница:** Разные установки могут смотреть в разные папки; автоматического молчаливого объединения нет.

**Реализация:** [studio/src/editor/ProjectHome.tsx](../studio/src/editor/ProjectHome.tsx) · `ProjectHome`; [server/libraryImport.ts](../server/libraryImport.ts).

**Проверки:** [studio/tests/project-start.test.ts](../studio/tests/project-start.test.ts); [studio/tests/onboarding.test.ts](../studio/tests/onboarding.test.ts)

<a id="ux-02"></a>
### UX-02 — Шаблоны и примеры

Четыре примера, три шаблона, просмотр без изменения, своя копия, замена материалов, RU/EN-контент.

**Граница:** Сохранения своих шаблонов в общий каталог пока нет; художественное качество — отдельная оценка.

**Реализация:** [server/examples.ts](../server/examples.ts); [studio/domain/templates.ts](../studio/domain/templates.ts).

**Проверки:** [studio/tests/templates.test.ts](../studio/tests/templates.test.ts); [studio/tests/allLanguages.test.ts](../studio/tests/allLanguages.test.ts)

<a id="ux-03"></a>
### UX-03 — Темы и языки

Системная/светлая/тёмная, RU/EN UI и справка, отдельные языковые варианты встроенного контента.

**Граница:** Язык не переводит пользовательский проект; тема не меняет кадр/экспорт.

**Реализация:** [studio/src/editor/appearance.ts](../studio/src/editor/appearance.ts) · `setAppearance`; [studio/src/editor/locale.ts](../studio/src/editor/locale.ts) · `setInterfaceLocale`.

**Проверки:** [studio/tests/appearance.test.ts](../studio/tests/appearance.test.ts); [studio/tests/locale.test.ts](../studio/tests/locale.test.ts)

<a id="ux-04"></a>
### UX-04 — Иллюстрированная справка и компоненты

Короткие маршруты с настоящими снимками, диагностика Chrome/FFmpeg/FFprobe, локальная помощь.

**Граница:** Новые разделы видеослоя/автозума есть только в рабочей сборке; сам механизм справки уже в beta.1.

**Реализация:** [studio/src/editor/HelpGuide.tsx](../studio/src/editor/HelpGuide.tsx) · `HelpGuide`; [server/runtime.ts](../server/runtime.ts) · `runtimeTools`.

**Проверки:** [studio/tests/onboarding.test.ts](../studio/tests/onboarding.test.ts)

<a id="dist-01"></a>
### DIST-01 — Windows EXE, Setup, portable и лицензии

Собственный код MIT, комплект runtime, UAC установки, обычный запуск, сохранение проектов при обновлении/удалении.

**Граница:** Новые видео/ScreenGuide не включены в опубликованную beta.1. Нет сертификата издателя/автообновления; не все GPU/Windows проверены.

**Реализация:** [desktop/Program.cs](../desktop/Program.cs) · `GetDataRoot`; [tools/prepare-runtime.mjs](../tools/prepare-runtime.mjs).

**Проверки:** [studio/tests/runtime-installation.test.ts](../studio/tests/runtime-installation.test.ts)

<a id="lab-01"></a>
### LAB-01 — Исторические HTML-фильмы и раскадровки

Постановки и собственные сцены из www/demos и www/storyboards; источник художественных решений.

**Граница:** Готовый HTML/MP4 не равен редактируемому нативному механизму студии.

**Реализация:** [www/player.js](../www/player.js).

**Проверки:** Это внешний/лабораторный результат; не набор продуктовых тестов.

<a id="lab-02"></a>
### LAB-02 — Платная двухголосая озвучка урока

Внешний производственный процесс уже использован для практического урока.

**Граница:** Это результат внешних скриптов/сервиса, а не встроенная TTS-панель или MCP-инструмент Motivelium.

**Реализация:** [Поставки/2026-10-30_Motivelium_Видеоурок/Результат.md](../%D0%9F%D0%BE%D1%81%D1%82%D0%B0%D0%B2%D0%BA%D0%B8/2026-10-30_Motivelium_%D0%92%D0%B8%D0%B4%D0%B5%D0%BE%D1%83%D1%80%D0%BE%D0%BA/%D0%A0%D0%B5%D0%B7%D1%83%D0%BB%D1%8C%D1%82%D0%B0%D1%82.md).

**Проверки:** Это внешний/лабораторный результат; не набор продуктовых тестов.

## Защита от повторной разработки

1. Найти существующую возможность по ID/синонимам; отсутствие совпадения поиска не доказывает отсутствие функции.
2. Проверить UI, MCP, ядро и фактический выпуск отдельно. Не путать скрытый пункт меню с отсутствием реализации.
3. Сформулировать новое приращение: «расширяем X, добавляем Y, проверяем Z». Привязать задачу к существующим ID.
4. Сначала использовать обычные операции, renderer, историю, ресурсы и экспорт; не создавать их второй вариант.
5. После изменения обновить статусы/границы/основания и выполнить `--check`, затем `--build`. Архивные планы — история, не очередь работ.

**Примеры:** «сделать MCP» → AI-01 уже есть; «добавить автозум» → MEDIA-03 уже есть; «записывать щелчки при захвате» → NEXT-02 новое; «собрать из карточек» → PLAN-02 уже есть; «нарисовать замечания поверх эскиза» → NEXT-04 новое.
