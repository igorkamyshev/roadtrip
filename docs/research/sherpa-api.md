# Sherpa Requirements API: что он отдаёт для визовой модели

Тикет #2 карты планирования ([igorkamyshev/roadtrip#1](https://github.com/igorkamyshev/roadtrip/issues/1)). Проверено 2026-11-07.

Вопрос: что именно Sherpa Requirements API (`requirements-api.joinsherpa.com`) даёт, чтобы решить, открыта ли страна для путешественника.

## Источники

Документация (первоисточник, читалась 2026-11-07):

- **[S-v3]** OpenAPI v3: https://docs.joinsherpa.io/openapi/swagger-requirements-api-v3.json. Скачан повторно, побайтно совпадает с копией ранней пробы.
- **[S-v2]** OpenAPI v2: https://docs.joinsherpa.io/openapi/swagger-requirements-api-v2.json
- **[FAQ]** https://docs.joinsherpa.io/requirements-api/requirements-api-faq
- **[OVR]** https://docs.joinsherpa.io/requirements-api/ (разделы «Rate Limits & Quotas», «Caching»)
- **[TRIPS]** https://docs.joinsherpa.io/requirements-api/endpoints/trips
- **[QS]** https://docs.joinsherpa.io/requirements-api/quickstart
- **[QSV]** https://docs.joinsherpa.io/requirements-api/quickstart-visa
- **[SHOW]** https://docs.joinsherpa.io/requirements-api/use-cases/trips-v3-show-visas
- **[V2DEP]** https://docs.joinsherpa.io/requirements-api/use-cases/all-visa-requirements
- **[KEY]** https://docs.joinsherpa.io/resources/api-key-security
- **[LLM]** https://docs.joinsherpa.io/requirements-api/endpoints/trips-llm-friendly
- **[T&C]** https://www.joinsherpa.com/terms-conditions/

Ответы API (живые запросы 2026-11-07). Ссылка вида **[R: raw2/A01_min_trip.json]** означает «ответ API от 2026-11-07, сохранённый в этом файле». Файлы лежат в scratchpad сессии, в каталоге `sherpa/`: `raw/` — ранняя проба (09:40–09:49 UTC), `raw2/` — эта проверка (10:01–10:04 UTC, 24 запроса). Тела запросов лежат в `bodies/` и `bodies2/`, ключ из всех файлов вычищен.

## Коротко

- Есть два пути узнать, открыта ли страна:
  - `POST /v3/trips` документирован. Он принимает один паспорт и маршрут из 2–5 узлов, класс въезда приходит в поле `travelOpenness` (`LEVEL_1`…`LEVEL_4` / `NO_INFORMATION`).
  - `POST /v3/maps` **не документирован**. Он принимает один паспорт и одним запросом отдаёт классы для ~230 стран (65–80 КБ, ~0,5 с), но без даты и без текстов исключений.
- В выборке из 26 пар `maps` и `trips` совпали в 25. Расхождение одно: RUS→LAO, где `trips` даёт «может понадобиться виза» (L2), а `maps` даёт бумажную визу (L3). Оно держалось на обоих замерах.
- Имеющиеся визы и ВНЖ передать нельзя: лишние поля дают ошибку 400. Исключения вида «держателям шенгенской визы виза не нужна» есть только свободным текстом в `more[]` процедуры.
- Паспорт ровно один на запрос.
- Запреты въезда отдельным классом не приходят. `LEVEL_4` и `RESTRICTED_ENTRY` не встретились ни разу. ISR→LBN приходит как обычная виза, ISR→IRN — как `NO_INFORMATION` (в `maps` страны просто нет).
- Страна отправления и режим (`LAND`/`AIR`) на класс в выборке не повлияли. Дата влияет в `trips`, а `maps` знает только текущее состояние.
- Коды: alpha-3, alpha-2 тоже принимаются. Косово — `RKS`, коды `XKX` и `XK` дают ошибку 400. В `maps` есть лишний «Кипр» с кодом `NX` (судя по всему, Северный Кипр); `trips` молча превращает его в `CYP`.
- Лимиты по документации:
  - 100 req/s (тестовый ключ — 1000 req/h);
  - ответ не больше 10 МБ;
  - данные обновляются раз в час, кэшировать дольше часа «не рекомендуется».
  - Заголовков `cache-control` и rate-limit в ответах v3 на деле нет.
