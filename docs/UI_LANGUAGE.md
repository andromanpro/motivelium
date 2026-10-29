# Язык интерфейса / Interface language

Рабочий кандидат **0.1.0-alpha.4 / 20261029-alpha4-rc-en**. Откройте **Настройки → Просмотр → Язык интерфейса** и выберите **Русский / English**. В English: **Settings → Viewing → Interface language**. Язык и тема применяются сразу.

Новый профиль следует первому языку браузера (ru → русский, остальные → English); явная настройка имеет приоритет. Выбор хранится в текущем браузерном профиле/адресе, синхронизируется между вкладками. Другой профиль имеет собственный выбор. При запрете записи выбор действует временно с предупреждением.

## Что переводится

Основной маршрут, специальные панели, звук, 3D, эффекты, сравнение, раскадровка, ИИ-примерка и справка доступны на RU/EN. В **Примеры → Язык примеров** отдельно доступны четыре английских ролика; в **Шаблоны → Язык шаблонов** — Spectrum, Route, Signal. Начальный язык каталога берётся из UI. Подробности — [EXAMPLE_LANGUAGES.md](EXAMPLE_LANGUAGES.md).

Выбор языка не меняет открытый проект, кадр, выделение, неприменённые свойства или историю. Надписи ролика, авторские названия и имена деталей GLB остаются данными. Только новые пустые проекты получают начальные имена выбранного языка. Не применять перевод ко всему DOM или произвольному node.text.

## Для разработчика

locale.ts выбирает язык до запуска React, useInterfaceLocale.ts подписывает компоненты, i18n.ts и словари переводят явно отмеченные UI-сообщения. Intl форматирует даты и длительности. JSON, числовые поля, ID и MCP-команды стабильны. layerLabels.ts отделяет подписи типов от авторских имён.

Ошибки параметров имеют устойчивые ProjectSetupError.code. HTTP-статус определяет английский совет; исходные body/detail остаются раскрываемыми техническими данными. Некоторые старые серверные диагностические сообщения и MCP-описания сохраняют исходный язык.

## English quick route

1. Settings → Viewing → English. System/light/dark appearance is independent.
2. Examples → Example language → English, or Templates → Template language → English.
3. Preview, then create your independent copy. Existing projects are never translated automatically.
4. Edit Content or Properties, Apply, then Undo / Redo as needed.
5. Export → MP4 video creates H.264/AAC with the project audio.
6. File → Download project / Import project transfers editable content and media in ZIP.

Кандидат проверен в Chrome, Firefox MCP и настоящем Windows WebView2 EXE: Apply/Undo/Redo, сохранение после перезапуска, MP4 и ZIP. Нативный прогон использовал отдельные данные и opt-in QA; основной установленный экземпляр и публичная alpha.3 не изменены.
