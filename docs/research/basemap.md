# Подложка карты на Cloudflare с русскими подписями

Исследование к тикету [#7](https://github.com/igorkamyshev/roadtrip/issues/7) (карта: [#1](https://github.com/igorkamyshev/roadtrip/issues/1)). Дата: 2026-11-07.

**Вопрос.** Какую подложку взять, чтобы она отдавалась с Cloudflare или оплачивалась за использование и показывала подписи по-русски? Для каждого варианта: цена при 1 000 и 100 000 просмотров в месяц, размер мира при своём хостинге, лицензия и атрибуция, как включить русские подписи и что видно без русского названия, как работает с MapLibre GL JS на телефоне.

## Коротко

- **Рекомендация: Protomaps Basemap.** Это один файл PMTiles на весь мир (139 ГБ, зумы 0–15), он лежит в R2, а тайлы по `/{z}/{x}/{y}` отдаёт PMTiles Worker с кэшем Cloudflare. Стиль берём из `@protomaps/basemaps`, подписи из `name:ru`.
- **Цена:** около **$1,9 в месяц** при 1 000 просмотров (только хранение в R2, Workers на бесплатном плане) и около **$6,9 в месяц** при 100 000 просмотров ($5 за Workers Paid плюс хранение). Если Workers Paid всё равно нужен для расчёта колец, тайлы добавляют только около $1,9 в месяц.
- **Русские подписи:** в тайлах Protomaps есть `name:ru`, а `layers(..., {lang: "ru"})` включает русские стили. Без доработки он делает двухстрочные подписи «русское / местное», а если русского названия нет, берёт английское. Правило из #1 («по-русски, где есть, иначе местное») даёт замена `text-field` на `["coalesce", ["get","name:ru"], ["get","name"]]`.
- **Для прототипа без инфраструктуры** подходит публичный OpenFreeMap: бесплатно и без ключей, `name:ru` в тайлах есть, но SLA нет, и работает он не на Cloudflare. MapTiler и Stadia бесплатны только для некоммерческого использования. При 100 000 просмотров они стоят $80–705 в месяц.

## Допущения для расчёта цены

- **Просмотр** — одна загрузка страницы с картой.
- **Число тайлов на просмотр** нигде не опубликовано, поэтому считаю по трём сценариям:
  - **16 тайлов.** Столько закладывает калькулятор Protomaps: 10 млн запросов тайлов на 625 000 сессий ([docs.protomaps.com/deploy/cost](https://docs.protomaps.com/deploy/cost)).
  - **50 тайлов (основной сценарий, моя оценка).** Векторный тайл в MapLibre рисуется размером 512 px, так что экран телефона (~390×844 CSS px) закрывают примерно 6–12 тайлов на один зум. Человек открывает карту у точки старта, двигает ползунок, и карта отдаляется, чтобы показать кольцо до 12 ч. Это 3–5 смен зума и сдвигов.
  - **100 тайлов** — запас на активного пользователя.
- **Объём при 50 тайлах:** 1 000 просмотров дают 50 000 запросов тайлов в месяц, 100 000 просмотров — 5 млн запросов, в среднем ≈167 000 в день.
- Шрифты (glyphs) и спрайты в расчёт не входят. У хостеров они бесплатны, а при своём хостинге лежат в static assets Workers, запросы к которым «free and unlimited» ([Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)).

## Сводная таблица

Цена в USD в месяц, сценарий 50 тайлов на просмотр. В скобках — другие сценарии, если цена от них меняется.

| Вариант | 1 000 просмотров | 100 000 просмотров | Данные мира, макс. зум | Русские подписи | Атрибуция |
|---|---|---|---|---|---|
| **Protomaps PMTiles в R2 + Worker** | ≈ $1,9 | ≈ $6,9 (16 тайлов: ≈ $1,9–6,9; 100 тайлов: ≈ $7) | 139,35 ГБ, z0–15 | `name:ru`, `lang: "ru"` | © OpenStreetMap |
| Protomaps PMTiles в R2 напрямую (`pmtiles://`, без Worker) | ≈ $1,9 | ≈ $1,9 (100 тайлов: ≈ $2–2,3) | 139,35 ГБ, z0–15 | так же | © OpenStreetMap |
| OpenFreeMap, публичный сервер | $0 | $0 | — (хостят они) | `name:ru` в тайлах, стиль переписывать | OpenFreeMap © OpenMapTiles © OSM |
| PMTiles OpenFreeMap в R2 + Worker | ≈ $1,1 | ≈ $6,1 | 87,35 ГБ, z0–14 | так же | © OpenMapTiles © OSM |
| VersaTiles, публичный сервер | $0 | $0 (лимит по IP) | — | `name_ru`, `language: 'ru'` | © OSM |
| VersaTiles в R2 + Worker | ≈ $0,8 | ≈ $5,8 | 62,1 ГБ, z0–14 | так же | © OSM |
| MapTiler Cloud | $0 (Free: некоммерческое, логотип) | $217,50 с SDK, $705 без SDK (16 тайлов без SDK: $195) | — | `language: "ru"` в SDK | © MapTiler © OSM, логотип на Free |
| Stadia Maps | $0 (Free: некоммерческое), $20 (Starter) | $80 (16 тайлов: $38; 100 тайлов: $130) | z0–14 | `name:ru`, стиль переписывать | © Stadia Maps © OpenMapTiles © OSM |
| Mapbox | $0 | $250 с Mapbox GL JS, $1 000 с MapLibre | — | `name_ru` | Mapbox, проприетарный SDK |

Ниже — откуда каждая цифра.

## Cloudflare: сколько стоят R2 и Workers

**R2** ([R2 pricing](https://developers.cloudflare.com/r2/pricing/)):

- Хранение — $0,015 за ГБ-месяц.
- Class A — $4,50 за млн операций, Class B (`GetObject`, `HeadObject`) — $0,36 за млн.
- Бесплатно каждый месяц: 10 ГБ-месяц хранения, 1 млн операций Class A и 10 млн Class B.
- Исходящий трафик (egress) бесплатен.

**Workers** ([Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/), [limits](https://developers.cloudflare.com/workers/platform/limits/)):

- **Free:** 100 000 запросов в сутки (счётчик сбрасывается в полночь UTC) и 10 мс CPU на запрос. Сверх лимита — «Error 1027». Маршрут можно настроить так, чтобы при ошибке он пропускал запрос мимо Worker (fail open) или отдавал страницу ошибки (fail closed).
- **Paid:** от $5 в месяц, включает 10 млн запросов и 30 млн CPU-мс. Дальше $0,30 за млн запросов и $0,02 за млн CPU-мс.
- Workers выполняется до кэша Cloudflare, поэтому каждый запрос тайла через Worker оплачивается, даже если ответ пришёл из кэша: «the caching of a request still incurs costs». CPU оплачивается только на промахе кэша.

**Как Protomaps считает ту же схему.** Калькулятор Protomaps даёт $11,45 в месяц за 10 млн запросов тайлов при 50% попаданий в кэш ([cost](https://docs.protomaps.com/deploy/cost)). Из них $5 — Workers Paid, $3 — сверх 10 млн, $1,80 — R2 GET, $1,65 — хранение. Бесплатные квоты калькулятор не вычитает.

**Ограничения кэша** ([Cache API](https://developers.cloudflare.com/workers/runtime-apis/cache/), [Default cache behavior](https://developers.cloudflare.com/cache/concepts/default-cache-behavior/)):

- Cache API работает в рамках одного дата-центра: «contents of the cache do not replicate outside of the originating data center». `cache.put` несовместим с tiered cache.
- Обычный кэш Cloudflare на планах Free, Pro и Business не берёт файлы больше 512 МБ. Поэтому мировой PMTiles, если читать его из R2 напрямую, на краю не кэшируется.

## 1. Protomaps Basemap: PMTiles в R2

**Данные.**

- Ежедневные сборки мира в одном файле PMTiles. Документация пишет «roughly 120 gigabytes, including zoom levels from 0 to 15» ([downloads](https://docs.protomaps.com/basemaps/downloads)).
- Фактически `https://build.protomaps.com/20261106.pmtiles` — **139 353 480 483 байта (139,35 ГБ)**. Я проверил это HEAD-запросом 2026-11-07 и прочитал 127-байтный заголовок PMTiles: minzoom 0, maxzoom 15. Формат данных — basemap 4.15.2, сборка Planetiler из OSM за 2026-11-06.
- Размер можно уменьшить: `pmtiles extract --maxzoom` вырезает регион или срезает зумы, и каждый лишний зум «roughly doubles the size of the file» ([downloads](https://docs.protomaps.com/basemaps/downloads)). При цене хранения меньше $2 в месяц резать незачем.
- Ссылки на сборки могут меняться, а напрямую на них ссылаться не советуют. Файл копируют в своё хранилище ([downloads](https://docs.protomaps.com/basemaps/downloads)).

**Как раздавать с Cloudflare** ([deploy/cloudflare](https://docs.protomaps.com/deploy/cloudflare)):

- Файл заливается в R2 через `rclone`: загрузка через веб-интерфейс ограничена 300 МБ.
- Готовый Worker из репозитория PMTiles (`serverless/cloudflare`) отдаёт `/NAME/{z}/{x}/{y}.mvt` и TileJSON `/NAME.json`. Его настраивают переменными `ALLOWED_ORIGINS` и `CACHE_CONTROL` (по умолчанию `public, max-age=86400`).
- Чтобы работал кэш, Worker должен висеть на своём домене, а не на `workers.dev`.
- R2 на промахе кэша медленный: «Cloudflare R2 is known to have higher latency (500ms or higher) than other Cloud Storage products». Из кэша CDN ответ приходит быстрее чем за 100 мс ([deploy](https://docs.protomaps.com/deploy/)). В обзоре вариантов Protomaps называет Cloudflare самым дешёвым: «recommended for budget minded beginners».
- **Вариант без Worker:** клиент читает файл из публичного бакета R2 через протокол `pmtiles://` range-запросами. Каждый range-запрос оплачивается как GET ([cloud-storage](https://docs.protomaps.com/pmtiles/cloud-storage)). Для продакшена нужен свой домен, потому что `r2.dev` «rate-limited and should only be used for development» ([public buckets](https://developers.cloudflare.com/r2/buckets/public-buckets/)). Файл в 139 ГБ больше лимита кэша в 512 МБ, так что каждый тайл идёт в R2 с его задержкой. Автор OpenFreeMap пишет о том же: «on Cloudflare, range requests in 90 GB files have terrible latency» ([README OpenFreeMap](https://github.com/hyperknot/openfreemap)).

**Цена (Worker + R2).**

- Хранение: 139,35 ГБ ≈ 129,8 ГиБ, минус 10 ГБ бесплатных, по $0,015 — **≈ $1,8–1,9 в месяц**. Заливка — около тысячи multipart-операций Class A, это внутри бесплатного миллиона.
- **1 000 просмотров:** 50 000 запросов в месяц, ≈1 700 в день. Это укладывается во Workers Free, а чтения R2 — в 10 млн бесплатных Class B. Итого ≈ **$1,9**.
- **100 000 просмотров:** ≈167 000 запросов в день, больше лимита Free в 100 000, поэтому нужен Workers Paid за $5 с 10 млн запросов. Чтения R2 (только промахи кэша, не больше 5 млн) остаются в бесплатной квоте. Итого ≈ **$6,9**.
  - При 100 тайлах на просмотр запросов около 10,1 млн: это ≈ $7.
  - При 16 тайлах выходит ≈53 000 в день в среднем. Бесплатного плана хватает, но в пиковые дни возможен 1027.
- Если Worker с расчётом колец всё равно на Workers Paid, тайлы делят с ним 10 млн включённых запросов и добавляют к счёту только хранение.
- **Без Worker:** около 5 млн Class B при 50 тайлах (плюс чтение директорий PMTiles) укладываются в бесплатные 10 млн, итого ≈ $1,9. При 100 тайлах — ≈ $2–2,3. Расплата за дешевизну — задержка R2 на каждом тайле.

**Лицензия и атрибуция** ([README basemaps](https://github.com/protomaps/basemaps#licensing-and-attribution-guidelines)):

- Код под BSD-3, дизайн карты под CC0.
- Тайлы — производная работа от OSM под ODbL: «must visibly attribute © OpenStreetMap».
- Упоминать Protomaps просят, но не требуют. Данные Natural Earth отдельной атрибуции в углу карты не требуют.

**Русские подписи.**

- В тайлах есть `name:ru`. Я проверил это по метаданным `vector_layers` той же сборки: поле есть в слоях `places`, `roads`, `water`, `pois` и `earth`. Ещё там есть поля `script`/`script2`/`script3` и `name2`/`name3` для многоалфавитных названий. В документации русский указан как `name:ru`, письменность Cyrillic ([localization](https://docs.protomaps.com/basemaps/localization)).
- Подписи включают так: `layers("protomaps", namedFlavor("light"), {lang: "ru"})` ([maplibre](https://docs.protomaps.com/basemaps/maplibre)). Есть оформления (flavors) `light`, `dark`, `white`, `grayscale` и `black`.
- Без опции `lang` функция `layers()` вообще не добавляет слоёв подписей. Это видно в коде `@protomaps/basemaps@5.7.2`, `dist/esm/index.js`: подписи добавляются только при `n.lang`.
- Что показывается, если русского названия нет. Логика взята из исходника [styles/src/language.ts](https://github.com/protomaps/basemaps/blob/main/styles/src/language.ts):
  - **Страны** (`places_country`): `coalesce(name:ru, name:en)`. Местного названия в запасе нет.
  - **Остальные подписи, местное `name` на кириллице:** одна строка, `name:ru`, а если его нет, то `name`. Для России, Беларуси, Украины, Болгарии, Сербии получаются местные кириллические названия.
  - **Остальные подписи, местное `name` в другой письменности:** первая строка — `name:ru`, а если его нет, то `name:en`. Вторая строка — местное `name`. Вторую строку убирают, если первая взята из `name:en`, а местное название латиницей. Пример: «Мюнхен / München».
  - **Письменность, которую MapLibre не умеет рисовать** (например, кхмерская): `name:en`.
- Итого по умолчанию: русское, иначе английское, и местное второй строкой. Это видно и в правилах документации: «If the target language is not available, fallback to name:en if the local script is not Latin», «Show local names only if they use a different script than the target language».
- **Под правило из #1** («русское, иначе местное», одна строка): `layers()` возвращает обычный массив слоёв, и в слоях-подписях `layout["text-field"]` заменяется на `["coalesce", ["get","name:ru"], ["get","name"]]`. Для стран подходит `["coalesce", ["get","name:ru"], ["get","name:en"], ["get","name"]]`.
- **Шрифты.** Нужен диапазон glyphs с кириллицей. В `protomaps.github.io/basemaps-assets` для «Noto Sans Regular» он есть: `1024-1279.pbf` весит 125 320 байт, проверено 2026-11-07. Для продакшена ассеты лучше положить к себе — их можно скачать архивом ([maplibre](https://docs.protomaps.com/basemaps/maplibre)).

**MapLibre на телефоне.**

- `@protomaps/basemaps@5.7.2` весит ≈7 КБ в gzip. Его можно не тянуть в бандл и собрать статичный `style.json` заранее ([maplibre](https://docs.protomaps.com/basemaps/maplibre)).
- `pmtiles@4.5.0` весит ≈8 КБ в gzip и нужен только для варианта без Worker.
- Со своим Worker это обычный векторный источник ZXY для MapLibre.

## 2. OpenFreeMap

- **Цена:** «completely free: there are no limits on the number of map views or requests». Нет ни регистрации, ни ключей, ни cookies. Коммерческое использование разрешено: «Is commercial usage allowed? Yes.» ([openfreemap.org](https://openfreemap.org/)).
- **Условия:** сервис работает «as-is», без гарантий, и «may discontinue it at any time without notice». SLA нет ([ToS](https://openfreemap.org/tos/)).
- **Не Cloudflare:** публичные тайлы отдаёт nginx с выделенных серверов. Домен `.org` «not hosted through CloudFlare», а через Cloudflare идут только бакеты для скачивания на `.com` ([README](https://github.com/hyperknot/openfreemap)).
- **Данные:**
  - Схема OpenMapTiles 3.16.0, maxzoom 14. Это видно из TileJSON `https://tiles.openfreemap.org/planet`.
  - Еженедельно публикуются сборки мира в Btrfs, MBTiles и PMTiles ([README](https://github.com/hyperknot/openfreemap)). Файл `areas/planet/20261101_080013_pt/tiles.pmtiles` весит **87 352 499 305 байт (87,35 ГБ)**, заголовок: z0–14 (проверено HEAD-запросом и чтением заголовка 2026-11-07).
  - Свой сервер по их скрипту требует около 200 ГБ диска ([self_hosting.md](https://github.com/hyperknot/openfreemap/blob/main/docs/self_hosting.md)). Serverless так не получится, но их PMTiles можно положить в R2 и раздавать тем же PMTiles Worker. Хранение ≈ $1,1 в месяц, остальное как у Protomaps.
- **Атрибуция:** «OpenFreeMap © OpenMapTiles Data from OpenStreetMap». Часть про OpenFreeMap необязательна ([README](https://github.com/hyperknot/openfreemap)). Дизайн схемы OpenMapTiles под CC-BY 4.0, нужна подпись «© OpenMapTiles» ([LICENSE.md](https://github.com/openmaptiles/openmaptiles/blob/master/LICENSE.md)).
- **Русские подписи:**
  - В тайлах есть `name:ru`: TileJSON перечисляет поля `name:*`, среди них `name:ru`. В схеме OpenMapTiles `ru` входит в список языков ([openmaptiles.yaml](https://github.com/openmaptiles/openmaptiles/blob/master/openmaptiles.yaml)).
  - Стандартный стиль Liberty подписывает `name:latin` + `name:nonlatin`, иначе `coalesce(name_en, name)`. Опции языка у стилей нет, а в Quick Start о языках ничего ([quick_start](https://openfreemap.org/quick_start/)).
  - Поэтому для русского `text-field` во всех слоях-подписях заменяется на `["coalesce", ["get","name:ru"], ["get","name"]]`. Без `name:ru` останется местное `name`.
- **MapLibre:** официальный пример — `new Map({style: 'https://tiles.openfreemap.org/styles/liberty'})` ([quick_start](https://openfreemap.org/quick_start/)).

## 3. MapTiler Cloud

- **Цены** ([pricing](https://www.maptiler.com/cloud/pricing/)):
  - **Free:** $0. Включает 5 000 сессий и 100 000 запросов к API в месяц. Подходит для «testing, PoC, prototyping, personal, or non-commercial use», на карте обязателен логотип MapTiler.
  - **Flex:** $30 в месяц. Включает 25 000 сессий и 500 000 запросов. Сверх этого $2,50 за 1 000 сессий и $0,15 за 1 000 запросов.
- **Сессия:** «a webpage or mobile-app load which contains a map initialization». Она длится до 6 часов или до 10 000 запросов. Посессионно считают только MapTiler SDK JS (и плагин для Leaflet на нём). Сторонние клиенты оплачиваются за каждый запрос: «Switching to sessions is not technically possible in this case» ([sessions vs requests](https://docs.maptiler.com/guides/account/sessions-vs-requests/)).
- **1 000 просмотров:** Free, $0 — при условии, что сайт некоммерческий и логотип нас устраивает.
- **100 000 просмотров:**
  - С SDK: $30 + 75 × $2,50 = **$217,50**.
  - С MapLibre без SDK: 5 млн запросов, $30 + 4 500 × $0,15 = **$705** (при 16 тайлах на просмотр — $195).
- **Атрибуция:** «© MapTiler © OpenStreetMap contributors» ([copyright](https://www.maptiler.com/copyright/)).
- **Русские подписи:**
  - В SDK язык задаётся `config.primaryLanguage` или `map.setLanguage(...)` ([пример](https://docs.maptiler.com/sdk-js/examples/language-map/)). `Language.RUSSIAN` — это `{code: "ru", flag: "name:ru"}` ([language.ts](https://github.com/maptiler/maptiler-client-js/blob/main/src/language.ts)).
  - SDK подставляет в подписи `["coalesce", ["get", "name:ru"], ["get", "name"]]` ([Map.ts](https://github.com/maptiler/maptiler-sdk-js/blob/main/src/Map.ts)). Это ровно правило из #1: русское, иначе местное.
- **Телефон:** `@maptiler/sdk@4.2.1` — обёртка над `maplibre-gl` (импортирует его). Сам SDK весит ≈113 КБ в gzip (`dist/maptiler-sdk.mjs`, 489 125 байт без сжатия) поверх MapLibre.
- **Cloudflare:** не используется, это сторонний хостинг.

## 4. Stadia Maps

- **Цены** ([pricing](https://stadiamaps.com/pricing/)):
  - **Free:** $0, 200 000 кредитов, «Commercial use not allowed».
  - **Starter:** $20 за 1 млн кредитов, дальше 3¢ за 1 000.
  - **Standard:** $80 за 7,5 млн, дальше 2¢ за 1 000.
  - **Professional:** $250 за 25 млн.
  - Векторный тайл стоит 1 кредит.
  - Когда кредиты кончаются, API отвечает HTTP 429. Докупку сверх пакета (pay-as-you-go) нужно включить самому. Проксировать и кэшировать тайлы у себя условия запрещают ([limits](https://docs.stadiamaps.com/limits/)).
- **1 000 просмотров:** 50 000 кредитов. Free, если сайт некоммерческий, иначе Starter за $20.
- **100 000 просмотров:** 5 млн кредитов — Standard за **$80**. Starter обошёлся бы в $140. При 100 тайлах — $130, при 16 тайлах — $38.
- **Данные:** схема, совместимая с OpenMapTiles, «zoom levels 0 through 14», дальше оверзум ([vector](https://docs.stadiamaps.com/vector/)).
- **Атрибуция:** «© Stadia Maps © OpenMapTiles © OpenStreetMap» ([attribution](https://docs.stadiamaps.com/attribution/)).
- **Русские подписи:** `ru` есть в списке языков. Нужно переписать `text-field` по образцу `["coalesce", ["get", "name:fr"], ["get", "name:latin"], ["get", "name"]]` и хостить изменённый стиль у себя ([tutorial](https://docs.stadiamaps.com/tutorials/changing-the-map-label-language/)). Для нашего правила `name:latin` из цепочки убираем.
- Страница `docs.stadiamaps.com/faq/` вернула 403, на ней могли быть детали о подсчёте кредитов. Цифры выше взяты со страницы цен.

## 5. VersaTiles

- **Публичный сервер** `tiles.versatiles.org`: «free and open to everyone, but it comes without any guarantees». Лимит запросов по IP (при превышении `429` с `Retry-After`), без гарантии 100% доступности. Стили и ассеты «may change», поэтому их советуют держать у себя ([use tiles.versatiles.org](https://docs.versatiles.org/guides/use_tiles_versatiles_org.html)).
- **Данные:** схема Shortbread, z0–14. Мир (`osm.versatiles`) весит **62,1 ГБ**, и скачать его можно в форматах `.versatiles`, `.pmtiles`, `.mbtiles` ([download.versatiles.org](https://download.versatiles.org/)). PMTiles кладётся в R2 и раздаётся тем же Worker, хранение ≈ $0,8 в месяц.
- **Атрибуция:** в TileJSON указано «© OpenStreetMap contributors» ([tiles.json](https://tiles.versatiles.org/tiles/osm/tiles.json)).
- **Русские подписи:**
  - В базовой схеме Shortbread 1.0 только `name`, `name_en` и `name_de` ([schema](https://shortbread-tiles.org/schema/1.0/)).
  - Но тайлы VersaTiles собраны по `shortbread@1.1`, и в слоях подписей у них есть `name_ru` (проверено по TileJSON, ≈80 полей `name_*`).
  - Стиль `@versatiles/style@8.1.1` (MIT) с `text: { language: 'ru' }` строит `['coalesce', ['get', 'name_ru'], ['get', 'name']]`: русское, иначе местное ([README](https://github.com/versatiles-org/versatiles-style)).
- **Минус:** проект предупреждает, что обновляет библиотеки и стили «including breaking changes» и что тайлы тоже могут меняться ([use tiles.versatiles.org](https://docs.versatiles.org/guides/use_tiles_versatiles_org.html)). Значит, стиль и библиотеку нужно зафиксировать у себя.

## 6. Другие варианты

- **Protomaps API** (`api.protomaps.com`): «free for non-commercial use». Для коммерческого использования нужно стать GitHub Sponsor, сумма не указана. Обновляется нерегулярно, реже раза в неделю ([protomaps.com/api](https://protomaps.com/api)). Те же данные, что в варианте 1, но без контроля над хостингом.
- **Mapbox:**
  - 50 000 загрузок карты в месяц бесплатно, затем $5 за 1 000 (от 50 001 до 100 000). Загрузка включает неограниченные тайлы, но только с Mapbox GL JS.
  - Vector Tiles API: 200 000 запросов бесплатно, затем $0,25, $0,20 и $0,15 за 1 000 по ступеням ([pricing](https://www.mapbox.com/pricing)).
  - 100 000 просмотров стоят **$250** с Mapbox GL JS или **≈$1 000** с MapLibre (5 млн тайлов).
  - В Mapbox Streets v8 есть `name_ru`. Его значение «`null` if no translation data is available», так что запасной вариант собираем сами ([streets-v8](https://docs.mapbox.com/data/tilesets/reference/mapbox-streets-v8/)).
  - `mapbox-gl@3.34.2` идёт под собственной лицензией («SEE LICENSE IN LICENSE.txt», npm). Это не Cloudflare и не MapLibre, вариант слабый.

## MapLibre GL JS на телефоне

Это общая часть для всех вариантов: все они отдают векторные тайлы MVT и стиль MapLibre.

- **Версия:** актуальная `maplibre-gl@6.16.0` (2026-10-25). Версия 6.0.0 (2026-07-22) перешла на ESM-only сборку, и «WebGL (v1) support has been removed; WebGL2 is now required» ([CHANGELOG](https://github.com/maplibre/maplibre-gl-js/blob/main/CHANGELOG.md)). WebGL2 поддерживают 97,29% пользователей в мире, в iOS Safari — с версии 15 ([caniuse](https://caniuse.com/webgl2)).
- **Вес** (измерен `gzip -9` по файлам из npm-пакета `maplibre-gl@6.16.0`):
  - `maplibre-gl.mjs` — 1 108 049 байт, ≈294 КБ в gzip.
  - Воркер `maplibre-gl-worker.mjs` (подключается через `setWorkerUrl`) — 519 372 байта, ≈147 КБ в gzip.
  - CSS — ≈10 КБ в gzip.
  - Всего ≈450 КБ в gzip. К этому добавляется: Protomaps +7 КБ (или 0 со статичным стилем), `pmtiles` +8 КБ, MapTiler SDK +113 КБ.
- **Производительность:** у MapLibre нет отдельного руководства для телефонов. Общие советы из [large-data](https://maplibre.org/maplibre-gl-js/docs/guides/large-data/): меньше слоёв и подписей, расстановка подписей «can be computationally intensive», `maxzoom` около 12 у тяжёлых GeoJSON-источников. Это пригодится для полигона кольца: его лучше упрощать на сервере.
- **Русские подписи грузят ещё один диапазон glyphs** на каждый fontstack: для Noto Sans Regular это ≈125 КБ.

## Насколько часто есть `name:ru`

По [taginfo](https://taginfo.openstreetmap.org/) на 2026-11-07 `name:ru` есть у:

- 54% объектов `place=city` (8 362 из 15 377), [API](https://taginfo.openstreetmap.org/api/4/tag/combinations?key=place&value=city&query=name:ru);
- 19% `place=town` (22 577 из 116 933), [API](https://taginfo.openstreetmap.org/api/4/tag/combinations?key=place&value=town&query=name:ru);
- 7% `place=village` (122 708 из 1 780 561), [API](https://taginfo.openstreetmap.org/api/4/tag/combinations?key=place&value=village&query=name:ru).

Крупные города в основном получат русскую подпись, а мелкие населённые пункты за пределами русскоязычных стран обычно нет. Поэтому выбор запасного варианта (местное или английское) заметен на карте. Во всех вариантах данные одни и те же, из OSM, так что покрытие одинаковое.

## Риск, общий для всего Cloudflare

С 9 июня 2025 года российские провайдеры ограничивают доступ к Cloudflare: «the throttling allows Internet users to load only the first 16 KB of any web asset». По внешним сообщениям, затронуты и Hetzner, DigitalOcean и OVH ([блог Cloudflare](https://blog.cloudflare.com/russian-internet-users-are-unable-to-access-the-open-internet/)). Риск касается всего сайта на Cloudflare, а не только подложки. Если аудитория в России важна, это отдельный вопрос к инфраструктуре.

## Рекомендация

**Protomaps Basemap: мировой PMTiles в R2 и PMTiles Worker на своём домене.** Почему:

1. **Работает на Cloudflare, платим только за использование.** ≈$1,9 в месяц при 1 000 просмотров и ≈$6,9 при 100 000, а при общем Workers Paid — только ≈$1,9. Сторонних квот, ключей и условий «только некоммерческое» нет, в отличие от MapTiler и Stadia, которые при 100 000 просмотров стоят $80–705.
2. **Русский язык поддержан прямо в стиле.** `name:ru` есть в тайлах, а `@protomaps/basemaps` знает `ru`. Нашему правилу соответствует одна замена `text-field`.
3. **Самая подробная карта среди бесплатных вариантов:** z15 против z14 у OpenMapTiles и Shortbread. Сборки ежедневные, лицензия простая: только «© OpenStreetMap». Стиль под CC0, код под BSD-3.
4. **Разнообразие оформлений:** `white` и `grayscale` хорошо подходят как спокойный фон под полигон кольца.

Что учесть при реализации:

- **Источник тайлов** — ZXY через Worker, а не прямой `pmtiles://` из R2. Без Worker файл в 139 ГБ не кэшируется на краю, и каждый тайл ждёт задержку R2 (500+ мс).
- **Срок кэша:** `CACHE_CONTROL` поднять выше суток, ведь тайлы одной сборки не меняются. Новую сборку класть под новым именем файла. Cache API работает в одном дата-центре, так что первые запросы в каждом регионе будут медленными.
- **Подписи:** `lang: "ru"` плюс замена `text-field` на `coalesce(name:ru, name)`. Можно оставить двухстрочный режим Protomaps «русское / местное» и запасной английский, но это решение владельца. Рамки в #1 говорят «иначе местное».
- **Шрифты и спрайты** раздавать из static assets своего Worker или Pages (бесплатно), а не с `protomaps.github.io`.
- **Обновлять данные** вручную, раз в несколько месяцев: скачать, проверить BLAKE3, залить через `rclone`.
- **Для быстрого прототипа** можно начать с публичного OpenFreeMap: `name:ru` там есть, нужна только замена `text-field`. Переход на свои тайлы потом сводится к смене источника и стиля.

## Что не проверено и что проверить на прототипе

- Сколько тайлов на самом деле грузит один просмотр. Посчитать запросы в DevTools на телефоне: открыть карту и подвигать ползунок 1 → 12 ч.
- Хватает ли PMTiles Worker на промахе кэша 10 мс CPU бесплатного плана. Это важно, только если остаёмся на Workers Free.
- Как Cloudflare тарифицирует range-запросы к публичному бакету R2 с кэшем на своём домене. На странице цен R2 об этом нет, а Protomaps пишет, что каждый range-запрос — это GET.
- FAQ Stadia (`docs.stadiamaps.com/faq/`) вернул 403. Учитываются ли там стиль, шрифты и спрайты, не выяснено.

## Как проверялось

- Размеры мировых файлов: HEAD-запросы к `build.protomaps.com`, `btrfs.openfreemap.com` и страница `download.versatiles.org`, 2026-11-07.
- Зумы и метаданные: первые 127 байт PMTiles (заголовок) и блок метаданных Protomaps (1 179 байт). Сами тайлы не скачивались.
- Вес бандлов: `npm pack` пакетов `maplibre-gl@6.16.0`, `pmtiles@4.5.0`, `@protomaps/basemaps@5.7.2`, `@maptiler/sdk@4.2.1` и `@versatiles/style@8.1.1`, затем `gzip -9` по файлам `dist`.
- Логика подписей: исходники `protomaps/basemaps` (`styles/src/language.ts`), `maptiler-sdk-js` (`src/Map.ts`), `maptiler-client-js` (`src/language.ts`) и `dist` пакета `@versatiles/style`.
