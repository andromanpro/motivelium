# Сторонние компоненты Motivelium 0.2.0-beta.1

## Экспериментальная молния, 29.10.2026

Прозрачный эффект `storm-lightning` использует адаптированные vertex/fragment GLSL и noise/common helpers из [achrefelouafi/LinearAbiltyCastingThreeJS](https://github.com/achrefelouafi/LinearAbiltyCastingThreeJS), commit `97f1de19617e9a2e3af3c8021c8c21c8f58b40f3`, MIT, Copyright (c) 2026 mohamedachrefelouafi. Полный текст лицензии — `licenses/lightning/MIT.txt`, закреплённые URL и SHA исходников — `licenses/lightning/sources.json`. Уведомления сохранены в адаптированных файлах `studio/render/lightning/`. Связь с настройками исходного приложения заменена детерминированными параметрами Motivelium; затухание по глубине исходной сцены отключено, поскольку слой компонуется отдельно. Это шейдерные ленты с ядром/ореолом, не новая физическая симуляция и не автоматическое освещение соседней 3D-модели. Старый `electric-arc` сохранён. Адаптация входит в текущий кандидат и используется в эффекте; опубликованный установщик alpha.3 не перепаковывался. Готовое демо One Strike описано в docs/EXAMPLES.md.

Собственный код — MIT (LICENSE). Эти условия не заменяют лицензии перечисленных компонентов. Полный машинный перечень с SHA-256, исходными URL и индивидуальными CREDIT — licenses/manifest.json.

## Пакеты из production lockfile

| Пакет | Версия | Лицензия |
|---|---|---|
| @modelcontextprotocol/core | 2.3.1 | Apache-2.0 |
| @modelcontextprotocol/server | 2.3.1 | Apache-2.0 |
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
| zod | 4.6.7 | MIT |

Полные LICENSE/NOTICE каждого пакета, включая вложенные уведомления playwright-core, находятся в licenses/npm/. Apache NOTICE сохранён, если присутствует в пакете.

MCP SDK: сохранены полные LICENSE/NOTICE пакетов @modelcontextprotocol/server и core. Их уведомления описывают переход лицензирования и сохранение условий исходных вкладов; значение Apache-2.0 из package.json не заменяет этот полный текст. Это рабочее дополнение после опубликованной alpha.3; прежний установщик не перепаковывался.

## Шейдеры

352 подключённых программы: GL Transitions121 (119MIT, одинBSD-3-Clause Hewlett-Packard, одинBSD-2-Clause Theodore K Schundler), ISF191 (MIT репозитория VIDVOX и встроенные авторские уведомления), Radiant40 (MIT Paul Bakaus). Ещё72 программы — заготовки адаптации, не список работающих эффектов. Все424 исходника из закреплённых commit сохранены в licenses/shader-sources/ вместе с оригинальными CREDIT и метаданными. Собственная адаптация явно отмечена в manifest.json. Кометный шлейф отдельно использует VIDVOX Comet Tails/MIT (licenses/shaders/VIDVOX-feedback-MIT.txt).

Некоторые исходники ISF указывают на Shadertoy как на предшествующий источник. Здесь сохранены объявленная MIT коллекции и индивидуальные уведомления; наличие ссылки на Shadertoy не выдаётся за отдельное разрешение от автора оригинала. Это проверка заявленных условий полученных исходников, не гарантия прав на всю предысторию чужого кода.

## Runtime, модели и материалы

Node24.12.0 включает сторонний код под несколькими лицензиями: полный upstream LICENSE в licenses/runtime и runtime/node. WebView2 SDK DLL1.0.4258.31 — уведомление Microsoft в licenses/runtime и runtime/desktop. Evergreen Runtime и .NET предоставляются Microsoft отдельно.

ToyCar — CC0-1.0; Guido Odendahl и Eric Chadwick; проверен SHA закреплённой модели. Полный CC0 и исходный README — licenses/models/. Также включены подготовленные модели и изображения встроенных примеров, перечисленные ниже и в www/examples/SOURCES.json; произвольные модели и прежние авторские проморолики не включаются автоматически.

Шаблоны: собственные программные сцены и синтезированная музыка без сторонних семплов, изображения image_gen. Их происхождение — licenses/media/template-sources.md. Системные шрифты не упакованы. Собственные материалы поставки разрешено использовать и менять вместе с шаблонами по MIT; права на пользовательские импорты этим не определяются.

## Установщик и внешние программы

NSIS3.13, без модификации движка; использовано zlib-сжатие, полный COPYING — licenses/installer/. [Условия NSIS](https://nsis.sourceforge.io/Docs/AppendixI.html). FFmpeg/FFprobe, Chrome/Chromium, Evergreen Runtime, .NET и Python не входят в установщик. Пользователь устанавливает их отдельно по собственным условиям. В частности, локальная тестовая GPL-сборка FFmpeg не переносится в дистрибутив.

Устаревший GSAP из www/vendor исключён из runtime: новая студия его не импортирует. Прежний прототип в исходной рабочей папке сохраняет GSAP Standard License; MIT приложения на него не распространяется. Исследовательские ссылки и репозитории в research/lab не становятся частью MIT-кода Motivelium.



## Звуки рабочей версии 27.10.2026

12 файлов Kenney из [Interface Sounds](https://kenney.nl/assets/interface-sounds) и [Impact Sounds](https://kenney.nl/assets/impact-sounds), CC0-1.0. Подготовленные WAV, оригинальные License.txt, источник и SHA каждого файла — `www/sounds/`. Подготовка: моно 48 кГц PCM16, удаление частот ниже 110 Гц, короткое появление и ограничитель без подъёма уровня. Лицензия сохраняется в дорожке и ZIP. Не каждый UI-сигнал является записью живого предмета.

Принципы opus-sound-layer и librosa изучены как референсы; их движки не включены в runtime. Для контрольного сравнения отдельно установлен librosa 0.11.0 в локальную тестовую среду, которая не входит в приложение и поставку. Это не изменение ранее опубликованного установщика.

## Встроенная типографика

Onest, Unbounded, Rubik Mono One и Literata Italic поставляются локально под SIL Open Font License 1.1. Оригинальные TTF, полные OFL с авторскими уведомлениями и закреплённые URL/SHA-256 находятся в `www/fonts/`. Насыщенность задаётся в документе. Шрифты не устанавливаются в Windows и не загружаются с внешнего сервиса при просмотре или экспорте.

## Демо «Материя», редакция 2026-10-28

В комплект примеров добавлена подготовленная модель Ingenuity, NASA / JPL-Caltech. Производный GLB с сохранёнными текстурами повторно использован из проверенной поставки «Механика — три сборки» от 20.10.2026. Источник — NASA-3D-Resources commit `11ebb4ee043715aefbba6aeec8a61746fad67fa7`, [страница модели](https://science.nasa.gov/3d-resources/ingenuity-mars-helicopter/), [правила NASA](https://www.nasa.gov/nasa-brand-center/images-and-media/). README, сохранённые правила, описание подготовки и авторство — `www/examples/credits/`; SHA-256 GLB — `www/examples/SOURCES.json`. Эти материалы не становятся MIT-кодом приложения. Использование не означает одобрения NASA; разнесение деталей иллюстративное.


## Демо v4, рабочая редакция 2026-10-28

Встроенная «Материя» v4 использует подготовленный Car Concept (Torched Graphite): исходная модель Unity Fan, модель и текстуры Eric Chadwick / ©2024 Darmstadt Graphics Group GmbH; CC BY 4.0. [Исходник Khronos](https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/CarConcept), [условия CC BY 4.0](https://creativecommons.org/licenses/by/4.0/legalcode). Уведомления, README и описание подготовки — `www/examples/credits/`; SHA — `www/examples/SOURCES.json`. Знаки Khronos / 3DCommerce сохраняют отдельные условия Legal Mark. Прежний Ingenuity остаётся в v3. Это изменение рабочей версии, не содержимого ранее выпущенного установщика. Авторство и ссылка на условия включены также в ресурс проекта `model-credits.md`; полные уведомления приложены к проверочной поставке.

Алгоритм электрической дуги и предметный подиум созданы внутри Motivelium; новый внешний движок не подключался. Иллюстрации коллажа повторно использованы из существующих шаблонов и материалов проекта, их анимация не превращает их в импортированные модели 3D.


## Материя / Зазор — производная Car Concept, 29.10.2026

Проверочная модель car-material-study.glb сохраняет авторство Car Concept (Unity Fan / Eric Chadwick / ©2024 Darmstadt Graphics Group GmbH) и CC BY4.0. Изменены диск и суппорт: сквозные отверстия, фаски, ступичная часть, щёки, перемычки, крепёж и программная карта нормалей. Иерархия остальных деталей сохранена. Подробная атрибуция, исходные ссылки и условия: www/examples/credits/Материя-Зазор.md. Производная модель не становится MIT-кодом приложения.

Проба «Под поверхностью» использует отдельную производную `car-macro-study.glb`: изменены объёмный корпус суппорта, крышки, кронштейн, крепёж и материалы кузова/колеса; убрана радужная иризация. Авторская иерархия 102 узлов и исходные текстуры сохранены. Условия CC BY 4.0 и отдельные условия товарных знаков сохраняются; подробности — `www/examples/credits/Материя-Макро.md`. Свет и контактная тень используют существующую Three.js под MIT; новый внешний движок или HDRI не добавлялись.