- Ключ, которым шла проверка, привязан к аффилиату `skyteam`. Для продакшена нужен свой ключ, его выдают только через форму продаж. Публичных условий использования API нет.

## 1. Минимальный рабочий запрос

### `/v3/trips`

```bash
curl -X POST 'https://requirements-api.joinsherpa.com/v3/trips' \
  -H 'x-api-key: <KEY>' \
  -H 'content-type: application/vnd.api+json' \
  --data '{"data":{"type":"TRIP","attributes":{
    "traveller":{"passports":["RUS"]},
    "travelNodes":[
      {"type":"ORIGIN","locationCode":"SRB","departure":{"date":"2026-12-10","time":"00:00","travelMode":"LAND"}},
      {"type":"DESTINATION","locationCode":"ALB","arrival":{"date":"2026-12-10","time":"00:00","travelMode":"LAND"}}]}}}'
```

Ответ: `201`, 2 КБ, `travelOpenness: "LEVEL_2"`, `headline: "You need a visa for Albania if you have a Russian passport."`. Без `include` массив `included` пустой. Заняло 0,65 с [R: raw2/A01_min_trip.json].

- **Обязательные поля по спецификации** [S-v3 `definitions`]:
  - `TripRequestAttributes`: обязательны `traveller` и `travelNodes`, причём `travelNodes` содержит от 2 до 5 узлов («up-to 3 transit nodes»);
  - `Traveller`: обязателен `passports`;
  - `TravelNodeRequest`: обязателен `type`;
  - `ArrivalOrDeparture`: обязательны `date` и `time`, а `travelMode` по умолчанию `AIR` из enum `AIR | SEA | LAND`;
  - заголовок `x-api-key` помечен `required: true` [S-v3 `paths./trips.post.parameters`].
- **Content-Type** должен быть ровно `application/vnd.api+json`, без параметров. Иначе приходит `415 "Please use 'application/vnd.api+json' (without any media type parameters)"` [R: raw/63_minimal.json].
- **Ключ** передаётся только заголовком.
  - Если передать `?key=` без заголовка, приходит `403 "Unable to get affiliateId."` [R: raw/60_auth_keyparam_only.json].
  - Без ключа шлюз Google отвечает `401` [R: raw/62_auth_none.json].
  - В `securityDefinitions` спецификации v3 почему-то указан заголовок `Authorization`, но параметр операции и [TRIPS] говорят `x-api-key`, и работает именно он.
- **Полные объекты процедур.** `?include=procedure,restriction` кладёт полные объекты процедур в `included` по правилам JSON:API: в группах лежат только ссылки `{type, id}` [QSV]. С этим параметром ответ весит от 3 до 110 КБ.
- **Язык.** `locale` принимает ~50 значений, включая `ru` и `ru-RU` [S-v3 `TripRequestAttributes.locale`]. С `ru-RU` `headline` приходит по-русски: «Вам нужна виза в Северную Македонию, если у вас есть паспорт гражданина Российской Федерации.» [R: raw/92_ru_srbmkd_land_ruRU.json].
- **Режим `LAND`.** [TRIPS] утверждает про `travelMode`: «Currently the only accepted value is AIR». На деле `LAND` принимается [R: raw2/A01_min_trip.json] и стоит в enum спецификации.
- **Песочница.** В примере [TRIPS] указан хост `requirements-api.sandbox.joinsherpa.com`. Его я не проверял.
- **Markdown-вариант.** Есть `POST /v3/trips/llm` с теми же данными в Markdown [LLM]; для визовой модели он не нужен.

### `/v3/maps` (не документирован, см. §3)

```bash
curl -X POST 'https://requirements-api.joinsherpa.com/v3/maps' \
  -H 'x-api-key: <KEY>' \
  -H 'content-type: application/vnd.api+json' \
  --data '{"data":{"type":"MAP","attributes":{"passportCode":"RUS"}}}'
```

Ответ: `201`, 65,6 КБ, 0,47 с [R: raw2/A03_maps_rus_noorigin_minimal.json]. Необязательные поля: `locale`, `covid19VaccinationStatus` и `relationships.origin = {"data":{"id":"SRB","type":"LOCATION"}}`.

## 2. Как кодируются классы въезда

