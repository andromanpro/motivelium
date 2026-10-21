# Сторонние компоненты Motivelium 0.1.0-alpha.3

Собственный код — MIT (LICENSE). Эти условия не заменяют лицензии перечисленных компонентов. Полный машинный перечень с SHA-256, исходными URL и индивидуальными CREDIT — licenses/manifest.json.

## Пакеты из production lockfile

| Пакет | Версия | Лицензия |
|---|---|---|
| buffer-crc32 | 1.0.0 | MIT |
| commander | 2.20.3 | MIT |
| d3-array | 1.2.4 | BSD-3-Clause |
| d3-polygon | 1.0.6 | BSD-3-Clause |
| earcut | 2.2.4 | ISC |
| flubber | 0.4.2 | MIT |
| pend | 1.2.0 | MIT |
| playwright-core | 1.62.1 | Apache-2.0 |
| react | 19.2.7 | MIT |
| react-dom | 19.2.7 | MIT |
| scheduler | 0.27.0 | MIT |
| svg-path-properties | 0.2.2 | ISC |
| svgpath | 2.6.0 | MIT |
| three | 0.180.0 | MIT |
| topojson-client | 3.1.0 | ISC |
| yauzl | 3.4.0 | MIT |
| yazl | 3.3.1 | MIT |

Полные LICENSE/NOTICE каждого пакета, включая вложенные уведомления playwright-core, находятся в licenses/npm/. Apache NOTICE сохранён, если присутствует в пакете.

## Шейдеры

352 подключённых программы: GL Transitions121 (119MIT, одинBSD-3-Clause Hewlett-Packard, одинBSD-2-Clause Theodore K Schundler), ISF191 (MIT репозитория VIDVOX и встроенные авторские уведомления), Radiant40 (MIT Paul Bakaus). Ещё72 программы — заготовки адаптации, не список работающих эффектов. Все424 исходника из закреплённых commit сохранены в licenses/shader-sources/ вместе с оригинальными CREDIT и метаданными. Собственная адаптация явно отмечена в manifest.json. Кометный шлейф отдельно использует VIDVOX Comet Tails/MIT (licenses/shaders/VIDVOX-feedback-MIT.txt).

Некоторые исходники ISF указывают на Shadertoy как на предшествующий источник. Здесь сохранены объявленная MIT коллекции и индивидуальные уведомления; наличие ссылки на Shadertoy не выдаётся за отдельное разрешение от автора оригинала. Это проверка заявленных условий полученных исходников, не гарантия прав на всю предысторию чужого кода.

## Runtime, модели и материалы

Node24.12.0 включает сторонний код под несколькими лицензиями: полный upstream LICENSE в licenses/runtime и runtime/node. WebView2 SDK DLL1.0.4258.31 — уведомление Microsoft в licenses/runtime и runtime/desktop. Evergreen Runtime и .NET предоставляются Microsoft отдельно.

ToyCar — CC0-1.0; Guido Odendahl и Eric Chadwick; проверен SHA закреплённой модели. Полный CC0 и исходный README — licenses/models/. Другие исследованные модели, CAD и картинки из прошлых роликов в этот установщик не включены.

Шаблоны: собственные программные сцены и синтезированная музыка без сторонних семплов, изображения image_gen. Их происхождение — licenses/media/template-sources.md. Системные шрифты не упакованы. Собственные материалы поставки разрешено использовать и менять вместе с шаблонами по MIT; права на пользовательские импорты этим не определяются.

## Установщик и внешние программы

NSIS3.13, без модификации движка; использовано zlib-сжатие, полный COPYING — licenses/installer/. [Условия NSIS](https://nsis.sourceforge.io/Docs/AppendixI.html). FFmpeg/FFprobe, Chrome/Chromium, Evergreen Runtime, .NET и Python не входят в установщик. Пользователь устанавливает их отдельно по собственным условиям. В частности, локальная тестовая GPL-сборка FFmpeg не переносится в дистрибутив.

Устаревший GSAP из www/vendor исключён из runtime: новая студия его не импортирует. Прежний прототип в исходной рабочей папке сохраняет GSAP Standard License; MIT приложения на него не распространяется. Исследовательские ссылки и репозитории в research/lab не становятся частью MIT-кода Motivelium.

