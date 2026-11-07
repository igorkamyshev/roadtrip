# Кольца через внешние API изохрон (тикет #3)

Дата исследования: 2026-11-07. Источники: официальная документация, страницы цен и условия использования поставщиков (ссылки у каждого утверждения и в конце файла). Ни на один сервис мы не регистрировались, ничего не оплачивали. Поэтому API с ключом на 12-часовых изохронах не тестировались.

## Вопрос

Какие внешние API изохрон с оплатой за запрос могут посчитать «кольцо» по всему миру, то есть контуры N−1 и N часов при N до 12, с нашими условиями:

1. страны, закрытые для путешественника, исключаются целиком, в том числе транзит;
2. каждый пересечённый пограничный переход с паспортным контролем добавляет 1,5 ч, внутри Шенгена ничего не добавляется;
3. закрытые сухопутные границы между заданными парами стран не пересекаются;
4. без паромов;
5. время за рулём × 1,2.

## Коротко

**Ни один внешний API не выполняет условия 1–5 для N до 12.** Ни у одного API нет условия 2, то есть доплаты за границу, которая не начисляется внутри Шенгена. Почти все API отпадают уже по максимальному времени изохроны. Ближе всех HERE Isoline Routing v8: у него есть строгое исключение стран, исключение областей и отказ от паромов, но предел 9 ч и лицензия, которая запрещает отдавать один ответ многим пользователям. Подробности в разделе «Что подходит / что нет».

## Как условия переводятся в параметры API

