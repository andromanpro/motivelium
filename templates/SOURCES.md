# Стартовые шаблоны Motivelium, версия 1

Созданы 20.10.2026 для R3. Папки `spectrum/1`, `route/1`, `signal/1` содержат снимок проекта, manifest и собственные ресурсы. Галерея читает их через отдельный API; создание переносит снимок и байты в новый проект. Транзакции редактора к этим папкам не обращаются. Для будущих изменений опубликованного шаблона нужна новая версия, а не тихая замена v1.

Сцены, типографика, частицы, ключи и камеры созданы кодом `tools/build-template-projects.mjs`. По умолчанию этот инструмент отказывается перезаписывать существующую версию; `--replace-draft` предназначен только для подготовки ещё не выпущенного материала. Музыка — оригинальный программный синтез `tools/build-template-music.mjs`, без внешних семплов. Темы: Спектр120BPM/12с, Маршрут80BPM/18с, Сигнал160BPM/12с. Сохранены исходные WAV и MP3 для воспроизведения; в проекты копируется MP3.

Два изображения созданы встроенным `image_gen` по навыку imagegen. Копии сохранены в `templates/assets/titanium-knot.png` и `templates/assets/coastal-road.png`; исходные результаты генератора сохранены на прежнем месте. Это иллюстрации, а не фотографии реального предмета и локации. Текст поверх изображений не запечён: он остаётся слоями.

Эта запись описывает происхождение материалов, не устанавливает лицензию всего приложения. Общий лицензионный пакет остаётся этапом R6. Переходы GL Transitions и другие эффекты используют уже включённый в Motivelium каталог; сведения об их внешних авторах сохраняются в существующем каталоге/лицензиях. Системные шрифты не копируются в эти проекты.

## Набор промптов

Использован встроенный инструмент; внешний API/CLI генерации не запускался.

**Титан и стекло:**

Use case: stylized-concept. Asset type: photographic hero artwork for an editable premium motion design template. Primary request: create a breathtaking sculptural still life of one continuous folded brushed titanium ribbon, forming an intricate floating toroidal knot, lit by thin acid lime and warm pearl reflections. Photoreal studio product photography, carefully engineered surface microtexture and subtle machining scratches, smoked translucent glass inner loop, realistic shadows and reflections. Dark graphite studio background, shallow atmospheric depth. Wide 16:9 composition, entire sculptural knot on the RIGHT TWO THIRDS, generous very dark clean negative space on the left for large editable title added later by code. Restrained gallery art direction, cinematic contrast, elegant physically convincing materials, no generic sci-fi interface. The full artwork should work when slowly zoomed and panned. No text, no letters, no logo, no watermarks, no UI, no borders.

**Побережье:**

Use case: photorealistic-natural. Asset type: original landscape photograph for a premium travel/editorial motion design template. Primary request: an extraordinary aerial coastal road weaving like a pale ribbon between deep turquoise sea and sculptural orange terracotta cliffs, a single small white car following the curve, distant layers of headlands and the ocean horizon. Late afternoon golden light with long cinematic shadows, real Mediterranean vegetation, finely detailed rock strata, natural sea texture and delicate wave foam. Wide 16:9 panoramic composition with a powerful sweeping S curve, calm richly graded teal, burnt orange and cream palette, high-end independent travel magazine photography, realistic and not oversaturated. Leave some serene sky/sea negative space near upper left, no typography at all. Beautiful at full landscape size and in square crops. No text, no logo, no watermark, no border, no UI.
