# Свой движок маршрутов на Cloudflare

Ответ на тикет [#4](https://github.com/igorkamyshev/roadtrip/issues/4) карты [#1](https://github.com/igorkamyshev/roadtrip/issues/1). Дата исследования: 2026-11-07.

Вопрос тикета: можно ли считать кольца (контуры на N−1 и N часов, N до 12, весь мир) на своей инфраструктуре в Cloudflare с оплатой за использование, сколько это стоит и как быстро отвечает. Условия: (1) закрытые страны исключаются целиком, транзит тоже, список свой у каждого путешественника; (2) +1,5 ч за границу с паспортным контролем, внутри Шенгена 0; (3) не пересекать закрытые сухопутные границы между заданными парами стран; (4) без паромов; (5) время за рулём × 1,2.

Пометки у чисел:

- **[док]**: из документации или прайса, ссылка рядом;
- **[код]**: прочитано в исходниках, ссылка на файл и строку;
- **[замер]**: мой замер в песочнице, методика в [приложении](#приложение-как-делались-замеры);
- **[оценка]**: мой расчёт или экстраполяция, исходные числа указаны.

## Вердикт

1. **Valhalla или GraphHopper с графом всей планеты в Cloudflare Containers не поместятся.** Максимальный инстанс даёт 4 vCPU, 12 GiB памяти и 20 GB диска [док][cf-limits]. Тайлы Valhalla на планету весят 70–140 ГБ (оценки мейнтейнеров: [#3953][val-3953], [#3661][val-3661]). GraphHopper на планете требует ~60 ГБ RAM только на импорт [док][gh-deploy]. Ленивая подгрузка тайлов Valhalla (`tile_url`, удалённый tar) не спасает: кольцо на 12 ч трогает весь регион радиусом ~1000 км. В центре Европы это десятки гигабайт тайлов, их пришлось бы качать на каждом холодном старте.
2. **Валхаллу можно уместить, если урезать граф** до motorway…tertiary. Тогда тайлы на мир весят ~6–11 ГБ [оценка по замеру], это инстанс standard-3 или standard-4. Тёплый расчёт на 1 ч занимает доли секунды. 12 ч из Анкары считаются 3,5 с [замер], из центра Европы ~20–60 с [оценка]. Условия 1–3 выражаются только обходными путями: полигоны `exclude_polygons` и перетегирование пунктов пропуска в данных.
3. **Свой упрощённый граф с обходом Дейкстры дешевле, быстрее и выражает все условия точно.** Граф мира motorway…tertiary весит ~0,6–0,7 ГБ в компактном виде [оценка по замеру]. 12 ч из центра Европы — это ~5–6 млн узлов, JS-Дейкстра проходит такой объём примерно за 1–1,5 с [замер + оценка]. Расчёт стоит от ~$0,00005 (Worker) до ~$0,0007 (Container) [оценка по прайсу]. В месяц выходит $5–6 при 1 000 расчётов и $6–35 при 100 000, включая $5 за план Workers Paid.
4. **Рекомендация: свой граф.** Начать с маленького Container (standard-1: ½ vCPU, 4 GiB), где весь граф мира лежит в памяти: это проще всего и без риска упереться в лимиты. Перенос в Worker или в браузер оставить оптимизацией на потом: в Worker мешает лимит 128 МБ на изолят, в браузере мешает загрузка до ~40–80 МБ на 12 ч. Valhalla на урезанном графе годится как запасной вариант и как эталон для проверки нашего движка.

Цена своего движка не в инфраструктуре, а в разработке: модель скоростей по классам дорог, данные о границах и пунктах пропуска, построение контуров. Это ~3–5 недель работы [оценка] против ~1,5–3 недель для Valhalla [оценка]. Зато условия задачи выражаются в нём напрямую.

## Сравнение вариантов

Цены включают $5/мес за Workers Paid, без него Containers недоступны [док][cf-cont-pricing]. «Изолированный расчёт» означает, что контейнер поднялся ради одного расчёта и после ответа ждал 60 с перед сном. Формулы и допущения приведены в разделе [«Как считались цены»](#как-считались-цены).

| Вариант | Помещается в лимиты CF | Условия 1–5 | Цена 1 расчёта | 1 000 расч./мес | 100 000 расч./мес | Тёплый ответ: N=1 / N=12 в худшем случае | Холодный старт | Сборка и обновление данных |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Valhalla, полный граф планеты, Containers | Нет: 70–140 ГБ тайлов при максимуме 12 GiB RAM и 20 GB диска | 1, 3 через `exclude_polygons`; 2 через перетегирование данных; 4, 5 штатно | — | — | — | 12 ч из центра Европы: минуты и десятки ГБ RAM [оценка] | С `tile_url`: минуты на подкачку тайлов [оценка] | Планета 89 ГБ, сборка на машине с 16+ ГБ RAM, ~15 ч [док][val-mjolnir] |
| Valhalla, граф motorway…tertiary, Container standard-3 (2 vCPU, 8 GiB, 16 GB) | Да: ~6–11 ГБ тайлов в образе | Так же, как выше | ~$0,0017 | ~$6 | ~$80–110 | 0,3 с / 3,5 с (Турция, замер) … 20–60 с (центр Европы, оценка) | 1–3 с [док] плюс неизвестная поправка на образ ~10 ГБ, проверять PoC | Фильтр планеты, сборка тайлов, свой шаг тегирования границ; ~0,5 дня машины в месяц [оценка] |
| GraphHopper, граф motorway…tertiary, Container standard-4 | Скорее да [оценка] | 1 через `custom_model`, но `/isochrone` его не принимает, нужен патч; 2, 3 через `turn_penalty` + `weight_limit`, нужен edge-based граф | ~$0,003 [оценка] | ~$7 | ~$125+ | Не мерил: изохрона без CH/LM плюс триангуляция JTS по всем узлам [код] | Как у Valhalla, плюс прогрев JVM | Как у Valhalla, плюс форк на Java |
| **Свой граф, Container standard-1 (½ vCPU, 4 GiB, 8 GB)** | Да: граф мира ~0,6–0,7 ГБ в RAM | Все пять нативно и точно | ~$0,0007 | ~$5,4 | ~$34 | <0,1 с / ~1,5–3 с [оценка по замеру] | 1–3 с [док] плюс загрузка ~0,5 ГБ графа [оценка] | Фильтр планеты и свой сборщик; ~1–3 ч машины в месяц [оценка] |
| Свой граф, Worker (тайлы в R2 или static assets) | Только с огрублением вдали: лимит 128 МБ на изолят, общий для параллельных запросов | Все пять нативно | ~$0,00005 | ~$5 | ~$6 | ~0,1 с / ~1–3 с [оценка] | Миллисекунды; подкачка тайлов ~0,2–1 с [оценка] | Как выше, плюс нарезка на тайлы |
| Свой граф в браузере (тайлы как static assets) | Сервер не считает | Все пять нативно | ≈$0 | $5 | $5 | Расчёт 1–5 с на телефоне; загрузка от <1 МБ (N=1) до ~40–80 МБ (N=12, центр Европы), потом из кэша [оценка] | Нет | Как у Worker |

## 1. Cloudflare: лимиты и цены на 2026-11-07

### Containers

- **Типы инстансов** [док][cf-limits]: lite (1/16 vCPU, 256 MiB, 2 GB), basic (1/4, 1 GiB, 4 GB), standard-1 (1/2, 4 GiB, 8 GB), standard-2 (1, 6 GiB, 12 GB), standard-3 (2, 8 GiB, 16 GB), standard-4 (4, 12 GiB, 20 GB). Свой тип собирается из 1–4 vCPU, до 12 GiB и до 20 GB, не меньше 3 GiB на vCPU. Все максимумы считаются значениями по умолчанию, и их «can be increased» через поддержку.
- **Образ** [док][cf-limits]: размер образа ограничен диском инстанса, на аккаунт хранится до 50 GB образов. Снапшоты файловой системы до 20 GB живут 30 дней [док][cf-snapshots].
- **Цены** [док][cf-cont-pricing]: тарифицируется каждые 10 мс работы. Память стоит $0,0000025 за GiB·с, CPU $0,000020 за vCPU·с, диск $0,00000007 за GB·с. В Workers Paid каждый месяц включены 25 GiB·ч памяти, 375 vCPU·мин и 200 GB·ч диска. Память и диск оплачиваются по выделенному объёму, CPU только по активному использованию. Цитата: «Charges stop after the container instance goes to sleep… easy to scale to zero». Исходящий трафик в Северной Америке и Европе стоит $0,025/ГБ сверх 1 ТБ в месяц.
- **Засыпание**: класс `Container` усыпляет инстанс по `sleepAfter`, по умолчанию через 10 мин [док][cf-class]. В Durable Object API то же задаёт `setInactivityTimeout()` [док][cf-do-api]. Каждый контейнер обслуживается своим Durable Object, и его запросы оплачиваются отдельно, но при наших объёмах укладываются во включённый 1 млн [док][cf-do-pricing].
- **Холодный старт** [док][cf-faq]: «Container cold starts can often be in the 1-3 second range, but this is dependent on image size and code execution time». Цифр для образов на 5–10 ГБ в документации нет. Диск эфемерный: после сна контейнер стартует с чистого образа [док][cf-faq]. Инстанс поднимается в ближайшей локации, где образ уже предзагружен [док][cf-arch].

### Workers, Durable Objects, R2, static assets

- **Workers** [док][cf-w-limits]: 128 МБ на изолят, включая WebAssembly. Цитата: «This limit is per-isolate, not per-invocation. A single isolate can handle many concurrent requests», то есть два тяжёлых расчёта в одном изоляте делят эти 128 МБ. CPU по умолчанию 30 с на запрос, максимум 5 мин.
- **Цены Workers** [док][cf-w-pricing]: $5/мес, включены 10 млн запросов и 30 млн CPU-мс, сверх них $0,30 за млн запросов и $0,02 за млн CPU-мс.
- **Durable Objects** [док][cf-do-pricing]: тоже 128 МБ. Несколько объектов «may run in the same isolate… and share the 128 MB of memory».
- **R2** [док][cf-r2-pricing]: хранение $0,015 за ГБ·мес (10 ГБ бесплатно), чтения (класс B) $0,36 за млн (10 млн бесплатно), исходящий трафик бесплатный. Ranged reads из Worker поддерживаются [док][cf-r2-api].
- **Static assets** [док][cf-assets]: «Requests to static assets are free and unlimited», хранение тоже бесплатное. Файл до 25 MiB, до 100 000 файлов в версии [док][cf-w-limits]. Range-запросы не поддерживаются: отдаётся 200 и весь файл. Поэтому для удалённого tar у Valhalla нужен R2, а для тайлов, которые читает браузер, подходят static assets.

## 2. Данные OSM: сколько весит мир

- Планета в PBF на 2026-11-02 весит **89 ГБ** [док][osm-planet].
- Число ways по классам дорог во всём мире на 2026-11-07, по taginfo [док][taginfo]:

  | Класс | Ways | Класс | Ways |
  | --- | --- | --- | --- |
  | motorway | 1 380 190 | motorway_link | 921 982 |
  | trunk | 2 022 905 | trunk_link | 593 213 |
  | primary | 4 151 901 | primary_link | 499 240 |
  | secondary | 5 896 452 | secondary_link | 386 765 |
  | tertiary | 9 216 101 | tertiary_link | 281 394 |
  | unclassified | 18 591 170 | residential | 70 123 439 |

  Всего ways с `highway=*` 269 млн. Ниже наборы дорог обозначены так: A = motorway…primary со съездами (9,57 млн ways), B = A + secondary (15,85 млн), C = B + tertiary (25,35 млн).
- В регионе Geofabrik «europe» набор B даёт 5,73 млн ways, набор C 9,45 млн [док][taginfo-gf]. Худший случай для 12 ч — старт в центре Европы. Сумма по странам в ~1000–1100 км от Франкфурта даёт ~3,3 млн ways для B и ~5,4 млн для C **[оценка]**. Счёт по [taginfo-gf]: DE, FR, NL, BE, LU, CH, AT, CZ, DK, SI — целиком; PL — 70 %; GB — 60 %; IT — 50 %; SK, HU, HR — 60 %.

### Замер: граф после упрощения (Словакия и Турция)

Узлы графа — это перекрёстки и концы дорог; цепочки узлов степени 2 схлопнуты [замер]:

| Набор | Словакия: ways / узлы / ориент. рёбра / км | Турция: ways / узлы / ориент. рёбра / км |
| --- | --- | --- |
| A (до primary) | 25 343 / 24 188 / 39 734 / 6 071 | 104 304 / 114 631 / 153 097 / 77 954 |
| B (+secondary) | 39 900 / 38 055 / 66 183 / 10 291 | 167 502 / 183 321 / 275 998 / 125 196 |
| C (+tertiary) | 71 752 / 69 053 / 130 170 / 21 285 | 354 354 / 420 412 / 797 259 / 362 488 |
| Все автомобильные (+unclassified, residential, living_street) | 202 282 / 246 374 / 539 748 / 45 710 | 1 736 801 / 2 879 365 / 7 374 160 / 763 720 |

Отсюда коэффициенты: ~0,95–1,2 узла на way и ~1,5–2,25 ориентированного ребра на way.

Компактный формат: 13 байт на узел (lat и lon по int32, смещение CSR uint32, страна uint8) и 6 байт на ориентированное ребро (цель uint32, время uint16 в секундах). Он сжимается brotli до 51–55 % [замер]. Экстраполяция [оценка]:

| Что | Узлы | Ориент. рёбра | Сырой размер | brotli |
| --- | --- | --- | --- | --- |
| Мир, набор A | 9–10,5 млн | 14–15 млн | ~210–220 МБ | ~110–120 МБ |
| Мир, набор B | 15–17 млн | ~26 млн | ~350–380 МБ | ~190–200 МБ |
| Мир, набор C | 24–30 млн | 46–57 млн | ~590–730 МБ | ~310–390 МБ |
| Регион 12 ч из центра Европы, B | 3,1–3,6 млн | ~5,4 млн | ~73–79 МБ | ~40 МБ |
| Регион 12 ч из центра Европы, C | 5,2–6,4 млн | 10–12 млн | ~126–156 МБ | ~67–83 МБ |

Для сравнения, полный автомобильный граф Турции занимает в том же формате 79 МБ (brotli 38 МБ) [замер]. Полный граф мира у GraphHopper — ~415 млн рёбер, из них ~150 млн в Европе (данные на май 2022) [док][gh-deploy].

### Замер: чего стоит урезание графа (площадь изохрон Valhalla, км²)

| Старт | Кольцо | Полный граф | C | B |
| --- | --- | --- | --- | --- |
| Анкара | до 1 ч | 5 623 | 5 780 (+3 %) | 2 831 (−50 %) |
| Анкара | до 2 ч | 29 781 | 29 481 (−1 %) | 19 242 (−35 %) |
| Анкара | до 6 ч | 340 038 | 342 763 (+1 %) | 312 378 (−8 %) |
| Анкара | до 12 ч | 676 795 | 666 434 (−2 %) | 641 351 (−5 %) |
| Братислава | до 1 ч | 4 664 | 4 285 (−8 %) | 3 105 (−33 %) |
| Братислава | до 2 ч | 15 394 | 14 186 (−8 %) | 12 049 (−22 %) |

Время везде уже с ×1,2. Изохроны в Словакии обрезаны границей выгрузки.

Вывод: набор C (до tertiary) почти не искажает кольца. Набор B сильно занижает малые N (1–2 ч), а на больших ошибается на 5–17 %. Поэтому граф нужен C или схема «C рядом со стартом, B вдали».

## 3. Вариант: Valhalla в Containers

### Полная планета не помещается

- Размер тайлов: «~1 - 1.5 x OSM PBF size (currently around 75 GB planet graph)» [val-3661] (мейнтейнер, 2022). В 2023 другой мейнтейнер писал: «A planet-wide routing tileset itself can be anywhere from 70 to 140gb» [val-3953].
- Мой замер даёт тот же порядок: тайлы весят 0,86× PBF у Словакии (341 МБ против 397 МБ) и 1,5× у Турции (1,1 ГБ против 722 МБ). При планете 89 ГБ получается **~77–134 ГБ** тайлов [оценка].
- Максимальный Container даёт 20 GB диска и 12 GiB RAM [док][cf-limits]. Даже если поддержка поднимет лимиты, держать машину на ~100+ ГБ ради scale-to-zero бессмысленно.

### Тайлы по запросу (`tile_url`, удалённый tar)

- Механизм [код][val-graphreader] (строки 155–184, 503–521, 640–690). Если тайла нет в `tile_dir`, GraphReader скачивает его по `tile_url` через curl. Вместо этого можно читать из удалённого tar с `index.bin` HTTP range-запросами: удалённый tarball появился в 3.6.1 [док][val-changelog] (#5467), range-запросы в 3.6.0 (#5470). Скачанный тайл кладётся в `tile_dir` и в кэш памяти (`max_cache_size`, по умолчанию 1 ГБ на поток [код][val-build-config]).
- Мейнтейнер о холодном кэше: «we pull them on the fly as the algorithm decides it needs them… cold cache is very slow because now you have network hops in your tight loop» [val-3323]. В issue про масштабирование: на загрузку данных уходит «typically 10+ minutes», и «it still takes 5 minutes for the fresh instance to reach semi-normal request latencies» [val-3953].
- Почему это не делает маленький контейнер жизнеспособным [оценка]. Изохрона на 12 ч — это поиск Дейкстры по **всем уровням иерархии**: из иерархии `Dijkstras` выкидывает только shortcut-рёбра [код][val-dijkstras] (стр. 131), а все дороги в радиусе, включая местные, обходит. Значит, нужны все тайлы уровня 2 (0,25°) в радиусе ~1000 км. Это ~6–10 тыс. тайлов, средний тайл весит 0,5 МБ в Турции и 2,3 МБ в Словакии [замер]. Для центра Европы выходит ~10–20 ГБ на запрос, тайлы грузятся последовательно внутри цикла поиска, и они даже не помещаются в 20 GB диска и 12 GiB RAM.
- Ещё две мелочи: R2 по S3 API требует подписи SigV4, а Valhalla умеет только basic auth (`tile_url_user_pw` [код][val-build-config]). Значит, нужен публичный бакет или прокси-Worker. Static assets не отдают range [док][cf-assets].

### Урезанный граф помещается

- Тайлы Valhalla из отфильтрованного PBF [замер]: Словакия B 9,5 МБ, C 18 МБ (полный граф 341 МБ); Турция B 61 МБ, C 147 МБ (полный 1,1 ГБ).
- В пересчёте на один way: B 240–360 байт, C 250–410 байт. На мир это даёт **B ≈ 4–6 ГБ, C ≈ 6–11 ГБ** [оценка]. Такой граф помещается в образ standard-3 (16 GB) или standard-4 (20 GB).
- Сборка тайлов Турции [замер]: полный граф 200 с при пике 7,2 ГБ RAM, C 30 с при 1,1 ГБ, B 11,5 с. Для сравнения, документация Valhalla говорит о ~15 ч на полную планету на 4 ядрах с 16 ГБ RAM [док][val-mjolnir].

### Скорость изохрон

Замер на pyvalhalla 3.9.1, один запрос, второй прогон, ×1,2 уже учтено в минутах:

| Граф | 1 ч (50 мин) | 6 ч (250 и 300 мин) | 12 ч (550 и 600 мин) | Пик RSS |
| --- | --- | --- | --- | --- |
| Турция, полный | 0,31 с | 6,1 с | 13,8 с | 2,3 ГБ |
| Турция, C | — | — | 3,5 с | 0,85 ГБ |
| Турция, B | — | — | 1,3 с | 0,57 ГБ |
| Словакия, B (почти пустой граф) | — | — | 0,34 с | 0,49 ГБ |

Последняя строка — накладные расходы сетки. Для 12 ч сетка всегда занимает ±~1150 км с шагом 0,005°, это ~26 млн ячеек на широте 50° [код][val-isochrone] (стр. 56–145: радиус берётся по 70 миль/ч, шаг ограничен 0,005°).

Экстраполяция на центр Европы по числу ways [оценка]: B в ~20 раз больше турецкого, это ~20 с; C в ~15 раз больше, это ~50 с. Полный граф дал бы минуты и десятки ГБ. Пик памяти на худшем 12 ч по графу C — ~3–6 ГБ [оценка]: 0,85 ГБ у Турции, плюс тайлы региона ~1–2 ГБ в кэше, плюс метки поиска. Поэтому нужен standard-3 (8 GiB) или standard-4.

### Как выразить условия

1. **Закрытые страны**: `exclude_polygons` [док][val-route-api]. Исключаются рёбра, пересекающие кольцо полигона, и рёбра в ячейках, целиком лежащих внутри [код][val-polygon] (стр. 201–330). Внутренность ищется заливкой; в коде оговорено, что очень большие и вогнутые полигоны могут залиться не полностью. Въезд и транзит закрыты в любом случае, потому что исключены рёбра на кольце.
   - Проверка на Турции C, 12 ч из Анкары [замер]: круг радиусом 150 км в стороне от старта уменьшил площадь с 666 434 до 586 803 км², то есть на площадь круга. Круг, внутри которого оказался старт, дал вырожденный результат в 1 км². Значит, страну старта в полигоны не включаем никогда.
   - Лимиты по умолчанию: `max_exclude_polygons_length` 10 000 м и `max_exclude_polygons_vertices` 100 [код][val-build-config]. Свой сервер их поднимает.
   - Кольца через антимеридиан запрещены (ошибка 177) [код][val-polygon].
   - Точность зависит от упрощения границ.
   - Цена [замер]: полигон на 3000 вершин с периметром ~940 км добавил 3,6 с на полном графе Турции (12,7 → 16,3 с) и ничего на графе C.
2. **Время на границе**: `country_crossing_cost`, «added to the estimated and elapsed times», по умолчанию 600 с [док][val-route-api]. Но в коде он добавляется **только в узлах типа `kBorderControl`** [код][val-dyncost-h] (стр. 1568), а этот тип ставится только узлам OSM с `barrier=border_control` [код][val-pbfparser] (стр. 2219–2222), [код][val-lua] (стр. 2278–2279). В мире 8 236 таких узлов [док][taginfo-bc].
   - Величина одна на запрос и не зависит от пары стран.
   - Флаг ребра `ctry_crossing` при сборке ставится по смене ISO страны [код][val-validator] (стр. 410–413), но стоимость его не использует.
   - Значит, правило «1,5 ч, но 0 внутри Шенгена» придётся запечь в данные: свой шаг перед сборкой ставит `barrier=border_control` на каждое пересечение дороги с границей без шенгенского исключения и снимает его внутри Шенгена. Другой путь — патч C++ в costing.
3. **Закрытые пары границ**: список статичный, поэтому проще удалить такие пересечения в данных перед сборкой. Можно и на запросе: тонкий `exclude_polygons` вдоль общей границы.
4. **Паромы**: `exclude_ferries` — жёсткое исключение, нужен `service_limits.allow_hard_exclusions: true` [док][val-route-api], [код][val-build-config]. `use_ferry: 0` паромы только избегает. Проще всего не класть паромы в отфильтрованный PBF.
5. **×1,2**: множителя скорости нет, но условие выражается точно через масштаб. Контуры берутся на 50·N минут, а `country_crossing_cost` = 1,5 ч / 1,2 = 4500 с, потому что 1,2·T + 1,5·k ≤ N ⇔ T + 1,25·k ≤ N/1,2. Предел `country_crossing_cost` равен 12 ч [код][val-dyncost-h] (стр. 185). `service_limits.isochrone.max_time_contour` по умолчанию 120 мин [код][val-build-config], его надо поднять до ≥600. Кольцо — это разность двух контуров, Valhalla отдаёт до 4 контуров за запрос [док][val-iso-api].

## 4. Вариант: GraphHopper в Containers

- **Планета** [док][gh-deploy]: «Parsing this planet file and creating the GraphHopper base graph requires ~60GB RAM… can be reduced to 31GB RAM when you set `graph.dataaccess.default_type: MMAP`». CH требует ~120 ГБ, LM ~80 ГБ. Ни то, ни другое в Container не помещается. Остаётся урезанный граф, как у Valhalla.
- **Изохрона** [код][gh-iso]: только `GET /isochrone`, CH и LM в коде принудительно выключены, то есть это обычная Дейкстра. Предел задаётся через `time_limit`, `distance_limit` или `weight_limit`; последний есть в коде, но не описан в [gh-api-doc]. Все достигнутые узлы потом триангулируются по Делоне в JTS [код][gh-jts]. Для 12 ч из Европы это миллионы точек: десятки секунд и гигабайты [оценка].
- **Закрытые страны**: в `custom_model` есть encoded value `country` [док][gh-cm], и условие `{"if": "country == X || …", "multiply_by": "0"}` закрывает страну. Но модель на запрос берётся только как объект из hints [код][gh-wf] (стр. 65), а GET-изохрона его не принимает. Нужен небольшой патч на Java с POST-эндпоинтом. Границы стран берутся из встроенного `countries.geojson` на 1,2 МБ [код][gh-countries].
- **Граница**: `turn_penalty` с `prev_country != country` [док][gh-cm]. Для этого у профиля должен быть включён `turn_costs`, иначе ошибка [код][gh-wf] (стр. 84), а с ним поиск идёт по рёбрам (`EDGE_BASED` [код][gh-iso]) и тяжелеет. Штраф меняет только вес, не время («turn penalties don't affect the travelling time» [док][gh-cm]), поэтому кольцо надо резать по `weight_limit`, держа вес равным времени. Исключение для Шенгена записывается длинным условием или своей областью. Закрытые пары задаются так же, со значением `Infinity`. Паромы закрываются условием `road_environment == FERRY`.
- В релизе GraphHopper 11.0 всё это уже есть [gh-11-cm], [gh-11-iso].
- **Не замерено**: запуск jar GraphHopper в песочнице заблокирован правилами сессии. Цифры по скорости — только оценки.

## 5. Вариант: свой упрощённый граф

### Сборка данных

1. Фильтр планеты (89 ГБ) по набору C: `highway=motorway…tertiary` со съездами, только автомобильные. Паромы (`route=ferry`) и автопоезда отбрасываются сразу, условие 4 выполнено по построению.
2. Свой сборщик:
   - схлопнуть узлы степени 2;
   - присвоить каждому узлу страну по полигонам границ;
   - пометить рёбра, пересекающие границу, и пару стран на них;
   - убрать пересечения закрытых пар (условие 3, ручной список из тикета #5);
   - время ребра = длина / скорость класса × 1,2 (условие 5);
   - нарезать граф на тайлы и записать бинарник.

   Мой прототип на pyosmium обработал Турцию (722 МБ PBF) за ~100 с [замер]. На планету это ~3–4 ч на Python или минуты–час на osmium/Rust [оценка]. Результат весит ~0,3–0,4 ГБ в brotli для мира C [оценка], он кладётся в R2, static assets или образ.
3. Обновлять раз в месяц на машине или в CI с ≥150 ГБ диска. Container с его 20 GB диска для этого не годится [док][cf-limits].

### Обход и условия на запросе

Параметры запроса — точка старта, N и битовая маска закрытых стран (~250 бит). Дейкстра с тремя проверками:

- узел в закрытой стране пропускается, кроме страны старта (условие 1, транзит тоже закрыт);
- на ребре со сменой страны прибавляется 1,5 ч, если пара не «обе в Шенгене». Матрица пар статичная, туда же попадают другие пары без контроля, если владелец решит (условие 2);
- поиск идёт до N часов, кольцо — это узлы со временем в (N−1, N]. Из них строится полигон через сетку и marching squares, как у Valhalla, или рисуются отрезки дорог. Список городов получается сразу: город привязан к ближайшему узлу графа.

Скорость JS-Дейкстры [замер, Node 22, одно ядро песочницы]: полный автомобильный граф Турции (2,88 млн узлов, 7,37 млн рёбер), 12 ч — 2,67 млн узлов и 6,89 млн релаксаций за **0,56 с**. Турция C за 12 ч — 0,06 с. Для худшего региона C в центре Европы (5–6 млн узлов) это ~1,1–1,4 с, для B ~0,7 с, плюс построение полигона ~0,3–1 с [оценка].

### Где запускать

- **Container standard-1** (½ vCPU, 4 GiB, 8 GB): весь граф мира C (~0,6–0,75 ГБ) держится в памяти, тайлы не нужны. На ½ vCPU худший случай займёт ~2–3 с; на Rust или Go быстрее, а standard-2 (1 vCPU) даст ~1–1,5 с [оценка]. Если держать инстанс включённым круглосуточно, 4 GiB стоят ~$27/мес [оценка по прайсу].
- **Worker**:
  - CPU: стоит копейки ($0,02 за млн CPU-мс), лимит в 5 мин не мешает.
  - Память: 128 МБ на изолят, общие для параллельных запросов [док][cf-w-limits]. Худший регион C на 12 ч (~100–125 МБ рабочих массивов) не помещается, B на пределе (~60 МБ). Нужно огрубление: C рядом со стартом, A или B вдали.
  - Есть более сложный путь — оверлей с предрасчётом переходов между границами ячеек (идея CRP). Ячейки при этом режутся строго по странам: закрытие страны тогда просто выкидывает её ячейки, и предрасчёт остаётся верным для любого набора закрытых стран [оценка].
- **Браузер**:
  - Тайлы раздаются как static assets бесплатно [док][cf-assets].
  - Загрузка растёт как N²: N=1–3 — до пары МБ; N=12 в центре Европы — ~40 МБ (B) или ~70–80 МБ (C) в brotli [оценка]. Потом всё берётся из кэша.
  - Телефон в 2–4 раза медленнее, значит 1–5 с [оценка].
  - Плюсы: сервер ничего не считает, а геолокация не уходит с устройства.

### Риски своего движка

- **Модель скорости**: у Valhalla и GraphHopper есть отлаженные скорости, городские поправки и страновые лимиты. Своя модель по классам и `maxspeed` грубее, её надо откалибровать по Valhalla на выборке маршрутов.
- **Привязка старта**: точка может быть далеко от дорог набора C, тогда нужна «последняя миля», например по прямой с фиксированной скоростью. Для малых N стоит подгружать полный граф рядом со стартом.
- **Пересечения границ без пункта пропуска**: лесные и закрытые переезды. Их фильтруют по `barrier=border_control` или ручному списку.
- **Спорные территории и анклавы**: те же вопросы, что и в карте.

## Как считались цены

Цены [док] — по [cf-cont-pricing], [cf-w-pricing], [cf-r2-pricing]. Время расчёта T и холостой «хвост» после ответа — мои допущения [оценка]:

- Изолированный расчёт на Container = память × (T + хвост) × $0,0000025 + диск × (T + хвост) × $0,00000007 + активные vCPU × T × $0,00002, хвост 60 с.
  - Valhalla C на standard-3 (8 GiB, 16 GB), T ≈ 10 с: **$0,0017**.
  - GraphHopper на standard-4 (12 GiB, 20 GB), T ≈ 20 с: **$0,0029**.
  - Свой граф на standard-1 (4 GiB, 8 GB), T ≈ 2 с при ½ vCPU: **$0,0007**.
- **1 000 расчётов в месяц**: худший случай — каждый расчёт будит контейнер. После вычета включённого объёма получается ~$1,2 для Valhalla, ~$2,2 для GraphHopper и ~$0,4 для своего графа, плюс $5 за план.
- **100 000 расчётов в месяц**: это ~2,3 расчёта в минуту, так что один инстанс фактически не спит.
  - Круглосуточно включённый инстанс стоит: 8 GiB — $55/мес, 12 GiB — $81/мес, 4 GiB — $27/мес. К этому добавляется CPU по T.
  - Итого: Valhalla ~$74 + $5, GraphHopper ~$121 + $5, свой граф ~$29 + $5.
  - Если в пиковые часы понадобится второй инстанс (Valhalla с T около 10 с при 5-кратном пике), добавляется ~$20–30.
- **Worker**: 0,7 с CPU и 100 чтений R2 на расчёт дают ~$0,00005 за расчёт. 1 000 расчётов укладываются во включённое, 100 000 стоят ~$0,8 CPU плюс R2 в пределах бесплатных 10 млн чтений.
- **Кэш колец** из рамок карты снижает число расчётов, но доля попаданий неизвестна, и в цифры она не заложена.

## Что проверить PoC-ом до решения

1. Холодный старт Container с образом 0,5–1 ГБ (свой граф) и ~10 ГБ (Valhalla C): документация говорит только «1-3 s… dependent on image size».
2. Скорость CPU в Containers и Workers против песочницы (V8, x86).
3. Сверка своего движка с Valhalla (полный граф) на 20–30 точках старта: площади колец и времена до городов.
4. Качество данных о пунктах пропуска и границах: `barrier=border_control`, полигоны стран.

## Приложение: как делались замеры

- **Песочница**: 4 vCPU, 15 ГБ RAM, Linux.
- **Данные**: выгрузки OSM Словакии (397 МБ) и Турции (722 МБ) с download.openstreetmap.fr от 2026-11-07. Geofabrik через прокси сессии не скачивался (connection reset), Overpass был недоступен. Число ways — из API taginfo.openstreetmap.org и taginfo.geofabrik.de от 2026-11-07.
- **Граф**: свой скрипт на pyosmium. Классы `highway` с автомобильным доступом, схлопывание узлов степени 2, длины по координатам. Рёбра в обе стороны, кроме oneway, motorway и кругового движения.
- **Valhalla**: pyvalhalla 3.9.1 с PyPI. Тайлы `valhalla_build_tiles` из полных и отфильтрованных PBF, без admin и timezone. Изохроны через `valhalla.Actor`, `costing=auto`, `polygons=true`, время второго прогона.
- **JS-Дейкстра**: Node 22, CSR в typed arrays, бинарная куча, веса uint16 в секундах с ×1,2. Скорости по классам: motorway 110, trunk 90, primary 70, secondary 60, tertiary 50, съезды 30–60, unclassified 40, residential 30 км/ч. Размеры сжатия — brotli quality 9.
- **GraphHopper**: не запускался, запуск jar запрещён правилами сессии.
- **Исходники**: Valhalla на коммите `8e84136` (master от 2026-11-06), GraphHopper на коммите `385b8ed` (master от 2026-11-06) и на теге 11.0.

## Источники

[cf-limits]: https://developers.cloudflare.com/containers/platform/limits/
[cf-cont-pricing]: https://developers.cloudflare.com/containers/platform/pricing/
[cf-faq]: https://developers.cloudflare.com/containers/faq/
[cf-arch]: https://developers.cloudflare.com/containers/concepts/architecture/
[cf-snapshots]: https://developers.cloudflare.com/containers/guides/snapshots/
[cf-class]: https://developers.cloudflare.com/containers/api/container-class/#sleepafter
[cf-do-api]: https://developers.cloudflare.com/containers/api/durable-object-container/#setinactivitytimeout
[cf-w-limits]: https://developers.cloudflare.com/workers/platform/limits/
[cf-w-pricing]: https://developers.cloudflare.com/workers/platform/pricing/
[cf-do-pricing]: https://developers.cloudflare.com/durable-objects/platform/pricing/
[cf-r2-pricing]: https://developers.cloudflare.com/r2/pricing/
[cf-r2-api]: https://developers.cloudflare.com/r2/api/workers/workers-api-reference/#ranged-reads
[cf-assets]: https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/
[osm-planet]: https://planet.openstreetmap.org/pbf/
[taginfo]: https://taginfo.openstreetmap.org/keys/highway#values
[taginfo-bc]: https://taginfo.openstreetmap.org/tags/barrier=border_control
[taginfo-gf]: https://taginfo.geofabrik.de/europe/keys/highway#values
[val-3661]: https://github.com/valhalla/valhalla/discussions/3661
[val-3953]: https://github.com/valhalla/valhalla/issues/3953
[val-3323]: https://github.com/valhalla/valhalla/discussions/3323
[val-mjolnir]: https://github.com/valhalla/valhalla/blob/8e84136b2e34278b9bf3f5ca5bf1bca6616dbb0a/docs/docs/contributing/architecture/mjolnir/index.md
[val-changelog]: https://github.com/valhalla/valhalla/blob/8e84136b2e34278b9bf3f5ca5bf1bca6616dbb0a/CHANGELOG.md
[val-graphreader]: https://github.com/valhalla/valhalla/blob/8e84136b2e34278b9bf3f5ca5bf1bca6616dbb0a/src/baldr/graphreader.cc
[val-build-config]: https://github.com/valhalla/valhalla/blob/8e84136b2e34278b9bf3f5ca5bf1bca6616dbb0a/scripts/valhalla_build_config
[val-dijkstras]: https://github.com/valhalla/valhalla/blob/8e84136b2e34278b9bf3f5ca5bf1bca6616dbb0a/src/thor/dijkstras.cc#L131
[val-isochrone]: https://github.com/valhalla/valhalla/blob/8e84136b2e34278b9bf3f5ca5bf1bca6616dbb0a/src/thor/isochrone.cc#L56-L145
[val-route-api]: https://github.com/valhalla/valhalla/blob/8e84136b2e34278b9bf3f5ca5bf1bca6616dbb0a/docs/docs/api/route/api-reference.md
[val-iso-api]: https://github.com/valhalla/valhalla/blob/8e84136b2e34278b9bf3f5ca5bf1bca6616dbb0a/docs/docs/api/isochrone.md
[val-polygon]: https://github.com/valhalla/valhalla/blob/8e84136b2e34278b9bf3f5ca5bf1bca6616dbb0a/src/loki/polygon_search.cc#L201-L330
[val-dyncost-h]: https://github.com/valhalla/valhalla/blob/8e84136b2e34278b9bf3f5ca5bf1bca6616dbb0a/valhalla/sif/dynamiccost.h
[val-pbfparser]: https://github.com/valhalla/valhalla/blob/8e84136b2e34278b9bf3f5ca5bf1bca6616dbb0a/src/mjolnir/pbfgraphparser.cc#L2219-L2222
[val-lua]: https://github.com/valhalla/valhalla/blob/8e84136b2e34278b9bf3f5ca5bf1bca6616dbb0a/lua/graph.lua#L2278-L2279
[val-validator]: https://github.com/valhalla/valhalla/blob/8e84136b2e34278b9bf3f5ca5bf1bca6616dbb0a/src/mjolnir/graphvalidator.cc#L410-L413
[gh-deploy]: https://github.com/graphhopper/graphhopper/blob/385b8eda1b01fddac244af71dee281ca03bd2ad0/docs/core/deploy.md#worldwide-setup
[gh-api-doc]: https://github.com/graphhopper/graphhopper/blob/385b8eda1b01fddac244af71dee281ca03bd2ad0/docs/web/api-doc.md#isochrone
[gh-cm]: https://github.com/graphhopper/graphhopper/blob/385b8eda1b01fddac244af71dee281ca03bd2ad0/docs/core/custom-models.md
[gh-iso]: https://github.com/graphhopper/graphhopper/blob/385b8eda1b01fddac244af71dee281ca03bd2ad0/web-bundle/src/main/java/com/graphhopper/resources/IsochroneResource.java#L71-L115
[gh-jts]: https://github.com/graphhopper/graphhopper/blob/385b8eda1b01fddac244af71dee281ca03bd2ad0/core/src/main/java/com/graphhopper/isochrone/algorithm/JTSTriangulator.java#L48-L89
[gh-wf]: https://github.com/graphhopper/graphhopper/blob/385b8eda1b01fddac244af71dee281ca03bd2ad0/core/src/main/java/com/graphhopper/routing/DefaultWeightingFactory.java
[gh-countries]: https://github.com/graphhopper/graphhopper/blob/385b8eda1b01fddac244af71dee281ca03bd2ad0/core/src/main/resources/com/graphhopper/countries/countries.geojson
[gh-11-cm]: https://github.com/graphhopper/graphhopper/blob/11.0/docs/core/custom-models.md
[gh-11-iso]: https://github.com/graphhopper/graphhopper/blob/11.0/web-bundle/src/main/java/com/graphhopper/resources/IsochroneResource.java

- Cloudflare Containers: [лимиты][cf-limits], [цены][cf-cont-pricing], [FAQ][cf-faq], [жизненный цикл][cf-arch], [снапшоты][cf-snapshots], [`sleepAfter`][cf-class], [`setInactivityTimeout`][cf-do-api]
- Cloudflare Workers, Durable Objects, R2: [лимиты Workers][cf-w-limits], [цены Workers][cf-w-pricing], [цены DO][cf-do-pricing], [цены R2][cf-r2-pricing], [ranged reads R2][cf-r2-api], [static assets][cf-assets]
- OSM: [планета][osm-planet], [taginfo highway][taginfo], [taginfo border_control][taginfo-bc], [taginfo Geofabrik][taginfo-gf]
- Valhalla, обсуждения: [#3661][val-3661], [#3953][val-3953], [#3323][val-3323]
- Valhalla, документация: [mjolnir][val-mjolnir], [CHANGELOG][val-changelog], [API маршрутов][val-route-api], [API изохрон][val-iso-api]
- Valhalla, код: [graphreader.cc][val-graphreader], [valhalla_build_config][val-build-config], [dijkstras.cc][val-dijkstras], [isochrone.cc][val-isochrone], [polygon_search.cc][val-polygon], [dynamiccost.h][val-dyncost-h], [pbfgraphparser.cc][val-pbfparser], [graph.lua][val-lua], [graphvalidator.cc][val-validator]
- GraphHopper, документация: [deploy][gh-deploy], [API][gh-api-doc], [custom models][gh-cm], [custom models 11.0][gh-11-cm]
- GraphHopper, код: [IsochroneResource][gh-iso], [IsochroneResource 11.0][gh-11-iso], [JTSTriangulator][gh-jts], [DefaultWeightingFactory][gh-wf], [countries.geojson][gh-countries]