- **Условие 5 (×1,2).** Глобального множителя скорости нет ни у одного API: Valhalla `top_speed`/`fixed_speed` и HERE `vehicle[speedCap]` только ограничивают скорость сверху. Условие выполняется у всех одинаково: запрашиваем лимит времени N/1,2 ч. Значит, для N = 12 нужен API, который считает **10 ч чистого вождения (36 000 с)**. Если API сам добавляет время на границе (Valhalla `country_crossing_cost`), то доплату тоже надо задать в «водительских» секундах: 1,5 ч / 1,2 = 4500 с.
- **Кольцо.** Ни один API не возвращает кольцо напрямую. Нужны два контура (N−1 и N), а кольцо получается разностью полигонов на нашей стороне, например в Worker. У HERE изолинии по определению без дыр ([HERE: avoid features](https://docs.here.com/routing/docs/isoline-v8-avoid-features.md)), поэтому разность вычисляется без сюрпризов.
- **Какие N покрывает API.** N покрыт, если N/1,2 ч не больше максимального времени API. Например, при пределе 9 ч покрыты N ≤ 10, при 2 ч только N ≤ 2. Это без учёта доплат на границах, которых API всё равно не умеют.

## Сводная таблица: ограничения и условия

«—» означает, что такой возможности нет или она не документирована. «мягко» означает предпочтение: API избегает, но может использовать, если иначе маршрута нет.

| API | Макс. время изохроны | Покрывает N ≤ | 1. Исключить страны | 2. Доплата за границу, без Шенгена | 3. Закрытые пары границ | 4. Без паромов |
|---|---|---|---|---|---|---|
| **HERE Isoline Routing v8** | 32 400 с = **9 ч** | 10 | ✅ `exclude[countries]=CZE,SVK` (ISO alpha-3), строго | — | ✅ `exclude[areas]` (bbox / polygon / corridor), строго; ≤ 20 polygon+corridor, ≤ 250 всего | ✅ `avoid[features]=ferry` (в изолиниях исключает сегменты) |
| **TomTom Reachable Range** | `timeBudgetInSec` ≤ 10 000 000 (практически без предела) | 12 | — | — (`avoid=borderCrossings` запрещает **все** границы) | мягко: `avoidAreas.rectangles`, ≤ 10 прямоугольников ≤ ~160×160 км | ✅ `avoid=ferries` или `maxFerryLengthInMeters=0` |
| **TravelTime** | 14 400 с = **4 ч** (больше по запросу) | 4 | — | — | — | ✅ режим `driving` (паромы только в `driving+ferry`) |
| **Azure Maps Route Range** | 21 600 с = 6 ч (упрощённый полигон), 3600 с (детальный) | 7 | — | — (`avoid: borderCrossings` запрещает все) | — | ✅ `avoid: ferries` |
| **Esri ArcGIS Service Area** | 5 ч (детальные полигоны: 15 мин) | 6 | — (не изучалось глубже) | — | — | — (не изучалось) |
| **AWS Location CalculateIsolines** | `Thresholds.Time` ≤ 10 800 с = 3 ч | 3 | — (только мягкие `Avoid.Areas`) | — | мягко: `Avoid.Areas` | мягко: `Avoid.Ferries` |
| **Valhalla у Stadia Maps** | `contours[].time` ≤ **120 мин** | 2 | — | ≈ `costing_options.auto.country_crossing_cost` (с, по умолчанию 600, прибавляется ко времени), но **на всех** границах, Шенген тоже | — (в схеме isochrone у Stadia нет `exclude_polygons`) | мягко: `use_ferry` (0…1) |
| **PTV Developer Routing** (reachable-areas) | **2 ч** (async), 20 мин (sync) | 2 | ✅ `options[prohibitedCountries]` (ISO alpha-2) | — | ✅ `options[blockIntersectingRoads]` (полилинии) | мягко: avoid `FERRIES` |
| **Geoapify Isoline** | 15–60 мин по тарифу, Custom 120 мин | 2 | мягко: `avoid=country_codes:us,ca` | — | мягко: `avoid=polygon:…`/`location:…` | мягко: `avoid=ferries` |
| **Mapbox Isochrone** | **60 мин** | 1 | — | — | — | ✅ `exclude=ferry` |
| **openrouteservice (хостинг HeiGIT)** | 1 ч для `driving-*` | 1 | ✅ `options.avoid_countries` (ID стран ORS) | ≈ `options.avoid_borders="controlled"`: открытые границы пересекает, контролируемые **запрещает** (не доплата) | `options.avoid_polygons` | ✅ `options.avoid_features:["ferries"]` |
| **GraphHopper Isochrone (хостинг)** | 15/20/30 мин по тарифу, Custom до 60 мин | 1 | — (в GET /isochrone нет custom model) | — | — | — (не документировано для isochrone) |
| **NextBillion.ai Isochrone** | 40 мин | 0 | — | — | — | — |
| **Targomo Isochrone** | не документировано | ? | — | — | — | — |

## Сводная таблица: кольцо, цена, кэш

| API | Два контура в одном запросе | Цена кольца (2 контура) | Бесплатно | Кэш по лицензии |
|---|---|---|---|---|
| **HERE** | да: `range[values]=27000,30000` (N = 9 и 10 после ÷1,2) | 2 транзакции: **≈ $0,0117** при $5,83 за 1000 (2 501–200 000/мес); дальше $4,66 / $4,08 / $1,75 / $1,17 | 2 500 транзакций/мес (≈ 1 250 колец) | ❌ хранить не дольше 30 дней; запрещено «scaling one Request to serve multiple End Users» |
| **TomTom** | нет: один бюджет на запрос, 2 запроса | цену за 1000 со страницы получить не удалось (виджет на JS) | 2 500 запросов/мес | не проверено |
| **TravelTime** | да: до 10 `departure_searches` в одном POST | без оплаты за запрос: годовая лицензия по цене «по запросу», от 12 мес | Basic только для разработки, не для коммерции | ✅ в Production «caching, retention, refresh and reuse rights» |
| **Azure Maps** | нет: один бюджет | не изучалось | — | не проверено |
| **Esri** | да (breaks без лимита) | 0,5 кредита за каждую service area | — | не проверено |
| **AWS Location** | да, до 5 порогов, каждый оплачивается | не изучалось | — | не проверено |
| **Stadia Maps** | да, до 4 контуров, **один** оплачиваемый запрос | 20 кредитов ≈ **$0,0006** при доплате Starter (3¢ за 1000 кредитов) | Free: 200 000 кредитов/мес, не для коммерции | ❌ «server-side caching is prohibited», клиентский кэш до 7 дней |
| **PTV Developer** | да, до 5 horizons | не изучалось | — | не проверено |
| **Geoapify** | да, до 10 диапазонов | 1 кредит за каждые 5 запрошенных минут | 3 000 кредитов/день, коммерция разрешена | ✅ «cache or store … without restrictions» |
| **Mapbox** | да, до 4 контуров | $0,002 ($2 за 1000) | 100 000 запросов/мес | показывать только на карте Mapbox |
| **openrouteservice** | да: `range` + `interval`, до 10 | бесплатно, платных тарифов нет | 500 изохрон/день, 20/мин | не проверено |
| **GraphHopper** | да: `buckets` (равные интервалы) | 2 кредита за минуту поиска, минимум 10 | Free 500 кредитов/день, не для коммерции | не проверено |
| **NextBillion.ai** | да, до 4 контуров | не изучалось | — | не проверено |
| **Targomo** | да: массив `rings` («edge weights») | 1 операция за каждые 60 мин макс. времени: ≈ €0,018 за 12 ч при €1,50 за 1000 | €300/мес кредита публичным приложениям | ❌ «may not be permanently stored»; кэш только в индивидуальном предложении |

## По каждому API

### HERE Isoline Routing API v8 — ближе всех, но не подходит

- **Время.** `range[type]=time`, максимум **32 400 с (9 ч)** ([справочник API](https://docs.here.com/routing/reference/isoline-routing-api-v8-calculateisolines.md), схема `Range`). Это 10,8 ч в пересчёте на путешественника, то есть покрыты N ≤ 10, а N = 11 и 12 уже нет.
- **Несколько контуров.** `range[values]` — «comma-separated list of ranges» ([справочник](https://docs.here.com/routing/reference/isoline-routing-api-v8-calculateisolines.md), [multi-range](https://docs.here.com/routing/docs/isoline-v8-multi-range-isoline.md)). Предел количества значений в справочнике не указан.
- **Условие 1.** `exclude[countries]`: ISO-3166-1 alpha-3, «Exclude countries guarantees exclusion, but doesn't guarantee finding a route» ([справочник](https://docs.here.com/routing/reference/isoline-routing-api-v8-calculateisolines.md), схема `Exclude`; [How to exclude territories](https://docs.here.com/routing/docs/routing-v8-exclude-territories.md)). Это строгое исключение, транзит тоже запрещён.
- **Условие 2.** Параметров для времени на границе нет.
- **Условие 3.** `exclude[areas]` (bbox, polygon, corridor, через `|`), строгое исключение. Лимиты: «Maximum count of avoided and excluded polygons and corridors is 20», «Maximum total count … is 250», не больше 100 точек в полигоне ([справочник](https://docs.here.com/routing/reference/isoline-routing-api-v8-calculateisolines.md); [exclude territories](https://docs.here.com/routing/docs/routing-v8-exclude-territories.md)). Короткий список закрытых переходов можно закрыть bbox-ами вокруг дорог перехода.
- **Условие 4.** `avoid[features]=ferry`, а также `carShuttleTrain` для автопоездов вроде Евротоннеля. В изолиниях avoid работает жёстче, чем в маршрутах: «An avoid option in isoline calculation is excluding segments from the isoline» ([How to use avoid options](https://docs.here.com/routing/docs/isoline-v8-avoid-options.md)). Паромные компоненты иначе возвращаются как `connections` ([multi-component](https://docs.here.com/routing/docs/isoline-v8-multi-component-isoline.md)).
- **Точность на больших расстояниях.** «In case of larger areas, roads of lower Functional Class are excluded from calculations in all `optimizeFor` modes» ([How to optimize isolines](https://docs.here.com/routing/docs/isoline-v8-optimization.md)). Размер ответа задаётся через `shape[maxPoints]` (больше 30, рекомендуется больше 100) и `shape[maxResolution]`.
- **Цена.** «1 Transaction equals each individual Isoline within an Isoline Request». Isoline Routing: 0–2 500 бесплатно, затем $5,83 / $4,66 / $4,08 / $1,75 / $1,17 за 1000, в евро €4,66 / €3,73 / €3,26 / €1,40 / €0,93 ([HERE pricing](https://www.here.com/get-started/pricing), [supplemental pricing](https://www.here.com/get-started/pricing/supplemental-pricing)).
- **Лицензия.** HERE Platform Terms (с 18.09.2023), §6.4(j): нельзя «Cache or store outside of the Platform any Results … for more than 30 days». §6.4(l): нельзя «… scaling one Request to serve multiple End Users». Exhibit 2 §1.3: кэшировать можно только «as explicitly allowed by the caching headers» ([HERE Platform Terms](https://www.here.com/en-gb/terms/here-platform-terms)). **Общий кэш колец для всех посетителей прямо противоречит §6.4(l).**

### TomTom Calculate Reachable Range — время есть, условий нет

- `timeBudgetInSec`: «Maximum value: 10000000». В одном запросе ровно один бюджет, поэтому на кольцо нужно два запроса ([документация](https://docs.tomtom.com/reachable-range-api/documentation/tomtom-maps/v1/calculate-reachable-range)).
- `avoid=borderCrossings`: «Avoids crossing country borders», то есть все границы сразу. Исключать отдельные страны нельзя. `avoidAreas.rectangles` (POST) допускает до 10 прямоугольников размером не больше ~160×160 км ([там же](https://docs.tomtom.com/reachable-range-api/documentation/tomtom-maps/v1/calculate-reachable-range)).
- Паромы: `avoid=ferries`; «Setting `maxFerryLengthInMeters` to `0` excludes all ferry connections».
- Полигон приблизительный: «The polygon might include regions outside the truly reachable area», «Portions of the reachable area may be missing». Есть ошибка `COMPUTE_TIME_LIMIT_EXCEEDED`, и документация предупреждает о таймаутах на длинных маршрутах ([там же](https://docs.tomtom.com/reachable-range-api/documentation/tomtom-maps/v1/calculate-reachable-range)).
- Бесплатно 2 500 запросов в месяц. Цену за 1000 показывает JS-виджет, и прочитать её не удалось ([TomTom pricing](https://docs.tomtom.com/pricing)).

### TravelTime — 4 ч и годовая лицензия

- `travel_time`: «Maximum value is `14400` (4 hours) as standard … To discuss increasing this, please contact» ([Isochrones](https://docs.traveltime.com/api/reference/isochrones)).
- Параметров исключения стран, областей или доплаты за границы нет. `polygons_filter` фильтрует уже готовый результат ([там же](https://docs.traveltime.com/api/reference/isochrones)). Паромы: режим `driving`, потому что «the `+ferry` modes behave like the plain mode but include ferry crossings» ([docs llms.txt](https://docs.traveltime.com/llms.txt)).
- В одном POST до 10 `departure_searches`, а также `unions`/`intersections` ([Isochrones](https://docs.traveltime.com/api/reference/isochrones)).
- Оплаты за запрос нет: «We never charge per API call», годовая подписка, минимум 12 месяцев. В Production есть права на кэширование ([TravelTime pricing](https://traveltime.com/pricing)). России, Китая и Северной Кореи нет в списке стран ([Supported countries](https://docs.traveltime.com/api/overview/supported-countries)).

### Valhalla у Stadia Maps — нужные примитивы есть, но 2 ч и запрет серверного кэша

- В OpenAPI Stadia у `contour.time` указано `"maximum": 120` (минуты), у `contours` `maxItems: 4` ([api.stadiamaps.com/openapi.json](https://api.stadiamaps.com/openapi.json)). У самого Valhalla по умолчанию тоже `max_time_contour: 120`, `max_contours: 4` ([valhalla_build_config](https://raw.githubusercontent.com/valhalla/valhalla/master/scripts/valhalla_build_config)).
- `country_crossing_cost`: «The estimated cost (in seconds) when encountering an international border», по умолчанию 600 ([OpenAPI Stadia](https://api.stadiamaps.com/openapi.json)). В документации Valhalla: «This cost is added to the estimated and elapsed times» ([Valhalla route API](https://valhalla.github.io/valhalla/api/route/api-reference/)). Доплата начисляется на **любой** международной границе, отличить Шенген нельзя. `country_crossing_penalty` влияет только на выбор пути, ко времени не добавляется.
- Исключения стран нет. `exclude_polygons` в схеме Stadia есть только у `routeRequest`, у `isochroneRequest` его нет. В Valhalla он к тому же ограничен по умолчанию: `max_exclude_polygons_length: 10000` (м периметра) и `max_exclude_polygons_vertices: 100` ([valhalla_build_config](https://raw.githubusercontent.com/valhalla/valhalla/master/scripts/valhalla_build_config)).
- Паромы: `use_ferry` — это «willingness», то есть предпочтение. Жёсткий `exclude_ferries` экспериментальный и работает, только если на сервере включено `service_limits.allow_hard_exclusions` ([Valhalla route API](https://valhalla.github.io/valhalla/api/route/api-reference/)).
- Цена: изохрона стоит 20 кредитов. Starter $20 в месяц за 1 млн кредитов, сверх этого 3¢ за 1000 кредитов. Free запрещает коммерческое использование ([Stadia pricing](https://stadiamaps.com/pricing/)). Число контуров цену не умножает ([Stadia: isochrones](https://stadiamaps.com/learn/isochrones/)).
- Кэш: ToS §8 п. 5 запрещает «proxying or caching access to our Services in any way», за исключениями вроде «standard client-side caching (server-side caching is prohibited)» сроком до 7 дней ([Stadia ToS](https://stadiamaps.com/terms-of-service/)). Статья Stadia советует «store the polygon» ([learn](https://stadiamaps.com/learn/isochrones/)), но обязывают условия использования.

### Остальные (отпадают по времени)

- **Mapbox**: «The maximum time that can be specified for an isochrone contour is 60 minutes», до 4 контуров, `exclude=ferry`, 300 запросов/мин. Результаты нужно показывать на карте Mapbox ([Mapbox Isochrone](https://docs.mapbox.com/api/navigation/isochrone.md)). 100 000 запросов/мес бесплатно, затем $2 за 1000 ([Mapbox pricing](https://www.mapbox.com/pricing)).
- **GraphHopper**: у `GET /isochrone` параметры `point`, `time_limit`, `distance_limit`, `profile`, `buckets`, `reverse_flow`, custom model нет ([GraphHopper getisochrone](https://docs.graphhopper.com/openapi/isochrones/getisochrone)). Максимальное время: Basic 15 мин, Standard 20, Premium 30, Custom до 60 ([GraphHopper pricing](https://www.graphhopper.com/pricing/)). Цена: «2 credits for every minute it explores», минимум 10 ([what is one credit](https://support.graphhopper.com/support/solutions/articles/44000718211-what-is-one-credit-)).
- **openrouteservice**: «Range time … 1 h (driving profiles)», 5 точек, 10 интервалов ([hosted API restrictions](https://giscience.github.io/openrouteservice/hosted-api-restrictions)). Опции `avoid_borders` («controlled»: «cross open borders but avoid controlled ones»), `avoid_countries`, `avoid_features: ferries`, `avoid_polygons` ([routing options](https://giscience.github.io/openrouteservice/api-reference/endpoints/directions/routing-options)). Изохроны принимают те же опции профиля ([isochrones](https://giscience.github.io/openrouteservice/api-reference/endpoints/isochrones/)). Квота Standard: 500 изохрон в день, 20 в минуту, сервис бесплатный ([openrouteservice.org/plans](https://openrouteservice.org/plans/)).
- **Geoapify**: максимум изохроны 15 мин (Free) … 120 мин (Custom) ([Geoapify pricing](https://www.geoapify.com/pricing/)). `avoid=…|country_codes:us,ca|ferries|polygon:…`, до 10 диапазонов, «cache or store the calculated isolines on your side without restrictions» ([Isoline API](https://apidocs.geoapify.com/docs/isolines/)). Но avoid — предпочтение: «won't exclude roads if there are no alternatives» ([Routing API](https://apidocs.geoapify.com/docs/routing/)).
- **AWS Location**: `Thresholds.Time` от 0 до 10 800 с, до 5 порогов, «You incur a calculation charge for each threshold» ([IsolineThresholds](https://docs.aws.amazon.com/location/latest/APIReference/API_IsolineThresholds.html), [CalculateIsolines](https://docs.aws.amazon.com/location/latest/APIReference/API_CalculateIsolines.html)). Все `Avoid` — предпочтения ([IsolineAvoidanceOptions](https://docs.aws.amazon.com/location/latest/APIReference/API_IsolineAvoidanceOptions.html)). Корзина Premium покрывает до 180 мин ([Routes pricing](https://docs.aws.amazon.com/location/latest/developerguide/routes-pricing.html)).
- **Azure Maps**: `timeBudgetInSec` до 21 600, а при `isSimplifiedPolygon=false` до 3600. Значения `avoid`: `ferries`, `borderCrossings` и другие. В одном запросе один бюджет ([Post Route Range](https://learn.microsoft.com/en-us/rest/api/maps/route/post-route-range?view=rest-maps-2026-01-01)).
- **Esri ArcGIS**: Service Area до 5 ч (детальные полигоны 15 мин), иерархия включается принудительно выше 240 мин, 0,5 кредита за service area ([ArcGIS Pro: credit consumption and analysis limits](https://doc.esri.com/en/arcgis-pro/latest/help/analysis/networks/credit-consumption-and-analysis-limits.html)).
- **PTV Developer**: `POST /reachable-areas` «limited to 200 km or 2 hours from a waypoint», до 5 `horizons`. Синхронный GET ограничен 25 км или 20 мин. Опции `options[prohibitedCountries]` и `options[blockIntersectingRoads]` (полилинии; дороги, которые их пересекают, запрещены) ([PTV Routing OpenAPI](https://api.myptv.com/meta/services/routing/v1/openapi.json)). Среди всех API у PTV лучший набор примитивов для условий 1 и 3, но предел 2 ч.
- **NextBillion.ai**: «The maximum time that can be specified is 40 minutes» ([Isochrone](https://docs.nextbillion.ai/docs/navigation/api/isochrone)).
- **Targomo**: максимальное время для car не документировано. Стоимость: «each 60 minutes is counted as 1 operation» ([Isochrone API](https://www.targomo.com/developers/apis/isochrone/)), €1,50 за 1000 операций, €300 в месяц бесплатно для публичных приложений ([pricing](https://www.targomo.com/developers/pricing/)). Однако граф разбит на региональные эндпоинты: `westcentraleurope` (Венгрия, Польша…) отдельно от `easterneurope` (Сербия, Литва…) ([coverage: West-Central](https://www.targomo.com/developers/resources/coverage/westcentraleurope/), [Eastern Europe](https://www.targomo.com/developers/resources/coverage/easterneurope/)). Поэтому 12-часовое кольцо через границу региона не посчитать. Кроме того, «results of the APIs may not be permanently stored» ([FAQ](https://www.targomo.com/developers/resources/faq/)).

## Время ответа и размер полигона для 12 ч

- **12-часовую изохрону не тестировал никто.** Ни один API не принимает 10 ч вождения (нужно для N = 12) вместе с нашими условиями. API с ключом без регистрации не проверить. Опубликованных бенчмарков для изохрон длиннее 1–2 ч в документации HERE, TomTom и TravelTime нет. Есть только косвенные признаки:
  - TomTom предупреждает о `COMPUTE_TIME_LIMIT_EXCEEDED`;
  - PTV требует асинхронный режим для горизонтов больше 20 мин;
  - Azure в batch-режиме отдаёт таймаут через 60 с.
- **Замер на бесплатном демо-сервере Valhalla (FOSSGIS)** без ключа, 2 запроса с соблюдением лимита 1 запрос/с ([условия FOSSGIS](https://fossgis.de/arbeitsgruppen/osm-server/nutzungsbedingungen)). Демо ограничено 60 мин: запрос на 120 мин вернул `"Exceeded max time: 60"`. Изохрона от Белграда, `auto`, `use_ferry=0`, контуры 30 и 60 мин, `polygons=true`: **0,87 с**, ответ **58 КБ** GeoJSON, 509 и 2 251 вершина.
- **Оценка для 12 ч (не замер).** При том же допуске генерализации число вершин растёт примерно пропорционально периметру, то есть примерно в 10–12 раз. Это порядка 20–30 тыс. вершин на контур и ~0,5–1,5 МБ GeoJSON на кольцо. Если поднять допуск (`generalize` в Valhalla/Mapbox, `shape[maxPoints]`/`maxResolution` в HERE), ответ сводится к десяткам килобайт. TomTom и Azure и так отдают упрощённый полигон: в примере Azure для 6000 с около 50 вершин ([Post Route Range](https://learn.microsoft.com/en-us/rest/api/maps/route/post-route-range?view=rest-maps-2026-01-01)).

## Что подходит / что нет

**Не подходит ни один API целиком.** Причины:

1. **Условия 2 нет нигде.** Ближе всех два варианта, но оба только на хостингах с пределом 1–2 ч:
   - Valhalla `country_crossing_cost` добавляет время, но на всех границах, Шенген тоже;
   - openrouteservice `avoid_borders="controlled"` запрещает контролируемые границы, а не добавляет к ним время.

   Эмулировать доплату можно серией запросов: изохрона внутри стартовой страны, затем новая изохрона от каждого пограничного перехода с остатком бюджета минус 1,5 ч, и так рекурсивно. Это десятки–сотни запросов на одно кольцо, что убивает и цену, и время ответа.
2. **По максимальному времени** (нужно 10 ч вождения) проходит только TomTom. HERE даёт N ≤ 10, Azure N ≤ 7, Esri N ≤ 6, TravelTime N ≤ 4, AWS N ≤ 3, а Stadia/Valhalla, PTV и Geoapify только N ≤ 2. Mapbox, openrouteservice и GraphHopper покрывают только N = 1, NextBillion — ни одного N.

**Частично:**

- **HERE Isoline v8** выполняет условия 1, 3, 4 и 5 строго и считает до N = 10 за ~$0,012 на кольцо. Против: нет условия 2, нет N = 11–12, а лицензия запрещает общий кэш (≤ 30 дней и «scaling one Request to serve multiple End Users»). Для публичного сайта с общим кэшем это блокер.
- **TomTom** покрывает N до 12, но не выполняет ни условие 1, ни условие 2 (только запрет всех границ). Условие 3 у него лишь в виде 10 мягких прямоугольников, полигон приблизительный, на кольцо нужно 2 запроса.
- **TravelTime** — без условий 1–3, до 4 ч, и это годовая лицензия, а не оплата за запрос.

**Вывод для карты:** путь «кольца через внешние API изохрон» закрывается. Набор нужных примитивов существует (`prohibitedCountries` и `blockIntersectingRoads` у PTV, `country_crossing_cost` у Valhalla, `exclude[countries]` у HERE), но ни у одного поставщика их нет вместе, без лимита в 10 ч и с правом кэшировать. Условия 1–5 придётся реализовать в собственном расчёте на своём графе дорог.

## Источники

- HERE: [Isoline API reference (md)](https://docs.here.com/routing/reference/isoline-routing-api-v8-calculateisolines.md) · [multi-range](https://docs.here.com/routing/docs/isoline-v8-multi-range-isoline.md) · [avoid options](https://docs.here.com/routing/docs/isoline-v8-avoid-options.md) · [avoid features / holes](https://docs.here.com/routing/docs/isoline-v8-avoid-features.md) · [optimization](https://docs.here.com/routing/docs/isoline-v8-optimization.md) · [multi-component](https://docs.here.com/routing/docs/isoline-v8-multi-component-isoline.md) · [exclude territories](https://docs.here.com/routing/docs/routing-v8-exclude-territories.md) · [pricing](https://www.here.com/get-started/pricing) · [supplemental pricing](https://www.here.com/get-started/pricing/supplemental-pricing) · [HERE Platform Terms (2023-09-18)](https://www.here.com/en-gb/terms/here-platform-terms)
- TomTom: [Calculate Reachable Range](https://docs.tomtom.com/reachable-range-api/documentation/tomtom-maps/v1/calculate-reachable-range) · [pricing](https://docs.tomtom.com/pricing)
- TravelTime: [Isochrones](https://docs.traveltime.com/api/reference/isochrones) · [llms.txt](https://docs.traveltime.com/llms.txt) · [supported countries](https://docs.traveltime.com/api/overview/supported-countries) · [pricing](https://traveltime.com/pricing)
- Stadia / Valhalla: [Stadia OpenAPI](https://api.stadiamaps.com/openapi.json) · [Stadia learn: isochrones](https://stadiamaps.com/learn/isochrones/) · [Stadia pricing](https://stadiamaps.com/pricing/) · [Stadia ToS](https://stadiamaps.com/terms-of-service/) · [Valhalla route API reference](https://valhalla.github.io/valhalla/api/route/api-reference/) · [valhalla_build_config](https://raw.githubusercontent.com/valhalla/valhalla/master/scripts/valhalla_build_config) · [FOSSGIS usage terms](https://fossgis.de/arbeitsgruppen/osm-server/nutzungsbedingungen)
- Mapbox: [Isochrone API](https://docs.mapbox.com/api/navigation/isochrone.md) · [pricing](https://www.mapbox.com/pricing)
- GraphHopper: [GET /isochrone](https://docs.graphhopper.com/openapi/isochrones/getisochrone) · [pricing](https://www.graphhopper.com/pricing/) · [what is one credit](https://support.graphhopper.com/support/solutions/articles/44000718211-what-is-one-credit-)
- openrouteservice: [hosted API restrictions](https://giscience.github.io/openrouteservice/hosted-api-restrictions) · [routing options](https://giscience.github.io/openrouteservice/api-reference/endpoints/directions/routing-options) · [isochrones](https://giscience.github.io/openrouteservice/api-reference/endpoints/isochrones/) · [plans](https://openrouteservice.org/plans/)
- Geoapify: [Isoline API](https://apidocs.geoapify.com/docs/isolines/) · [Routing API avoid](https://apidocs.geoapify.com/docs/routing/) · [pricing](https://www.geoapify.com/pricing/)
- Targomo: [Isochrone API](https://www.targomo.com/developers/apis/isochrone/) · [pricing](https://www.targomo.com/developers/pricing/) · [FAQ](https://www.targomo.com/developers/resources/faq/) · [coverage West-Central Europe](https://www.targomo.com/developers/resources/coverage/westcentraleurope/) · [coverage Eastern Europe](https://www.targomo.com/developers/resources/coverage/easterneurope/)
- AWS: [CalculateIsolines](https://docs.aws.amazon.com/location/latest/APIReference/API_CalculateIsolines.html) · [IsolineThresholds](https://docs.aws.amazon.com/location/latest/APIReference/API_IsolineThresholds.html) · [IsolineAvoidanceOptions](https://docs.aws.amazon.com/location/latest/APIReference/API_IsolineAvoidanceOptions.html) · [Routes pricing](https://docs.aws.amazon.com/location/latest/developerguide/routes-pricing.html)
- Azure Maps: [Post Route Range](https://learn.microsoft.com/en-us/rest/api/maps/route/post-route-range?view=rest-maps-2026-01-01)
- Esri: [credit consumption and analysis limits](https://doc.esri.com/en/arcgis-pro/latest/help/analysis/networks/credit-consumption-and-analysis-limits.html)
- PTV: [Routing API OpenAPI](https://api.myptv.com/meta/services/routing/v1/openapi.json)
- NextBillion.ai: [Isochrone API](https://docs.nextbillion.ai/docs/navigation/api/isochrone)
