# Какие страны пускают по визам и ВНЖ Шенгена, США, Великобритании и Канады (тикет #9)

Дата проверки всех строк: **2026-11-07**. Карта: [igorkamyshev/roadtrip#1](https://github.com/igorkamyshev/roadtrip/issues/1).

Вопрос тикета: какие страны пускают путешественника, которому по гражданству нужна виза, если у него есть действующая виза или вид на жительство (ВНЖ) Шенгена, США, Великобритании или Канады. Нужна таблица для ручной поддержки, актуальный состав Шенгена с карликовыми государствами и отдельный список других виз, которые часто открывают страны.

## Коротко

- **Балканы, главный регион для машины.** Без визы пускают ALB, XKX (Sherpa: `RKS`), MKD, MNE, SRB, BIH, а также MDA. Условия у всех разные:
  - XKX — только Шенген, до 15 дней;
  - MKD — до 15 дней за въезд; льгота для виз US/UK/CAN действует только до **31.12.2026**;
  - MNE — до 30 дней. Это новый декрет, он действует с **01.11.2026** и к Шенгену, IRL, USA и GBR добавил визы и ВНЖ AUS, JPN, CAN и NZL. Текст в Sherpa устарел;
  - SRB — до 90 дней, канадские визы не подходят;
  - ALB — виза Шенгена, США или Великобритании должна быть многократной и уже использованной;
  - MDA — только для 30 перечисленных гражданств.
- **Кавказ.** GEO пускает на 90 дней из 180 по визе или ВНЖ примерно 50 стран, включая все четыре наши. ARM пускает только по **ВНЖ** (не по визе) США, ЕС, Шенгена или стран Персидского залива, и только граждан 111 стран, временно до 01.07.2027. TUR не пускает без визы, а даёт **условную eVisa** гражданам примерно 16 стран; есть условие лететь определёнными авиакомпаниями, так что на машине это не подтверждено. Для AZE, KAZ, UZB, KGZ, TJK, TKM и MNG таких исключений не нашёл.
- **Страны, которые на машине проходятся как Шенген.** MCO, SMR и VAT — без пограничного контроля, считать Шенгеном. AND своих виз не требует, но выезд из Шенгена в Андорру и возврат — это два въезда, поэтому нужна многократная виза или ВНЖ. GIB с **15.07.2026** перешёл на шенгенскую визовую политику: британские визы больше не открывают Гибралтар, а шенгенская виза открывает. CYP (остров, на машине не доехать) признаёт шенгенские визы на 2 и больше въезда, визы D и ВНЖ по Decision 565/2014/EU.
- **Великобритания.** IRL пускает с британской краткосрочной визой C граждан 22 стран из списка, если сначала был въезд в Великобританию. Граждан RUS и BLR в списке нет. Граница с Северной Ирландией сухопутная и без контроля.
- **Северная и Центральная Америка, по пути на машине от США до Панамы.**
  - MEX — виза США, CAN, GBR, JPN или Шенгена либо **постоянный** ВНЖ этих стран, до 180 дней;
  - BLZ — многократная виза США или Канады либо шенгенская виза, или ПМЖ этих стран;
  - CRI — для граждан групп 3–4 по новой директиве от 17.11.2025: многократная виза или ВНЖ США или Канады, ВНЖ ЕС, GBR, CHE, NOR или ISL, многократная шенгенская виза C или D. Британская **виза** не подходит;
  - PAN — действующая виза или ВНЖ CAN, USA, AUS, KOR, JPN, GBR, SGP или стран ЕС. С 28.10.2024 больше не требуется, чтобы виза была многократной и использованной;
  - по GTM, HND и SLV есть только вторичные источники.
- **Южная Америка.** Только для отдельных гражданств: COL (CHN, IND, KHM, MMR, THA, TWN, VNM; виза США или Шенгена, действительная больше 180 дней), PER (CHN, IND), ARG (CHN и DOM с визой США).
- **Африка, Ближний Восток, Азия.** Здесь льгота обычно даёт **eVisa или визу по прилёту**, а не безвизовый въезд: MAR (eVisa), EGY и ARE (по прилёту в аэропорту), SAU, QAT, OMN, TWN (электронное разрешение для 7 гражданств Юго-Восточной и Южной Азии), PHL (только граждане Индии). Почти всё это авиаправила. Для машины важен только MAR: паром из Испании, а также Сеута и Мелилья.
- **Расхождения с Sherpa:**
  - MNE — у Sherpa нет AUS, JPN, CAN, NZL, нет предела в 30 дней, и запись от 02.11.2026 старше нового декрета;
  - XKX — у визы посетителя текста исключения нет вообще, он есть только у транзитной визы, и Sherpa не знает код `XKX` (ответ `unsupported-location`), только `RKS`;
  - MKD и ALB совпадают с источниками.

## Как искал

1. Начал с текстов исключений, которые уже отдаёт Sherpa (сохранённые ответы в `scratchpad/sherpa/raw/`: `13_ru_srbalb_land.json`, `14_ru_srbmkd_land.json`, `92_ru_srbmkd_land_ruRU.json`, `10_ru_srbmne_land.json`, `90_v2proc_rus_5.json`). Каждое исключение сверил с первоисточником: МИД, официальным вестником или правительственным порталом.
2. Потом обошёл страны, куда можно доехать на машине из Европы, России, с Кавказа, из Средней Азии и по обеим Америкам. Искал официальные тексты: законы, декреты, страницы МИД и миграционных служб. Если официальная страница недоступна, брал вторичные источники (Fragomen, государственные СМИ, Wikipedia) и в строке это отмечено.
3. **Куда не пустили**:
   - punetejashtme.gov.al: Incapsula. Взял PDF МИД Албании с того же сайта;
   - geoconsul.gov.ge: WAF. Взял текст постановления на matsne.gov.ge;
   - gov.me: обрыв соединения и 503. Взял текст декрета в «Службени лист» на sluzbenilist.me;
   - mvp.gov.ba: ошибка TLS-цепочки через curl и 503 через WebFetch;
   - evisa.gov.tr: JS-приложение, его API отвечает 418. Брал mfa.gov.tr;
   - consulmex.sre.gob.mx: бот-защита Radware. Взял PDF INM на gob.mx;
   - eur-lex.europa.eu: 202-челлендж. Текст Decision 565/2014/EU взял с legislation.gov.uk;
   - migracion.gob.pa: пустой ответ или 404;
   - acces-maroc.ma: JS-приложение;
   - saudiembassy.sa: редирект, не читал.

   Sherpa API не вызывал.

Уверенность: **высокая** — прочитал официальный текст (закон, декрет, страницу МИД или миграционной службы) за 2025–2026 год, или более старый текст, который сам себя называет действующим; **средняя** — официальный, но косвенный или старый текст, либо часть условий только из вторичных источников; **низкая** — только вторичные источники.

## Как читать таблицу

- Колонка «Что открывает» — кто выдал документ и какой это документ:
  - **кто выдал**: `SCH` — любое шенгенское государство, `USA`, `GBR`, `CAN`; прочие страны — их кодами ISO alpha-3 или `EU`;
  - **какой документ**: `виза` — виза (если не сказано иное, краткосрочная C); `ВНЖ` — вид на жительство или резидентская карта, любая если не сказано «ПМЖ» (постоянный).
- «Режим»: `без визы` — въезд без визы страны назначения; `eVisa` или `ETA` — всё равно нужно электронное разрешение, но его дают упрощённо; `по прилёту` — виза по прилёту. Для маршрутизатора `eVisa` и `ETA` — не «без визы», а смена статуса с «бумажной визы» на «eVisa».
- «Для кого»: «все визовые» — исключение действует для всех, кому нужна виза; иначе указан список гражданств.
- «Авто»: можно ли доехать на машине (сухопутная граница или автопаром). Закрытые границы — в соседней заметке `closed-borders.md`.

### Таблица 1. Европа и Балканы

| ISO3 | Страна | Что открывает | Условия | Режим и срок | Для кого | Авто | Источник (проверено 2026-11-07) | Уверенность |
|---|---|---|---|---|---|---|---|---|
| ALB | Албания | `SCH` виза; `SCH` ВНЖ; `USA` виза, `GBR` виза; `USA` ВНЖ, `GBR` ВНЖ; также `ARE` ВНЖ на 10 лет | Виза Шенгена: многократная и **уже использованная** для въезда в Шенген. Визы США и Великобритании: многократные и уже использованные в стране выдачи. ВНЖ: просто действующий. ВНЖ ОАЭ на 10 лет должен действовать ещё не меньше года с даты въезда | без визы. Срок пребывания в тексте МИД не указан; общий безвизовый режим — 90 дней из 180 (не подтверждено) | все визовые; исключений в тексте нет | да (MNE, XKX, MKD, GRC) | [МИД Албании, «Regjimi i vizave për të huajt», PDF 2024-09](https://punetejashtme.gov.al/wp-content/uploads/2024/09/II-NR.3-REGJIMI-I-VIZAVE-PER-TE-HUAJT-INFO-PER-TE-HUAJT.pdf) (основание: VKM nr. 858 от 29.12.2021). Текст в Sherpa совпадает | высокая (условия), средняя (срок) |
| XKX (Sherpa: `RKS`) | Косово | `SCH` виза; `SCH` ВНЖ | Виза многократная и действующая. ВНЖ действующий **биометрический**. Визы и ВНЖ США, Великобритании и Канады **не дают** права въезда | без визы, **до 15 дней** | все визовые (граждан RUS это тоже касается) | да (SRB с оговорками, ALB, MKD, MNE) | [Портал МИД Косово, ambasadat.net/vizat](https://ambasadat.net/vizat/), раздел «Kategoritë e veçanta të liruara nga vizat» | высокая |
| MKD | Северная Македония | `SCH` виза; `SCH` ВНЖ и ВНЖ стран `EU` (временный или постоянный); `USA` виза, `GBR` виза, `CAN` виза | Шенген: виза **C многократная**, действительна **на 5 дней дольше** планируемого пребывания. Визы США, Великобритании, Канады: многократные, вклеены в паспорт, действительны на 5 дней дольше пребывания. **ВНЖ США, Великобритании, Канады не указаны** | без визы, **до 15 дней за въезд**, всего не больше 90 дней из 180. Льгота для виз USA, GBR и CAN — временное решение, действует с **01.01.2026 по 31.12.2026** | все визовые | да | [МИД РСМ, «Visa requirements for entering the RNM»](https://mfa.gov.mk/en-GB/konzularni-uslugi/informacii-za-vlez-vo-rsm) ([версия на македонском](https://mfa.gov.mk/mk-MK/konzularni-uslugi/informacii-za-vlez-vo-rsm)). Текст в Sherpa совпадает | высокая |
| MNE | Черногория | `SCH` виза; виза `AUS`, `JPN`, `CAN`, `NZL`, `IRL`, `USA`, `GBR`; ВНЖ тех же стран и шенгенских государств | Действующая виза любого типа: требования многократности и «использованности» в тексте нет. Действующий ВНЖ | без визы, **до 30 дней**, но не дольше срока действия визы или ВНЖ | все визовые. **С 01.11.2026 визовые и граждане RUS, BLR, TUR, CHN, SAU** | да | [Uredba o viznom režimu, принята 26.10.2026, применяется с 01.11.2026, ст. 5](https://www.sluzbenilist.me/propisi/399550) (Službeni list CG) | высокая |
| SRB | Сербия | `SCH` виза; `GBR` виза; виза любого государства `EU`; `USA` виза; ВНЖ `SCH`, `EU`, `USA` | Нужна только действующая виза или ВНЖ, многократность не требуется. Нельзя въехать по паспорту для экстренного выезда или по проездному документу беженца или апатрида. **Канада не указана**, ВНЖ Великобритании прямо не назван | без визы, до 90 дней в течение 6 месяцев, но не дольше срока действия визы или ВНЖ | все визовые | да | [МИД Сербии, «Visa requirements»](https://mfa.gov.rs/en/citizens/travel-serbia/visa-requirements) (решение правительства от 30.10.2014); [FAQ МИД](https://mfa.rs/en/citizens/frequently-asked-questions) | высокая |
| BIH | Босния и Герцеговина | `SCH` виза, виза `EU`, `USA` виза; ВНЖ тех же стран | Виза **многократная** и действующая; ВНЖ действующий | без визы, 90 дней из 180, **одно непрерывное пребывание не дольше 30 дней** | все визовые | да | Решение Совета министров BiH от сентября 2017 года в пересказе [paragraf.ba, 06.09.2017](https://www.paragraf.ba/dnevne-vijesti/06092017/06092017-vijest1.html); [Служба по делам иностранцев (SPS)](https://sps.gov.ba/en/information-for-foreigners/entry-of-aliens-to-bih/) ссылается на ст. 4 «Odluka o vizama». Сайт МИД недоступен | средняя |
| MDA | Молдова | `SCH` виза, виза `EU`; `GBR`, `USA`, `CAN` виза; ВНЖ тех же стран | ВНЖ или действующая виза, **кроме транзитной** | без визы, «на время их действия» (общий безвизовый режим — 90 дней из 180) | **только 30 гражданств**, помеченных сноской [2] в списке визовых: BHR, BLZ, BOL, KHM, CPV, CHN, CUB, DOM, ECU, FJI, GAB, GUY, HTI, IND, JAM, KWT, MDG, MDV, MNG, NRU, OMN, PNG, QAT, STP, SAU, ZAF, SWZ, THA, COM, TGO. Остальных визовых (AFG, PAK, NGA и других) льгота не касается | да (ROU, UKR) | [МИД Молдовы, «Types of visas / requirements»](https://www.mfa.gov.md/en/content/types-visas-requirements), сноска [2] к списку. Дата обновления на странице не указана, а часть гражданств из списка, возможно, уже безвизовые | средняя |
| CYP | Кипр | `SCH` виза; `SCH` ВНЖ; национальные визы D шенгенских государств | Виза «uniform» C должна быть **на 2 или больше въезда**; подходит и виза с ограниченной территориальной действительностью (LTV) по ст. 25(3) Визового кодекса. Не признаются документы, вклеенные в паспорта стран, с которыми у Кипра нет дипотношений: по шенгенскому справочнику это **TUR и AZE** | без визы, 90 дней из 180 | все визовые, кроме граждан TUR и AZE | нет (остров) | [Decision 565/2014/EU](https://www.legislation.gov.uk/eudn/2014/565/body), ст. 2–3 и 6; применяется к Кипру, пока Совет ЕС не примет его в Шенген полностью ([Еврокомиссия: Кипр пока не в Шенгене](https://home-affairs.ec.europa.eu/policies/schengen/schengen-area_en)) | высокая (право ЕС), средняя (практика Кипра) |
| IRL | Ирландия | `GBR` виза (только краткосрочная C) | Сначала нужно въехать в Великобританию по этой визе. Поездка в Ирландию — в пределах разрешённого Великобританией срока. **Не подходят** британская ETA, визы D и карта BRP | без визы, до 90 дней или до конца британского разрешения, что раньше | **только 22 гражданства**: BIH, XKX, MNE, MKD, SRB, TUR, UKR, UZB, KAZ, BHR, KWT, OMN, QAT, SAU, IND, IDN, CHN, PHL, THA, VNM, COL, PER. **RUS и BLR в списке нет** | да, через Северную Ирландию (граница без контроля) | [Irish Immigration Service, Short-Stay Visa Waiver Programme](https://www.irishimmigration.ie/coming-to-visit-ireland/short-stay-visa-waiver-programme/) | высокая |
| GIB | Гибралтар | `SCH` виза; `SCH` ВНЖ | С **15.07.2026** визовая политика для краткосрочных поездок совпадает с шенгенской: нужна шенгенская краткосрочная виза, выданная любым шенгенским государством; жители шенгенских стран освобождены. **Британские визы и ВНЖ больше не открывают Гибралтар**, британские визы для Гибралтара не выдаются с 08.07.2026 | как Шенген | все визовые | да (ESP, граница без контроля) | [HMGoG, Technical Notice 558/2026](https://www.gibraltar.gov.gi/press-releases/technical-notice-reminder-concerning-visa-arrangements-5582026-12201); [Statement 582/2026](https://www.gibraltar.gov.gi/press-releases/government-statement-on-entry-requirements-and-travel-5822026-12228) | высокая |

### Таблица 2. Кавказ, Турция, Средняя Азия

| ISO3 | Страна | Что открывает | Условия | Режим и срок | Для кого | Авто | Источник (проверено 2026-11-07) | Уверенность |
|---|---|---|---|---|---|---|---|---|
| GEO | Грузия | Виза или ВНЖ любой страны из списка примерно в 50 стран: `USA`, `GBR` (с заморскими территориями BMU, CYM, VGB, FLK, TCA, GIB и коронными владениями JEY, GGY, IMN), `CAN`, все государства ЕС и Шенгена (включая CYP, IRL, BGR, ROU, HRV), `AUS`, `NZL`, `JPN`, `KOR`, `ISR`, а также `ARE`, `BHR`, `QAT`, `KWT`, `OMN`, `SAU` | Виза или ВНЖ действительны **в день въезда**. С 16.05.2025 гражданам 17 стран (AFG, BGD, GHA, ETH, ERI, YEM, CMR, CIV, COD, MAR, NGA, PAK, SOM, SYR, SDN, TZA, UGA) **визы и ВНЖ стран Персидского залива** засчитываются, только если они многократные и действуют ещё не меньше года. Визы и ВНЖ остальных стран списка этим гражданам засчитываются как обычно | без визы, 90 дней из 180 | все визовые | да (ARM, TUR, RUS — через Верхний Ларс) | [Постановление правительства Грузии № 256 от 05.06.2015](https://matsne.gov.ge/en/document/view/2867377) (начальная редакция; сводная редакция на matsne платная); [поправка № 122 от 17.04.2025](https://matsne.gov.ge/ka/document/view/6478000) (касается только виз стран Персидского залива) | высокая |
| ARM | Армения | **Только ВНЖ** (не виза): `USA`, `EU`, `SCH`, `ARE`, `BHR`, `QAT`, `SAU`, `KWT`, `OMN`. **GBR и CAN не входят** | ВНЖ действует ещё не меньше **6 месяцев** с даты въезда. Карта или наклейка в паспорте. Название документа, имя, фамилия, гражданство, дата рождения и срок действия написаны латиницей, даты — по григорианскому календарю | без визы, до 180 дней в году. **Временно: с 01.07.2026 по 01.07.2027** | **только граждане 111 стран** из [списка МИД](https://www.mfa.am/filemanager/consular/visa/2025/2026-06-30-LIST-OF-COUNTRIES-TEMPORARY-VISA-EXEMPTION.pdf), среди них IND, PAK, EGY, IDN, PHL, VNM, MAR, ETH, MEX, COL. Нет, например, AFG, BGD, NGA, SDN, YEM | да (из GEO и IRN; границы с TUR и AZE закрыты) | [МИД Армении, «Visa», раздел Temporary Visa Exemption](https://www.mfa.am/en/visa/) | высокая |
| TUR | Турция | `SCH` виза или ВНЖ, `USA` виза или ВНЖ, `GBR` виза или ВНЖ, `IRL` виза или ВНЖ | «При выполнении определённых условий». По Wikipedia: электронные визы и e-ВНЖ не принимаются, нужны обратный билет, бронь отеля, 50 USD в день и страховка; часть гражданств обязана **лететь** Turkish Airlines или Pegasus. Для EGY МИД прямо требует перелёт TK, AJet, Pegasus, EgyptAir или Air Cairo | **условная eVisa** (не безвизовый въезд), однократная, **30 дней** | **только** AFG, DZA (ограничения по возрасту), BGD, CPV, EGY (возраст 15–45), GNQ, IND, IRQ (возраст 15–50), LBY (возраст 16–45), NPL, PSE, PHL, SEN, LKA, YEM, TWN | на машине **не подтверждено** | [МИД Турции, «Visa information for foreigners»](https://www.mfa.gov.tr/visa-information-for-foreigners.en.mfa?level=1); [Wikipedia, Visa policy of Turkey](https://en.wikipedia.org/wiki/Visa_policy_of_Turkey) (дополнительные условия). Официальный evisa.gov.tr недоступен | средняя |
| AZE, KAZ, UZB, KGZ, TJK, TKM, MNG | — | — | Исключений по визам Шенгена, США, Великобритании или Канады не найдено. Для AZE в любом случае закрыт въезд по суше, см. `closed-borders.md` | — | — | — | поиск без результата; официальные сайты по каждой стране не обходил | низкая (это отсутствие находки, а не доказанное отсутствие) |

### Таблица 3. Ближний Восток и Африка

| ISO3 | Страна | Что открывает | Условия | Режим и срок | Для кого | Авто | Источник (проверено 2026-11-07) | Уверенность |
|---|---|---|---|---|---|---|---|---|
| MAR | Марокко | ВНЖ `EU`, `USA`, `CAN`, `GBR`, `JPN`, `NOR`, `CHE`, `NZL`, `AUS` (у посольства в Индии ещё `ISR`); виза `SCH`, `USA`, `AUS`, `CAN`, `GBR`, `IRL`, `NZL` | ВНЖ действует ещё не меньше **180 дней** на дату подачи заявки. Виза **не электронная**, **многократная**, действует ещё не меньше **90 дней** на дату подачи | **eVisa** (AEVM): однократная, до **30 дней**, действительна 180 дней с выдачи | все визовые | да, автопаромом из ESP (а также через Сеуту и Мелилью) | [МИД Марокко, 2022](https://diplomatie.ma/en/launch-electronic-visa-evisa); [посольство Марокко в Индии](https://in.diplomatie.ma/en/e-visa-0). Портал acces-maroc.ma — JS-приложение, не читал | средняя (тексту 2022 года, позже список гражданств расширяли) |
| EGY | Египет | виза `USA`, `GBR`, `SCH` (поздние источники добавляют JPN, CAN, AUS, NZL) | Виза действующая и **уже использованная**; ВНЖ не подходит | **по прилёту** в аэропортах, 30 дней | по вторичным источникам — большинство визовых (около 180 гражданств) | нет (только аэропорты) | вторичные: [Wikipedia, Visa policy of Egypt](https://en.wikipedia.org/wiki/Visa_policy_of_Egypt) (ссылается на visa2egypt.gov.eg и решение 2020 года) | низкая |
| SAU | Саудовская Аравия | виза `USA`, `GBR`, `SCH` (туристическая или деловая); ПМЖ `USA`, `GBR`, `EU` | Виза использована хотя бы раз, есть штамп въезда в страну выдачи | eVisa или **по прилёту**; eVisa многократная, до 90 дней в году | по вторичным источникам — любое гражданство | да (JOR, ARE, KWT и другие) | [Arab News, 2023](https://www.arabnews.pk/node/2320516); [Fragomen](https://www.fragomen.com/insights/saudi-arabia-e-visa-for-tourism-expanded-to-certain-uk-us-eu-and-schengen-visa-holders-and-permanent-residents.html). Официальный visa.visitsaudi.com не читал | низкая |
| QAT | Катар | виза или ВНЖ `GBR`, `USA`, `CAN`, `AUS`, `NZL`, `SCH` | Документ действующий | **ETA** (Hayya A3), около 30 дней | визовые | да (SAU) | [Fragomen](https://www.fragomen.com/insights/qatar-hayya-platform-expanded-to-process-business-and-tourist-visas.html); [Gulf Times](https://www.gulf-times.com/article/659458/qatar/qatar-unifies-visa-processes-through-new-hayya-platform) | низкая |
| OMN | Оман | виза или ВНЖ `USA`, `CAN`, `AUS`, `GBR`, `SCH` (`JPN` — не подтверждён) | Документ действующий; паспорт действует ещё не меньше 6 месяцев | eVisa без спонсора | только гражданства из списка Royal Oman Police (около 25 стран) | да (ARE, SAU) | [Oman Observer](https://www.omanobserver.om/article/70692/Front%20Stories/non-sponsored-tourist-visa-extended-to-more-nationalities) (государственная газета); официальная проверка — evisa.rop.gov.om | низкая |
| ARE | ОАЭ | виза или грин-карта `USA`; ВНЖ `EU`, `GBR`; с 2025 года ещё виза или ВНЖ `SGP`, `JPN`, `KOR`, `AUS`, `NZL`, `CAN` (по ICP для последних шести — только ВНЖ) | Паспорт действует ещё не меньше 6 месяцев. В 2026 году правила меняются: сообщают, что ВНЖ Великобритании убирают | **по прилёту**, 14 дней с возможным продлением | **только граждане IND** | нет (аэропорты) | [Gulf News](https://gulfnews.com/living-in-uae/visa-immigration/uae-expands-visa-on-arrival-policy-indian-passport-holders-with-us-uk-and-eu-tourist-visas-now-eligible-1.1729515387776); [Business Standard, 07.2026](https://www.business-standard.com/immigration/uae-changes-visa-rules-for-indians-who-can-still-get-visa-on-arrival-126070100476_1.html) | низкая |

### Таблица 4. Америка

| ISO3 | Страна | Что открывает | Условия | Режим и срок | Для кого | Авто | Источник (проверено 2026-11-07) | Уверенность |
|---|---|---|---|---|---|---|---|---|
| MEX | Мексика | виза `USA`, `CAN`, `GBR`, `JPN`, `SCH`; **постоянный** ВНЖ тех же стран и стран Тихоокеанского альянса (`CHL`, `COL`, `PER`) | «Действующая виза», без требования многократности (отдельные консульства пишут о многократной — не подтверждено). Временный ВНЖ **не подходит** | без визы, до 180 дней | все визовые | да (USA, GTM, BLZ) | [INM, «¿Eres extranjero y deseas visitar México?», gob.mx, 2023](https://www.gob.mx/cms/uploads/attachment/file/793747/2023_GUIA_DEL_VIAJERO_No_Visa.pdf). Страницы консульств закрыты бот-защитой | средняя |
| BLZ | Белиз | `USA` многократная виза или ПМЖ (карта); `CAN` многократная виза или ПМЖ (карта); `SCH` виза (любая действующая) или шенгенский ПМЖ (карта) | Документ действующий | без визы; по шенгенской визе — до 90 дней | все визовые | да (MEX, GTM) | [Законы Белиза, Revised Edition 2020, CAP. 156: Immigration (Visa Exemption) (USA) Regulations 2015, (Schengen…) Regulations 2019, (Canadian…) Regulations 2019, Visa Relaxation (Schengen) Order 2016](https://www.agm.gov.bz/uploads/laws/68a7629377086_CAP_156s_Immigration_Act.pdf) | высокая (текст), средняя (нынешняя практика и сборы) |
| GTM | Гватемала | виза `USA`, `CAN`, `MEX`, `SCH` | Виза действующая | без визы | граждане **категории B** («консульская виза»). Граждан категории C льгота переводит только в категорию B | да | вторичные: [livinginguatemala.com](https://livinginguatemala.com/visas-to-guatemala/guatemala-visa-by-nationality/) (Acuerdo IGM-015-2025, ст. 10 и 29); [AGN, 2021](https://agn.gt/reforman-acuerdo-para-facilitar-obtencion-de-visados-guatemaltecos/) | низкая |
| HND | Гондурас | виза `USA`, `CAN`, `SCH` | Виза действует ещё не меньше 6 месяцев (по Fragomen) | без визы | визовые «консульской» категории | да | вторичный: [Fragomen, Honduras](https://www.fragomen.com/insights/summaries/honduras) | низкая |
| SLV | Сальвадор | виза `USA`, `CAN`, `SCH` | Виза действующая | без визы (до 180 дней по Wikipedia) | визовые | да | вторичный: [Wikipedia, Visa policy of El Salvador](https://en.wikipedia.org/wiki/Visa_policy_of_El_Salvador); официальная проверка — rree.gob.sv/visas | низкая |
| CRI | Коста-Рика | (I) виза или ВНЖ `USA`, `CAN`; (II) **ВНЖ** `GBR`, `ISL`, `NOR`, `CHE`, `EU`; (III) виза `SCH` категории C или D | (I) Виза или ВНЖ позволяют **многократный** въезд, любой категории, включая D и C1/D; действуют ещё не меньше 1 дня от даты въезда. **Транзитные визы США C1, C2, C3 не подходят.** (II) ВНЖ позволяет многократный въезд или действует ещё не меньше 90 дней; статус беженца не подходит. (III) Виза C или D **только многократная**, действует ещё не меньше 1 дня; не принимается виза, срок действия которой начинается позже даты въезда. Для всех: **ВНЖ, вклеенный в паспорт, не принимается**; документы должны иметь защиту по стандартам ICAO и быть на испанском или английском. **Британская виза не подходит** | без визы; срок — не дольше срока действия визы или ВНЖ и не больше лимита группы (у группы 4 — 30 дней) | граждане **групп 3 и 4** (консульская и ограниченная виза), например IND, CHN, BLR, AFG, PAK, IRN, KAZ, UZB, CUB. Граждане RUS — в группе 2, им виза не нужна | да (NIC, PAN) | [Directrices Generales de Visas de Ingreso y Permanencia para No Residentes, Alcance N° 148 к La Gaceta N° 216, 17.11.2025, раздел «QUINTO»](https://www.imprentanacional.go.cr/pub/2025/11/17/ALCA148_17_11_2025.pdf) | высокая |
| PAN | Панама | виза или ВНЖ `CAN`, `USA`, `AUS`, `KOR`, `JPN`, `GBR`, `SGP` и государств `EU` (именно ЕС, а не Шенгена: CHE, NOR, ISL, LIE не названы) | С 28.10.2024 нужна только **действующая** виза; прежние требования отменены: многократная, использованная, действует ещё не меньше 6 месяцев. Иметь при себе от 500 USD; паспорт действует ещё не меньше 3 месяцев | без визы; срок в источнике не указан | визовые (те, кому нужна виза Панамы) | да (CRI) | [Посольство Панамы в США](https://www.embassyofpanama.org/visas-1): Decreto Ejecutivo 521 от 06.08.2018 и [DE 196 от 28.10.2024](https://www.migracion.gob.pa/wp-content/uploads/DECRETO-EJECUTIVO-196-DE-28-DE-OCTUBRE-DE-2024-QUE-MODIFICA-EL-ARTICULO-2-DEL-DECRETO-EJECUTIVO-521-DE-06-DE-AGOSTO-DE-2018.pdf) (сам PDF не открылся) | средняя |
| COL | Колумбия | виза `USA` или `SCH`; ПМЖ `USA` или `SCH` | Виза действует ещё **больше 180 дней** на дату въезда | без визы | **только** CHN, IND, KHM, MMR, THA, TWN, VNM (в документе 2024 года ещё NIC). Отдельно: любой иностранец с **ПМЖ** стран Тихоокеанского альянса (CHL, MEX, PER) или Андского сообщества (BOL, ECU, PER) | нет (разрыв Дарьен с PAN); да из ECU и VEN | [Cancillería, список гражданств, май 2026](https://cancilleria.gov.co/sites/default/files/DOCUMENTOS-2026/Visas/Lista-Paises-exigen-visa-mayo-2026.pdf); [Cancillería, «Información de ingreso a Colombia», 2024](https://cancilleria.gov.co/sites/default/files/FOTOS2024/INFORMACI%C3%93N%20DE%20INGRESO%20A%20COLOMBIA%20Y%20VISA%20DE%20CORTES%C3%8DA%20(1).pdf) | высокая |
| PER | Перу | виза `USA`, `CAN`, `GBR`, `AUS`, `SCH`; ПМЖ тех же стран | Виза действует ещё не меньше **6 месяцев** | без визы, до 180 дней в течение 6 месяцев (для CHN) | **только** CHN (DS 069-2016-RE) и IND (DS 006-2017-RE) | да (ECU, BOL, CHL, BRA) | [El Peruano, DS 069-2016-RE](https://busquedas.elperuano.pe/dispositivo/NL/1423003-3); про IND — [Andina](https://andina.pe/ingles/noticia.aspx?id=656746) | высокая (CHN), средняя (IND) |
| ARG | Аргентина | виза `USA` той же категории (туризм или бизнес) | Виза действующая | без визы и без AVE: CHN — до 30 дней, DOM — до 90 дней. Кроме того, по Decreto 892/2016 и Res. 416/2018 отдельные гражданства с визой `USA` или `EU` получают AVE — электронное разрешение | **только** CHN и DOM; AVE — для гражданств из Res. 416/2018 | да | [Resolución 316/2025 JGM](https://www.argentina.gob.ar/normativa/nacional/norma-415345/texto) | высокая |
| DOM | Доминиканская Республика | право въезда в `EU`, `GBR`, `CAN`, `USA`, `BRA`, `CHL`, `ARG`, `COL`, `ECU` (то есть виза или ВНЖ) | Только туризм | без визы | визовые | нет (граница с HTI закрыта) | вторичный: [Diario Libre, 02.12.2025](https://diariolibre.com/economia/turismo/2025/12/02/viajar-a-rd-como-turista-es-facil/3364618) (пересказ распоряжения DGM) | низкая |

### Таблица 5. Азия

| ISO3 | Страна | Что открывает | Условия | Режим и срок | Для кого | Авто | Источник (проверено 2026-11-07) | Уверенность |
|---|---|---|---|---|---|---|---|---|
| TWN | Тайвань | виза или ВНЖ `AUS`, `CAN`, `JPN`, `KOR`, `NZL`, `SCH`, `GBR`, `USA`; также виза или ВНЖ Тайваня за последние 10 лет | Документ действующий **или истёк меньше 10 лет назад**. Нужен обратный билет. Не подходят рабочие визы Тайваня (пометки FL и X) | **TAC** (онлайн-разрешение): действует 90 дней, пребывание 30 дней | **только** KHM, IND, IDN, LAO, MMR, PHL, VNM (у IDN подходит ещё японская регистрация Visa Waiver) | нет | [BOCA (МИД Тайваня), обновлено 2023-01-12](https://www.boca.gov.tw/cp-220-1885-b6ae7-2.html) | высокая (условия), средняя (актуальность списка гражданств) |
| PHL | Филиппины | виза или ВНЖ `AUS`, `JPN`, `CAN`, `SCH`, `SGP`, `GBR`, `USA` (так называемый список AJACSSUK) | Документ действующий | без визы, 30 дней без продления (без такого документа — 14 дней) | **только** IND | нет | [Manila Bulletin, 07.06.2025](https://mb.com.ph/2025/06/07/ph-allows-visa-free-entry-for-indian-tourists) (пересказ уведомления DFA); [посольство Филиппин в Нью-Дели](https://newdelhipe.dfa.gov.ph/index.php/newsroom/announcements/951-ajacssuk) | средняя |

### Проверено частично или не проверено

Не включал в таблицы, потому что не нашёл первоисточника или потому что туда не доехать на машине:

- **Карибы** (ABW, CUW, BES, SXM, BHS, JAM, CYM, TCA, BMU, ATG, LCA и другие). По вторичным источникам у многих есть похожие правила для виз США, Канады, Великобритании и Шенгена.
- **NIC** не проверял.
- **KOR и SGP**: только авиатранзит (KOR — 30 дней при транзите в или из USA, CAN, AUS, NZL; SGP — 96 часов VFTF).
- **CAN**: eTA вместо визы для отдельных гражданств с американской визой, только по воздуху.
- **JOR, BHR, KWT, UKR, CHL, BRA, ECU, BOL, URY, PRY** не проверял.

## Состав Шенгена на 2026-11-07

По [Еврокомиссии](https://home-affairs.ec.europa.eu/policies/schengen/schengen-area_en): **29 государств, из них 25 членов ЕС и 4 не члена ЕС**. Последними вошли Болгария и Румыния. С 31.03.2024 сняли контроль на воздушных и морских границах, с **01.01.2025 вступили полностью**, с сухопутными границами.

- **ЕС (25):** AUT, BEL, BGR, HRV, CZE, DNK, EST, FIN, FRA, DEU, GRC, HUN, ITA, LVA, LTU, LUX, MLT, NLD, POL, PRT, ROU, SVK, SVN, ESP, SWE.
- **Не члены ЕС (4):** ISL, LIE, NOR, CHE.
- **Члены ЕС вне Шенгена:**
  - **CYP** участвует в шенгенском сотрудничестве, но Совет ЕС ещё не снял контроль на его границах; интеграция идёт. До этого Кипр признаёт шенгенские документы по Decision 565/2014/EU (таблица 1);
  - **IRL** не участвует (opt-out) и ведёт свою визовую политику.
- **Территории шенгенских стран, где шенгенские визы не действуют:** заморские территории вне Европы. У Франции это GUF, GLP, MTQ, REU, MYT и другие, у Нидерландов — Карибы. Кроме того, FRO и GRL (Дания) и Шпицберген (Норвегия) живут по своим правилам. В Сеуте и Мелилье на границе с Марокко сохраняются проверки. Это моё уточнение по общему знанию, отдельно в этом тикете не проверял.

**Страны, в которые на деле въезжают через Шенген, и как их считать:**

| ISO3 | Страна | Что на самом деле | Как считать в продукте |
|---|---|---|---|
| MCO | Монако | Въезд только через Францию, пограничного контроля нет. Посольства Монако пишут, что для короткого визита нужна шенгенская виза, действующая для Франции ([посольство Монако в Великобритании](https://embassy-to-uk.gouv.mc/en/Information-and-Services/Visiting-Monaco), по выдаче поиска) | **Как Шенген**: проходимо тогда же, когда проходим Шенген |
| SMR | Сан-Марино | Въезд только через Италию, контроля нет, «San Marino follows Schengen area rules» ([FCDO](https://www.gov.uk/foreign-travel-advice/san-marino/entry-requirements)) | **Как Шенген** |
| VAT | Ватикан | Въезд только через Рим (Италию), своего контроля нет | **Как Шенген** |
| AND | Андорра | Своих виз нет («You do not need a visa to enter Andorra»), но въезд только через Францию или Испанию. Андорра вне Шенгена, поэтому возврат во Францию или Испанию — новый въезд в Шенген ([FCDO](https://www.gov.uk/foreign-travel-advice/andorra/entry-requirements)) | Проходимо, если проходим Шенген **и** виза допускает 2 и больше въезда (или есть ВНЖ). С однократной визой Андорра — тупик: въехать можно, а вернуться в Шенген нельзя. Если в «моих визах» нет признака «многократная», лучше считать Андорру проходимой и показывать предупреждение (решает Owner) |
| GIB | Гибралтар | С 15.07.2026 визовая политика совпадает с шенгенской, контроля на границе с Испанией нет (таблица 1) | **Как Шенген** |

## Другие визы, которые часто открывают страны (не входят в основную таблицу)

Список для будущих пунктов «мои визы». В скобках — где такая виза помогает, по найденному выше.

- **Ирландия** (виза или ВНЖ): MNE, TUR (условная eVisa), MAR (виза), а также GEO и CRI (ВНЖ как ВНЖ страны ЕС), SRB, BIH, MDA (как страна ЕС).
- **Япония**: MNE, MEX (виза и ПМЖ), PAN, GEO, MAR (ВНЖ), TWN, PHL (граждане IND), ARE (граждане IND), EGY (по вторичным источникам).
- **Австралия**: MNE, PAN, PER (граждане CHN и IND), GEO, MAR, TWN, PHL (IND), QAT, OMN, ARE (IND).
- **Новая Зеландия**: MNE, GEO, MAR, TWN, QAT, ARE (IND).
- **Южная Корея**: PAN, GEO, TWN, ARE (IND).
- **Сингапур**: PAN, PHL (IND), ARE (IND).
- **ВНЖ ОАЭ на 10 лет**: ALB (ВНЖ действует ещё не меньше года).
- **Визы и ВНЖ стран Персидского залива** (ARE, BHR, QAT, KWT, OMN, SAU): GEO (для 17 гражданств — многократные и ещё не меньше года), ARM (только ВНЖ), QAT (для жителей стран Персидского залива — отдельная категория Hayya).
- **Израиль**: GEO (виза или ВНЖ), MAR (ВНЖ, по посольству в Индии).
- **ВНЖ стран ЕС вне Шенгена** (CYP, IRL; раньше также BGR и ROU): MKD, SRB, BIH, MDA, ARM, CRI, PAN, MAR.
- **Мексика** (виза): GTM (по вторичному источнику).
- **ПМЖ стран Тихоокеанского альянса** (CHL, COL, MEX, PER): MEX, COL.
- **ПМЖ стран Андского сообщества** (BOL, ECU, PER): COL.
- **Тайвань** (виза или ВНЖ за последние 10 лет): TWN (TAC).
- **Японская регистрация Visa Waiver** (граждане IDN): TWN.
- **Карта APEC Business Travel Card**, если её одобрила Мексика: MEX.
- **Не считаются визой**: британская ETA (не открывает IRL), американская ESTA, канадская eTA, электронные визы (не открывают TUR по Wikipedia; не открывают MAR — там нужна «не электронная» виза).

## Что поменять в Sherpa-логике и в таблице

- **MNE**: текст Sherpa (запись от 2026-11-02) перечисляет Шенген, Ирландию, США и Великобританию. По декрету, действующему с 01.11.2026, добавились AUS, JPN, CAN, NZL и появился предел в 30 дней. Брать нашу таблицу, а не текст Sherpa.
- **XKX**: у визы посетителя для граждан RUS (`72_ru_srbrks_land.json`) поле `more` пустое; текст исключения есть только в транзитной процедуре (`90_v2proc_rus_5.json`, `data[5]`). МИД Косово подтверждает правило: виза Шенгена или биометрический шенгенский ВНЖ, до 15 дней. Код `XKX` Sherpa отвергает (`15_ru_srbxkx_land.json`: `unsupported-location`), работает только `RKS`.
- **MKD и ALB**: тексты Sherpa совпадают с МИД.
- **Сроки, которые нужно проверить заново** (предлагаю отдельную колонку `valid_to` в таблице):
  - MKD: визы USA, GBR и CAN — до **31.12.2026**, проверить в январе 2027;
  - ARM: временная льгота до **01.07.2027**;
  - CYP: правило действует до полного вступления в Шенген;
  - MNE: декрет новый, возможны поправки;
  - TUR: таблица МИД часто меняется;
  - CRI: директива от 17.11.2025.

### Предлагаемые поля таблицы для ручной поддержки

Это инженерное решение, оно не входит в вопрос тикета.

| Поле | Значения | Пример |
|---|---|---|
| `destination` | ISO3 | `MKD` |
| `opener` | `SCH`, `USA`, `GBR`, `CAN` и прочие ISO3 или группы (`EU`, `GCC`) | `USA` |
| `doc` | `visa`, `residence`, `permanent_residence`, `any` | `visa` |
| `visa_entries` | `any`, `multi`, `two_plus` | `multi` |
| `used_before` | `true`/`false` | `false` |
| `min_validity` | дни и точка отсчёта: entry, departure, application | `5d after departure` |
| `max_stay_days` | число и правило | `15 per entry; 90/180` |
| `mode` | `visa_free`, `evisa`, `eta`, `voa` | `visa_free` |
| `nationalities` | `all_visa_required`, список `only:[…]` или `except:[…]` | `all_visa_required` |
| `land` | `true`/`false` | `true` |
| `valid_from`, `valid_to` | даты | `2026-01-01`, `2026-12-31` |
| `source_url`, `checked_at`, `confidence` | | `…`, `2026-11-07`, `high` |

Поля `visa_entries`, `used_before` и `min_validity` в UI «мои визы» сейчас не спрашиваются. Если их не спрашивать, есть два варианта: считать «лучший случай» и показывать предупреждение (например «нужна многократная виза, уже использованная») или «худший случай». Это решает Owner.

## Источники

Все проверены 2026-11-07.

- Сохранённые ответы Sherpa: `scratchpad/sherpa/raw/13_ru_srbalb_land.json`, `14_ru_srbmkd_land.json`, `92_ru_srbmkd_land_ruRU.json`, `10_ru_srbmne_land.json`, `94_ru_srbmne_land_oct26.json`, `72_ru_srbrks_land.json`, `15_ru_srbxkx_land.json`, `90_v2proc_rus_5.json`.
- ALB: https://punetejashtme.gov.al/wp-content/uploads/2024/09/II-NR.3-REGJIMI-I-VIZAVE-PER-TE-HUAJT-INFO-PER-TE-HUAJT.pdf
- XKX: https://ambasadat.net/vizat/ (английская версия https://ambasadat.net/visas/ закрыта JS-челленджем, прочитана через WebFetch)
- MKD: https://mfa.gov.mk/en-GB/konzularni-uslugi/informacii-za-vlez-vo-rsm, https://mfa.gov.mk/mk-MK/konzularni-uslugi/informacii-za-vlez-vo-rsm
- MNE: https://www.sluzbenilist.me/propisi/399550 (Uredba o viznom režimu, 26.10.2026); предыдущие поправки: https://www.sluzbenilist.me/propisi/393788/download, https://www.sluzbenilist.me/registri/389285/download
- SRB: https://mfa.gov.rs/en/citizens/travel-serbia/visa-requirements, https://mfa.rs/en/citizens/frequently-asked-questions
- BIH: https://www.paragraf.ba/dnevne-vijesti/06092017/06092017-vijest1.html, https://sps.gov.ba/en/information-for-foreigners/entry-of-aliens-to-bih/
- MDA: https://www.mfa.gov.md/en/content/types-visas-requirements
- CYP и Шенген: https://www.legislation.gov.uk/eudn/2014/565/body (Decision 565/2014/EU), https://home-affairs.ec.europa.eu/policies/schengen/schengen-area_en
- IRL: https://www.irishimmigration.ie/coming-to-visit-ireland/short-stay-visa-waiver-programme/
- GIB: https://www.gibraltar.gov.gi/press-releases/technical-notice-reminder-concerning-visa-arrangements-5582026-12201, https://www.gibraltar.gov.gi/press-releases/government-statement-on-entry-requirements-and-travel-5822026-12228
- AND, SMR: https://www.gov.uk/foreign-travel-advice/andorra/entry-requirements, https://www.gov.uk/foreign-travel-advice/san-marino/entry-requirements
- MCO: https://embassy-to-uk.gouv.mc/en/Information-and-Services/Visiting-Monaco (по выдаче поиска)
- GEO: https://matsne.gov.ge/en/document/view/2867377, https://matsne.gov.ge/ka/document/view/6478000
- ARM: https://www.mfa.am/en/visa/, https://www.mfa.am/filemanager/consular/visa/2025/2026-06-30-LIST-OF-COUNTRIES-TEMPORARY-VISA-EXEMPTION.pdf
- TUR: https://www.mfa.gov.tr/visa-information-for-foreigners.en.mfa?level=1, https://en.wikipedia.org/wiki/Visa_policy_of_Turkey
- MAR: https://diplomatie.ma/en/launch-electronic-visa-evisa, https://in.diplomatie.ma/en/e-visa-0
- EGY: https://en.wikipedia.org/wiki/Visa_policy_of_Egypt
- SAU: https://www.arabnews.pk/node/2320516, https://www.fragomen.com/insights/saudi-arabia-e-visa-for-tourism-expanded-to-certain-uk-us-eu-and-schengen-visa-holders-and-permanent-residents.html
- QAT: https://www.fragomen.com/insights/qatar-hayya-platform-expanded-to-process-business-and-tourist-visas.html, https://www.gulf-times.com/article/659458/qatar/qatar-unifies-visa-processes-through-new-hayya-platform
- OMN: https://www.omanobserver.om/article/70692/Front%20Stories/non-sponsored-tourist-visa-extended-to-more-nationalities
- ARE: https://gulfnews.com/living-in-uae/visa-immigration/uae-expands-visa-on-arrival-policy-indian-passport-holders-with-us-uk-and-eu-tourist-visas-now-eligible-1.1729515387776, https://www.business-standard.com/immigration/uae-changes-visa-rules-for-indians-who-can-still-get-visa-on-arrival-126070100476_1.html
- MEX: https://www.gob.mx/cms/uploads/attachment/file/793747/2023_GUIA_DEL_VIAJERO_No_Visa.pdf
- BLZ: https://www.agm.gov.bz/uploads/laws/68a7629377086_CAP_156s_Immigration_Act.pdf
- GTM: https://livinginguatemala.com/visas-to-guatemala/guatemala-visa-by-nationality/, https://agn.gt/reforman-acuerdo-para-facilitar-obtencion-de-visados-guatemaltecos/
- HND: https://www.fragomen.com/insights/summaries/honduras
- SLV: https://en.wikipedia.org/wiki/Visa_policy_of_El_Salvador
- CRI: https://www.imprentanacional.go.cr/pub/2025/11/17/ALCA148_17_11_2025.pdf
- PAN: https://www.embassyofpanama.org/visas-1
- COL: https://cancilleria.gov.co/sites/default/files/DOCUMENTOS-2026/Visas/Lista-Paises-exigen-visa-mayo-2026.pdf, https://cancilleria.gov.co/sites/default/files/FOTOS2024/INFORMACI%C3%93N%20DE%20INGRESO%20A%20COLOMBIA%20Y%20VISA%20DE%20CORTES%C3%8DA%20(1).pdf
- PER: https://busquedas.elperuano.pe/dispositivo/NL/1423003-3, https://andina.pe/ingles/noticia.aspx?id=656746
- ARG: https://www.argentina.gob.ar/normativa/nacional/norma-415345/texto
- DOM: https://diariolibre.com/economia/turismo/2025/12/02/viajar-a-rd-como-turista-es-facil/3364618
- TWN: https://www.boca.gov.tw/cp-220-1885-b6ae7-2.html
- PHL: https://mb.com.ph/2025/06/07/ph-allows-visa-free-entry-for-indian-tourists, https://newdelhipe.dfa.gov.ph/index.php/newsroom/announcements/951-ajacssuk