### 2.1 `/v3/trips`: `travelOpenness`

В спецификации это голый enum без описаний [S-v3 `TripResourceAttributes.travelOpenness`]. Значения расшифрованы в документации [QS], [SHOW]:

| Значение | Смысл по документации |
|---|---|
| `LEVEL_1` | No visa required |
| `LEVEL_2` | Visa on Arrival / eVisa / ETA required |
| `LEVEL_3` | Paper visa required («through an embassy or consulate») |
| `LEVEL_4` | Entry restricted or no entry («nationality restrictions, travel bans, or diplomatic limitations») |
| `NO_INFORMATION` | «We don't have enough data to determine the travel openness level» |

Кроме `travelOpenness`, ответ содержит:

- группу `informationGroups[type=VISA_REQUIREMENTS]` с полем `enforcement` (`MANDATORY | RECOMMENDED | MAY_BE_REQUIRED | OPTIONAL | NOT_REQUIRED | UNKNOWN`);
- в ней ссылки на процедуры, у которых есть `documentTypes` (`E_VISA`, `ETA`, `EMBASSY_VISA`, `VISA`, `PAPER_VISA`, …), `lengthOfStay`, `startDate`/`endDate`, `more[]` [S-v3 `ProcedureEntityAttributes`].

Наблюдения [R: raw/*, raw2/B_*, raw2/E_*]:

| Что вернула процедура визы | `travelOpenness` | Примеры |
|---|---|---|
| «Visa is not required for a maximum of N days», `VISA`, `NOT_REQUIRED` | `LEVEL_1` | RUS→BIH, GEO, ARM, AZE, MDA, TUR |
| «Electronic travel authorization is recommended», `ETA`, `RECOMMENDED` | `LEVEL_1` | RUS→KAZ |
| «Electronic visitor visa», `E_VISA`, `MANDATORY` | `LEVEL_2` | RUS→ALB; IND→ALB, SRB, GEO |
| eVisa + «Visa on arrival», `E_VISA` + `VISA`, `MANDATORY` | `LEVEL_2` | RUS→KHM |
| «Visa is not required for a maximum of 30 days», `VISA`, **`MAY_BE_REQUIRED`** | `LEVEL_2` | RUS→LAO |
| «Visitor visa» / «Schengen visa», `EMBASSY_VISA`, `MANDATORY` | `LEVEL_3` | RUS→MNE, MKD, RKS, HRV, HUN, BGR, ROU, CYP, UKR |
| процедуры визы нет | `NO_INFORMATION` | RUS→SYR, ISR→IRN, RUS→MNE на 2026-10-20 |
| — | `LEVEL_4` | не встретился ни разу |

Из этого следуют три вывода:

- **Классифицировать надо по `travelOpenness`, а не по `documentTypes`.** `VISA` стоит и на процедуре «виза не нужна» [R: raw/02_ru_srb_bih_land.json]. В [FAQ] перечислены шесть возможных названий процедур («Visa not required», «Visitor visa», …), но на деле встречаются и «Schengen visa», и «Transit visa may be required», и «Visa is not required for a maximum of 30 days». Значит, `title` — свободный текст.
- **Транзит.** В маршруте с транзитом `SRB → TRANSIT HRV (LAND) → BIH` пришёл `LEVEL_3`, хотя у BIH `NOT_REQUIRED`. Для HRV при этом вернулась процедура «Transit visa may be required» (`EMBASSY_VISA`, `MAY_BE_REQUIRED`, `travelPurposes: [TRANSIT]`) [R: raw2/G_transit_rus_srb_hrv_bih.json]. Похоже, итоговый уровень берётся по самому строгому узлу; это вывод из одного случая.
- **Даты.** Даты в ответах хранятся и отдаются в UTC [FAQ].

### 2.2 `/v3/maps`: корзины `series[]`

У каждой корзины есть `type`, `label`, `title`, `total` и `data[]` вида `{id, type: "LOCATION", name}` [R: raw/31_v3maps.json]. Ниже колонка «Соответствие» — мой вывод по [QS] и по сверке из §3.4:

| `type` | `label` (дословно) | Соответствие `travelOpenness` |
|---|---|---|
| `NO_VISA_REQUIRED` | No visa required | `LEVEL_1` |
| `VISA_ON_ARRIVAL_REQUIRED` | Visa on arrival | `LEVEL_2` |
| `EVISA_OR_ETA_REQUIRED` | eVisa or eTA required | `LEVEL_2` |
| `PAPER_OR_EMBASSY_VISA_REQUIRED` | Paper or embassy visa required | `LEVEL_3` |
| `RESTRICTED_ENTRY` | Entry is restricted | `LEVEL_4` (ни разу не непустая) |
| `UNKNOWN_ENTRY_RESTRICTION` | No entry restriction information | `NO_INFORMATION` (появляется только с `origin`, см. §3.3) |
| `UNKNOWN_VISA_INFO` | No Visa information | `NO_INFORMATION` (ни разу не непустая) |

## 3. Один запрос на паспорт: `POST /v3/maps`

### 3.1 Статус: не документирован

- В `paths` спецификации v3 есть только `/trips` [S-v3]. Схемы `MapRequestAttributes`, `MapRelationships` и `MapError` лежат в `definitions`, но ни одна операция на них не ссылается.
- Ни одна из прочитанных страниц docs.joinsherpa.io не упоминает `/maps`. Проверены все страницы раздела Requirements API, FAQ и страницы embedded elements.
- Шлюз называет эту операцию `ingress CreateMap` в заголовке `x-envoy-decorator-operation` [R: raw/31_v3maps.headers]. Значит, это штатная операция бэкенда, которой, судя по всему, пользуется виджет-карта Sherpa: в бандле Sherpa Elements есть `createElement("map", …)` (`sherpa/webapp/main.js`).
- Вывод: поведение может измениться без предупреждения. Прежде чем строить на нём продукт, стоит спросить Sherpa.

### 3.2 Запрос

- `passportCode` обязателен и задаётся строкой: один паспорт [S-v3 `MapRequestAttributes`].
- Допустимые значения API перечислило в тексте ошибки 400 [R: raw2/H_maps_prk_chn.json]:
  - 199 кодов alpha-3, в том числе `RKS`, `HKG`, `MAC`, `TWN`, `PSE` и `VAT`;
  - те же коды в alpha-2, в том числе `RK` для Косово;
  - отдельно `D` (код Германии по ICAO).
  - `PRK` и большинство зависимых территорий (`ABW`, `PRI`, `GIB`, …) паспортами не поддерживаются.
- Поле `date` запрещено: `400 "data.attributes.property date should not exist"` [R: raw/95_maps_date.json]. Значит, ответ описывает только текущее состояние.
- `locale: "ru-RU"` переводит названия стран («Грузия», «Северная Македония»; «Türkiye» остаётся как есть) [R: raw/32_maps_ru_rus_ruRU.json].

### 3.3 Ответ

- В `series[]` лежат корзины из §2.2.
- Есть `locationDetails[ISO3].visaProcedures[]` с полями `{id, title, description, actions}`. Он заполнен почти только для стран с eVisa/ETA и для части стран с визой по прибытии: у IND это 90 стран из 234 [R: raw2/D_maps_ind.json]. В этих деталях **нет** `more[]`, `lengthOfStay` и дат.
- **Покрытие.** Для RUS пришло 235 кодов, для IND — 234, для ISR — 232.
  - Всегда отсутствуют: страна самого паспорта, `PRK`, `SYR`, `YEM`, `ESH` и необитаемые территории (`ATA`, `BVT`, `HMD`, …).
  - Пропуски, зависящие от паспорта: у ISR нет `IRN`, `BRN` и `PSE`, у IND нет `HND`.
  - Сверх ISO 3166 есть `RKS` и `NX`.
  - Источники: [R: raw2/A03_maps_rus_noorigin_minimal.json, raw2/D_maps_ind.json, raw/80_maps_isr_tur.json].
- **Влияние `origin`.** В спецификации сказано: «If origin is missing, we will not include entry restriction information» [S-v3 `MapRelationships.origin`]. На деле:
  - с `origin` сама страна отправления, а также `KIR`, `AFG`, `MNP` и `BLM` переезжают в `UNKNOWN_ENTRY_RESTRICTION`, всё остальное совпадает [R: raw/31_v3maps.json (origin SRB), raw/34_maps_ru_noorigin.json];
  - `RESTRICTED_ENTRY` оказалась пустой во всех пяти ответах `maps`: RUS трижды, ISR с `origin=TUR` и IND.
- **Размер и время.** RUS: 65,6 КБ за 0,47 с. IND: 80 КБ за 0,56 с. RUS с `ru-RU`: 72 КБ.

### 3.4 Совпадение с `/v3/trips` и стабильность

- **Сверка.** Я сравнил корзину `maps` с `travelOpenness` из `trips` для 26 пар по соответствию из §2.2: 19 пар для RUS и 7 для IND. Совпали 25.
  - RUS: BIH, MNE, HRV, HUN, ALB, MKD, GEO, KAZ, KHM, LAO, RKS [R: raw/*], ARM, AZE, BGR, MDA, ROU, TUR, UKR, CYP [R: raw2/B_rus_srb_*.json].
  - IND: ALB, MNE, MKD, BIH, SRB, GEO, ARM [R: raw2/E_ind_*.json].
- **Расхождение одно: RUS→LAO.**
  - `trips` отвечает `LEVEL_2` «You may need a visa for Laos…». Процедура там «Visa is not required for a maximum of 30 days» с `enforcement: MAY_BE_REQUIRED`, `more[]` пуст, `lastUpdatedAt: 2026-10-23`.
  - `maps` отвечает `PAPER_OR_EMBASSY_VISA_REQUIRED`.
  - Расхождение было в 09:45 и повторилось в 10:02 UTC [R: raw/53_ru_thalao_air.json, raw2/C_rus_tha_LAO.json, raw2/A03_maps_rus_noorigin_minimal.json].
- **KHM расхождением не считается**, хотя ранняя проба так его записала. `maps` даёт визу по прибытии, `trips` — `LEVEL_2` с двумя вариантами (eVisa и виза по прибытии); оба ответа соответствуют L2.
- **`NX` сравнить не с чем.** `trips` с `locationCode: "NX"` молча отвечает про `CYP` (`LEVEL_3`) [R: raw2/B_rus_srb_NX.json], а в `maps` у `NX` своя корзина. См. §8.
- **Стабильность.** Ответ `maps` для RUS без `origin` совпал корзина в корзину в 09:44:59 и в 10:01:25 UTC, через границу часа [R: raw/34_maps_ru_noorigin.json, raw2/A03_maps_rus_noorigin_minimal.json]. Хватит ли этого на дольше, по двум замерам не сказать.

## 4. Уже имеющиеся визы и ВНЖ, исключения

- **Полей для виз нет.** `Traveller` содержит только `passports`, `travelPurposes` (`TOURISM | BUSINESS | TRANSIT | MEDICAL`) и `vaccinations` (COVID-19) [S-v3 `Traveller`]. `MapRequestAttributes` содержит только `passportCode`, `locale` и `covid19VaccinationStatus`.
- **Лишние поля отвергаются.** На `visas`, `residencePermits` и `residency` API ответило `400 "…property visas should not exist|…property residencePermits should not exist|…property residency should not exist"` [R: raw/40_extra_fields.json].
- **Условия применимости процедур структурированы только по паспорту и стране отправления.** В `included[]`/`excluded[]` процедур встретились лишь два вида записей: `{type: PASSPORT}` (4748 штук) и `{type: LOCATION, locationType: ORIGIN}` (4878 штук), подсчёт по всем сохранённым ответам. Виды «виза» или «ВНЖ» не встречаются.
- **Исключения есть только свободным текстом в `more[]`.** Спецификация описывает поле как «Additional details, exemptions» [S-v3 `ProcedureEntityAttributes.more`]. Примеры:
  - **RUS→ALB** (eVisa): «-Holders of a valid multiple-entry visa previously used in one of the Schengen states or valid residence permits for one of the Schengen states; -Holders of valid multiple-entry US or UK visas previously used in the country of issuance…; -Holders of a 10-year resident permit for the United Arab Emirates…» [R: raw/13_ru_srbalb_land.json]
  - **RUS→MKD** (бумажная виза): «-Holders of valid residence permits for an EU Member State or one of the Schengen states. -Holders of a multiple-entry visa for one of the Schengen states valid for at least 5 days beyond the intended stay…; -…United States, United Kingdom, or Canada…» и дальше ограничение в 15 дней на въезд [R: raw/14_ru_srbmkd_land.json]
  - **RUS→MNE**: «-Travelers with a valid visa or with a residence permit of a Schengen state, Ireland, USA or UK» [R: raw/10_ru_srbmne_land.json]
  - **RUS→HRV** (шенгенская виза): «Travelers who hold a valid long-stay visa or residence permit issued by a Schengen member state» [R: raw/11_ru_srbhrv_land.json]
  - **IND→BIH**: «…valid multiple-entry visa or residence permit issued by the United States, Schengen, and EU Member States». Похожие тексты пришли и для IND→SRB, GEO, ARM [R: raw2/E_ind_*.json]
  - **RUS→RKS**: `more[]` пуст, исключений нет [R: raw/72_ru_srbrks_land.json].
- **В `maps` исключений нет вовсе** (см. §3.3).
- **Вывод.** Формулировки локализуются и несут условия: «multiple-entry», «previously used», «valid ≥5 days beyond», лимит дней. Модель «у меня есть шенгенская виза» придётся строить самим: собственной таблицей исключений или разбором `more[]`. Sherpa этого не посчитает.

## 5. Несколько паспортов

- Спецификация прямо говорит: «We only support one passport per traveller at the moment, please only pass the primary passport here. In future, we will add support for travellers with multiple passports…» [S-v3 `Traveller.passports`, `MapRequestAttributes.passportCode`].
- На два паспорта API отвечает `400 "data.attributes.traveller.passports must contain no more than 1 elements"` [R: raw/71_ruil_srbhrv_land.json].
- Значит, N паспортов — это N запросов, а объединять результаты (например, «страна открыта, если открыта хоть по одному паспорту») придётся нашей логикой.

## 6. Влияние страны отправления, режима и даты

- **Страна отправления в `trips`.** В выборке класс от неё не зависел:
  - RUS→GEO из RUS и из TUR: `LEVEL_1` [R: raw/16_ru_rusgeo_land.json, raw/18_ru_turgeo_land.json];
  - RUS→HRV из SRB и из RUS: `LEVEL_3` [R: raw/11_ru_srbhrv_land.json, raw/73_ru_rushrv_land.json].
  - Модель данных всё же допускает зависимость. В `excluded[]` встречаются записи `{type: LOCATION, locationType: ORIGIN}`: например, у процедуры «Schengen visa» для HRV и HUN исключено отправление из IND [R: raw/11_ru_srbhrv_land.json]. В спецификации сказано: «Exclusion criteria … based on location, airport and passport for either origin or destination» [S-v3].
- **Страна отправления в `maps`** только добавляет `UNKNOWN_ENTRY_RESTRICTION` (§3.3). Для карты её лучше не передавать.
- **Режим `LAND`/`AIR`** класса не менял: KHM, LAO и KAZ дали одинаковый результат [R: raw/51…55]. Процедуры несут теги `land`/`air`/`sea`, и [FAQ] поясняет их так: «Tag is present when a restriction/procedure applies to travellers crossing borders by air».
- **Дата в `trips` учитывается.**
  - Для RUS→MNE пришла процедура «Visitor visa» (`EMBASSY_VISA`) с `startDate: 2026-11-01`. На дату 2026-12-10 это `LEVEL_3`. На 2026-10-20 это `NO_INFORMATION`, а сама процедура лежит в группе `UPCOMING` [R: raw/10_ru_srbmne_land.json, raw/94_ru_srbmne_land_oct26.json].
  - Прежний безвизовый режим на прошлую дату не вернулся. Прошлые даты, судя по всему, ненадёжны: историю правил Sherpa не хранит, это вывод из одного случая.
  - У RUS→ALB на 2027-06-15 тот же `LEVEL_2`, что и на 2026-12-10 [R: raw/93_ru_srbalb_land_jun27.json].
  - Семантику дат задаёт спецификация: «If the start date is not present, the procedure is still active…» [S-v3 `startDate`/`endDate`].
- **`maps` даты не принимает**, его ответ описывает «сейчас» (§3.2).

## 7. Запреты въезда

- Формально запреты в модели предусмотрены:
  - категории `NO_ENTRY` и `RESTRICTED_ENTRY` у `RestrictionEntity` [S-v3];
  - `LEVEL_4` с пояснением «nationality restrictions, travel bans» [SHOW];
  - корзина `RESTRICTED_ENTRY` в `maps`.
- На деле в 48 сохранённых ответах с `included` нет ни одного объекта `RESTRICTION`, хотя большая часть запросов шла с `include=restriction`. `LEVEL_4` и `RESTRICTED_ENTRY` тоже не встретились ни разу.
- Как выглядят известные запреты для израильского паспорта:
  - ISR→LBN: обычная «Visitor visa», `EMBASSY_VISA`, `LEVEL_3`; паспорт ISR входит в `included[]` этой процедуры [R: raw/82_il_turlbn_air.json].
  - ISR→IRN: `NO_INFORMATION`, «Visa requirements are currently not known for this trip.» [R: raw/81_il_turirn_land.json].
  - В `maps` для ISR страны `IRN`, `BRN` и `PSE` просто отсутствуют, а `LBN` стоит в корзине бумажной визы [R: raw/80_maps_isr_tur.json].
  - RUS→SYR тоже `NO_INFORMATION` [R: raw/83_ru_tursyr_land.json].
- **Вывод.** Запрет выглядит то как обычная виза, то как «нет данных». Если продукт должен считать такие страны закрытыми, нужен собственный список переопределений.

## 8. Коды стран

- **Формат.** Спецификация: «The location code supports a list of ISO 3166-1 Alpha-2 codes, and ISO 3166-1 Alpha-3 codes, a limited number 3166-2 Subdivision codes for some countries as well as some custom codes» [S-v3 `TravelNodeRequest.locationCode`]. Документация: «At sherpa°, we default to ISO 3166-1 alpha-3» [TRIPS].
- **Alpha-2 работает:** запрос `RS`→`AL` вернулся как `SRB`→`ALB` [R: raw2/F_alpha2_RS_AL.json].
- **Косово.** Работает `RKS` в `trips`, `maps` и в списке паспортов [R: raw/72_ru_srbrks_land.json]. `XKX` и `XK` дают `400 unsupported-location` [R: raw/15_ru_srbxkx_land.json, raw2/F_alpha2_RS_XK.json].
- **Северный Кипр.** В `maps` есть отдельный `NX` с названием «Cyprus»/«Кипр», и его корзина отличается от `CYP`:
  - RUS: `NX` — виза по прибытии, `CYP` — бумажная виза;
  - ISR: `NX` — виза по прибытии, `CYP` — без визы;
  - IND: `NX` — виза по прибытии, `CYP` — бумажная виза.
  - Скорее всего, это Северный Кипр; это мой вывод, в документации `NX` нет. `trips` превращает `NX` в `CYP` [R: raw2/B_rus_srb_NX.json], так что подробностей по нему не получить.
- **Территории.** `maps` перечисляет зависимые территории отдельными кодами: `ABW`, `AIA`, `GLP`, `REU`, `HKG`, `MAC`, `PRI`, `GIB`, `FRO` и другие. Нет кодов `ESH`, `PRK`, `SYR`, `YEM` и необитаемых территорий (§3.3). Для непризнанных образований на постсоветском пространстве кодов нет совсем.
- **Паспорта:** 199 кодов alpha-3 (§3.2).

## 9. Лимиты, задержка, кэширование, условия

Что говорит документация (цитаты):

- «All our API endpoints currently impose a rate limit of 100 requests/second… We have a hard physical limit of 10 MB for response size. We highly recommend at present to chunk data where possible.» [FAQ]
- «Information is collected 24/7 and fresh data is pushed on an hourly basis after passing quality control. It is not recommended to cache the data for longer than an hour.» [FAQ]
- «Testing: 1000 requests per hour for testing; Production: Varies by plan (contact us for details); Headers: Rate limit information included in response headers.» [OVR]
- «The /trips endpoint includes cache-control headers with a value of public, max-age=3600 (1 hour).» Там же в Best Practices: «Follow the 1-hour cache duration… Data is updated hourly, so longer caching may result in outdated information.» [OVR]
- В спецификации описаны ответы `429 Rate limit exceeded` [S-v3 `/trips` responses].

Что видно на деле:

- **Заголовки.** В 66 сохранённых ответах ни `trips`, ни `maps` не прислали `cache-control` и заголовков rate-limit; есть только `etag`. `cache-control: max-age=3600, must-revalidate, public` пришёл лишь на GET `/v2/procedures` [R: raw/*.headers, raw2/*.headers, raw/90_v2proc_rus_5.headers]. Ошибку `429` я не получал: запросов было мало.
- **Задержка.** Замер из облачного контейнера через прокси:
  - `trips`: от 0,35 до 1,10 с, медиана около 0,53 с (20 запросов);
  - `maps`: от 0,47 до 0,56 с;
  - ошибки 400: от 0,17 до 0,41 с.
- **Размер.**
  - `trips` без `include`: 2 КБ;
  - `trips` с `include=procedure`: от 3 до 61 КБ, а с `include=procedure,restriction` для THA→KHM — до 110 КБ;
  - `maps`: от 65 до 80 КБ.
- **Массовая выгрузка через v2.** `GET /v2/procedures` с `filter[nationalities]` и `filter[documentType]` объявлен устаревающим: «This guide uses the v2 Procedures endpoint, which is being deprecated. Avoid using it for new integrations.» [V2DEP]. Там же советуют разбивать запрос по 25–50 стран [FAQ]. Запрос сразу по всем странам упал с `503` примерно через 20 с [R: raw/91_v2proc_rus_all.json].
- **Вебхуки.** В v2 есть `POST /webhooks` (поля `events`, `filters`, `frequency`) [S-v2]. Теоретически ими можно сбрасывать кэш, но я их не проверял, а v2 устаревает.
- **Условия использования.**
  - Доступ к API выдают через форму продаж https://www.joinsherpa.com/contact-business; тарифов в открытом доступе нет.
  - Публичных условий API я не нашёл: адрес `www.joinsherpa.com/api-terms` открывает маркетинговую страницу.
  - Публичные [T&C] написаны для клиентов визового сервиса: «You receive a limited, non-exclusive, non-transferable license to use Sherpa solely for obtaining our services.»
  - Значит, допустимы ли кэш дольше часа и показ классов на нашем сайте, решает партнёрский договор, а его условия неизвестны.

## 10. Ключ

- По документации ключ публичный: «Your sherpa° Requirements API key is a public, client-side key… The key is an identifier, not a secret credential». Он служит для «Entitlement», «Rate limiting» и «Attribution» (учёт для биллинга и аналитики). Защищают его ограничения по домену и origin [KEY], [QSV].
- Ключ, которым шла проверка, привязан к аффилиату `skyteam`: ссылки «Apply» в ответах несут `affiliateId=skyteam` [R: raw2/A03_maps_rus_noorigin_minimal.json, raw2/D_maps_ind.json]. Все запросы с ним засчитываются этому партнёру. Для продакшена нужен свой ключ.

## Что это значит для визовой модели

- **Основной путь.** Один вызов `maps` на паспорт (`passportCode`, `locale: ru-RU`, без `origin`). Кэшировать на сервере по паспорту не дольше часа, как рекомендует документация.
  - В худшем случае это 199 паспортов × 24 обновления = ~4,8 тыс. запросов в сутки. Это далеко от 100 req/s и укладывается в тестовый лимит 1000 req/h, если обновлять раз в час.
  - Риски: эндпоинт не документирован, и одно расхождение с `trips` (LAO) уже есть.
- **Документированная альтернатива** — `trips` на каждую пару (паспорт, страна). Это ~230 вызовов на паспорт или меньше, если запрашивать только страны, достижимые за 12 часов. Взамен приходят тексты исключений из `more[]`.
- **Свои таблицы.** Учёт имеющихся виз и ВНЖ, переопределения запретов и решение, какие уровни считать «закрытыми» (например, L3 без визы на руках), придётся держать у себя: API их не даёт.

## Не проверено и открытые вопросы

- Разрешит ли Sherpa по договору пользоваться `/v3/maps` и держать кэш дольше часа.
- `NX` = Северный Кипр — это мой вывод, не подтверждённый документацией.
- Бывает ли вообще непустым `LEVEL_4` или `RESTRICTED_ENTRY`.
- Как на деле срабатывает лимит частоты: заголовков нет, ошибку 429 я не получал.
- Не проверены: хост песочницы, вебхуки v2, `/v3/trips/llm`, `travelMode: SEA`, `travelPurposes: TRANSIT`. Сверка `maps`↔`trips` сделана только на 26 парах и двух паспортах.
