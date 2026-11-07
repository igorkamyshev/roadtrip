# Закрытые сухопутные границы между странами (тикет #5)

Дата проверки всех строк: **2026-11-07**. Карта: [igorkamyshev/roadtrip#1](https://github.com/igorkamyshev/roadtrip/issues/1).

Вопрос тикета: какие сухопутные границы между парами стран сейчас закрыты для частных машин, полностью или для всех, кроме отдельных категорий людей. Нужен список, который удобно поддерживать вручную. Отдельно: что делать с частично открытыми границами и где на границе нет паспортного контроля (для правила «+1,5 ч за границу»).

## Коротко

- Полностью закрыты для частной машины около 40 пар. Самые важные для русскоязычного путешественника: **все сухопутные границы Азербайджана** (въезд по суше закрыт с 2020 года, режим продлён до 02.01.2027), **ARM–TUR**, **ARM–AZE**, **RUS–UKR**, **BLR–UKR**, **FIN–RUS**, **IND–PAK**, **AFG–PAK**, **THA–KHM**, **KOR–PRK**, **DZA–MAR**, **HTI–DOM**.
- У границ Евросоюза с Россией и Беларусью работают **только отдельные КПП**: POL–BLR (3), LTU–BLR (1–2), LVA–BLR (1), EST–RUS (2 для машин и 1 пешеходный), LVA–RUS (2), LTU–RUS (2), POL–RUS (2). Для них закрыть пару целиком нельзя: нужен белый список КПП.
- Внутри формально открытых пар есть **отдельные закрытые переходы**: въезд в Грузию из России через Абхазию (Псоу) и Южную Осетию (Рокский тоннель) незаконен по грузинскому закону; переходы между Украиной и Приднестровьем закрыты; Нарва–Ивангород только для пешеходов.
- Для **Китая, Мьянмы, Туркменистана, Бутана** граница формально открыта, но на своей машине без заранее оформленного разрешения и сопровождения не въехать. Как их показывать, решает Owner (см. «Вопросы к Owner»).
- **Без паспортного контроля**, кроме внутреннего Шенгена: RUS–BLR (для граждан РФ и РБ), GBR–IRL (Common Travel Area), ESP–GIB (с 15.07.2026), FRA–MCO, ITA–SMR, ITA–VAT. В CA-4 (GTM, SLV, HND, NIC) контроль упрощён, но есть.
- Временный контроль внутри Шенгена сейчас ввели DEU, FRA, AUT, POL, DNK, SWE, NOR (порты) и ITA (с SVN). Это выборочные проверки, не паспортный контроль на каждой машине.
- Отдельно от политики границ: машины с российскими (с 2023 года) и белорусскими (с 2024 года) номерами не пускают в ЕС и Норвегию. Для путешественника по умолчанию, гражданина РФ на своей машине, это закрывает весь ЕС, даже если виза есть.

## Как искал

1. **Систематический обход**: выгрузил через gov.uk Content API советы FCDO (МИД Великобритании) для всех 226 стран и территорий (`https://www.gov.uk/api/content/foreign-travel-advice/<страна>`) на 2026-11-07 и прошёлся по ним поиском предложений о закрытых границах и переходах. FCDO — правительственный источник, который обновляется чаще всего и пишет единообразно. В таблицах указана дата последнего обновления каждой страницы FCDO.
2. **Точечная проверка** каждой пары по первоисточникам: сайты правительств (Финляндия, Латвия, Эстония, Испания, Грузия, Норвегия, Еврокомиссия), государственные информагентства (AZERTAC, Trend), затем крупные СМИ, если первоисточника нет.
3. **Куда не пустили** (HTTP 403 или обрыв через прокси): valtioneuvosto.fi, raja.fi, migri.fi (Финляндия), vsat.lrv.lt (погранслужба Литвы), suspilne.media, english.enabbaladi.net, overpass-api.de и overpass.kumi.systems (поэтому координаты КПП из OSM не выгружены). По ним опирался на выдержки из поиска или на другие источники, и в строках это отмечено.

Уверенность: **высокая** — подтверждено правительственным источником или FCDO за 2026 год; **средняя** — только СМИ или гиды за 2026 год, либо источники расходятся; **низкая** — свежих данных нет.

## Словарь статусов (предложение)

| Статус | Что значит | Как его учитывает маршрутизатор |
|---|---|---|
| `closed` | Переходов для частных машин нет ни для кого (исключения есть только гуманитарные или грузовые) | Все рёбра дорог через эту границу удаляются |
| `closed_except` | Открыто только для отдельных категорий, например для граждан одной из стран | Проезд разрешён, только если гражданство путешественника есть в списке `except` |
| `one_way` | Открыто только в одном направлении | Рёбра оставляются только в направлении `direction` |
| `crossings_only` | Работают только перечисленные КПП | Разрешены только рёбра рядом с КПП из белого списка |
| `pedestrian_only` | Только пешком (бывает и у отдельного КПП) | Для машины граница закрыта |
| `permit_only` | Формально открыто, но иностранной машине нужно заранее оформленное разрешение или сопровождение | По умолчанию считается закрытой; решает Owner |
| `no_crossing` | Действующего дорожного перехода нет вообще | Граница закрыта (заодно защищает от просёлков в OSM) |
| `no_control` | Открыто без паспортного контроля | Время на границе 0 ч |
| пары нет в списке | Обычная открытая граница с контролем | +1,5 ч, или 0 ч внутри Шенгена |

---

## Таблица 1. Закрытые пары: `closed`, `closed_except`, `one_way`, `no_crossing`

Пара записана в алфавитном порядке кодов. «Исключения» — кто всё-таки может пересечь границу (для машины это обычно никто).

### Европа, Кавказ, бывший СССР

| Пара | Статус | С какого времени / подробности | Проверено | Источники | Уверенность |
|---|---|---|---|---|---|
| ARM–AZE | `closed` | Закрыта с 1990-х, включая границу Нахичевани с Арменией. Мирная декларация от 08.08.2025 переходов не открыла. С 27.10.2025 азербайджанские **грузовики** едут через Армению в Турцию транзитом, легковых машин это не касается | 2026-11-07 | [FCDO Armenia](https://www.gov.uk/foreign-travel-advice/armenia) (обн. 2026-03-01): «The border with Azerbaijan remains closed»; [FCDO Azerbaijan](https://www.gov.uk/foreign-travel-advice/azerbaijan) (обн. 2026-10-23); [Daily Sabah, 27.10.2025](https://www.dailysabah.com/business/transportation/armenia-opens-border-to-turkiye-bound-azerbaijani-trucks-amid-thaw) | высокая |
| ARM–TUR | `closed` | Закрыта с 1993 года. КПП Маргара–Алиджан открывали только для гуманитарных колонн: 21–31.03.2025 (в Сирию) и 12–22.06.2026 (в Ливан). Открытие для граждан третьих стран и дипломатов согласовано в июле 2022 года, но так и не сделано: Анкара связывает его с миром между Арменией и Азербайджаном | 2026-11-07 | [FCDO Armenia](https://www.gov.uk/foreign-travel-advice/armenia): «The land border with Turkey is closed»; [Agos, июнь 2026](https://www.agos.com.tr/en/news/armenia-turkey-border-crossing-opened-for-aid-to-lebanon-40828); [JAMnews, 27.01.2026](https://jam-news.net/ru/?p=349282) | высокая |
| AZE–RUS | `one_way` (въезд в AZE закрыт, выезд в RUS открыт) | С марта 2020 года въезд в Азербайджан по суше закрыт для всех: формально по «особому карантинному режиму», последнее продление решением Кабмина — до 06:00 02.01.2027. Грузы ездят. Выехать из Азербайджана в Россию по суше можно (так ответили в консульстве АР). Въезд возможен только по разовым спецразрешениям | 2026-11-07 | [Trend, 17.09.2026](https://trend.az/azerbaijan/4225052.html); [AZERTAC](https://azertag.az/en/xeber/special_quarantine_regime_in_azerbaijan_extended-4417830); [FCDO Azerbaijan](https://www.gov.uk/foreign-travel-advice/azerbaijan): «The land border between Azerbaijan and Russia (Dagestan) is closed»; [Т—Ж, 09.06.2026](https://t-j.ru/russia-azerbaijan-border/) (про выезд) | высокая (въезд), средняя (выезд) |
| AZE–GEO | `closed` | Тот же режим. С 25.05.2026 возобновлён поезд Баку–Тбилиси, но только поезд, не машины | 2026-11-07 | [FCDO Azerbaijan](https://www.gov.uk/foreign-travel-advice/azerbaijan): «The land borders between Iran and Azerbaijan, and Georgia and Azerbaijan are temporarily closed»; [FCDO Georgia](https://www.gov.uk/foreign-travel-advice/georgia) (обн. 2026-09-15) | высокая |
| AZE–IRN | `closed` | Тот же режим. Исключения: эвакуация иностранцев из Ирана через Астару по спецразрешению, гуманитарный въезд россиян в марте 2026 года | 2026-11-07 | [FCDO Azerbaijan](https://www.gov.uk/foreign-travel-advice/azerbaijan); [FCDO Iran](https://www.gov.uk/foreign-travel-advice/iran) (обн. 2026-10-27) | высокая |
| AZE–TUR | `closed` | Граница Нахичевани с Турцией (Садарак–Дилуджу). FCDO пишет «Other border crossings to Azerbaijan remain closed», отдельно про Нахичевань не говорит | 2026-11-07 | [FCDO Azerbaijan](https://www.gov.uk/foreign-travel-advice/azerbaijan) | средняя |
| BLR–UKR | `closed` | Пункты пропуска закрыты решением правительства Украины с конца февраля 2022 года | 2026-11-07 | [FCDO Ukraine](https://www.gov.uk/foreign-travel-advice/ukraine) (обн. 2026-10-02): «Ukraine's border with Belarus is currently closed»; [FCDO Belarus](https://www.gov.uk/foreign-travel-advice/belarus) (обн. 2026-09-10) | высокая |
| FIN–RUS | `closed` | Все 8 автомобильных КПП закрыты с 15.12.2023. Решение правительства от 04.06.2026 продлило закрытие «до дальнейшего уведомления» | 2026-11-07 | [Valtioneuvosto, 04.06.2026](https://valtioneuvosto.fi/en/-/1410869/finland-s-eastern-border-to-remain-closed-until-further-notice-2) (сайт отдал 403, текст по выдержке из поиска); [FCDO Finland](https://www.gov.uk/foreign-travel-advice/finland) (обн. 2026-08-11): «All border crossing points on the land border between Finland and Russia will remain closed until further notice» | высокая |
| RUS–UKR | `closed` (`closed_except`: граждане UKR, пешком) | Закрыта с февраля 2022 года. По данным ДПСУ, через КПП Колотиловка–Покровка граждане Украины могут вернуться пешком по гуманитарному коридору. Действует ли он сейчас, не проверено | 2026-11-07 | [FCDO Ukraine](https://www.gov.uk/foreign-travel-advice/ukraine): «Ukraine's border with Russia is currently closed»; про коридор — [Suspilne](https://suspilne.media/592841-ukrainci-mozut-povernutisa-z-rf-abo-bilorusi-cerez-kpp-pokrovka-u-sumskij-oblasti-dpsu/) (403, по выдержке из поиска) | высокая (закрытие), низкая (коридор) |

### Ближний Восток

| Пара | Статус | С какого времени / подробности | Проверено | Источники | Уверенность |
|---|---|---|---|---|---|
| ISR–LBN | `closed` | Гражданских КПП нет. На границе идут военные действия | 2026-11-07 | [FCDO Israel](https://www.gov.uk/foreign-travel-advice/israel) (обн. 2026-10-27): «Military activity continues on the Israel-Lebanon border» | высокая |
| ISR–SYR | `closed` | Гражданских переходов на Голанах нет | 2026-11-07 | [FCDO Israel](https://www.gov.uk/foreign-travel-advice/israel): «Do not attempt to enter the occupied Golan Heights through Syria» | высокая |
| ISR–PSE (Газа) | `closed` | Эрез закрыт с октября 2023 года | 2026-11-07 | [FCDO Palestine](https://www.gov.uk/foreign-travel-advice/palestine) (обн. 2026-10-27): «The Erez border has been closed since October 2023» | высокая |
| EGY–PSE (Газа) | `closed` | Рафах закрыт для гражданских и обычного движения с 06.05.2024. Если открывается, то нерегулярно | 2026-11-07 | [FCDO Egypt](https://www.gov.uk/foreign-travel-advice/egypt) (обн. 2026-10-27): «The Rafah border crossing is currently closed»; [FCDO Palestine](https://www.gov.uk/foreign-travel-advice/palestine) | высокая |
| SYR–TUR | `closed_except` (только граждане SYR) | После 2024 года переходы открыты для сирийцев, в том числе возвращающихся беженцев. Не-сирийцев по суше из Турции не пускают (уведомление консульства Сирии в Стамбуле, май 2026 года) | 2026-11-07 | [Saiga Tours, 04.03.2026](https://www.saigatours.com/article/a-guide-to-Syrian-land-border-crossings): «Foreigners cannot cross by land»; [Enab Baladi, май 2026](https://english.enabbaladi.net/archives/2026/05/syria-visit-rules-from-turkey-issued/) (403, по выдержке) | средняя |

### Южная, Центральная и Восточная Азия

| Пара | Статус | С какого времени / подробности | Проверено | Источники | Уверенность |
|---|---|---|---|---|---|
| AFG–PAK | `closed` (исключение: возвращение и депортация афганцев) | Торхам, Чаман и другие КПП закрыты для торговли и обычного движения с 12.10.2025. Их ненадолго приоткрывали только для репатриации, весной 2026 года снова были столкновения. По июньскому отчёту 2026 года МИД Пакистана держит переходы закрытыми, пока талибы не дадут письменных гарантий. Как обстоят дела после августа 2026 года, не нашёл | 2026-11-07 | [KabulNow, июнь 2026](https://kabulnow.com/2026/06/pakistan-suffers-1-4-billion-loss-from-afghanistan-border-closures-and-middle-east-crisis/); [Dawn](https://www.dawn.com/news/1949335); [FCDO Pakistan](https://www.gov.uk/foreign-travel-advice/pakistan) (обн. 2026-10-27); [FCDO Afghanistan](https://www.gov.uk/foreign-travel-advice/afghanistan) (обн. 2026-07-30) | средняя |
| AFG–CHN | `no_crossing` | Дорожного перехода через Вахджир нет | 2026-11-07 | — (общеизвестно; OSM дороги через перевал не показывает) | высокая |
| BGD–MMR | `closed` | Дорожного пассажирского перехода нет. Мьянманскую сторону контролирует Армия Аракана. Торговля через Текнаф по воде возобновилась частично с 01.05.2026 | 2026-11-07 | [TBS News](https://www.tbsnews.net/bangladesh/myanmar-conflict-brings-teknaf-land-port-standstill-1058236); [FCDO Bangladesh](https://www.gov.uk/foreign-travel-advice/bangladesh) (обн. 2026-10-22) | средняя |
| BTN–CHN | `no_crossing` | Переходов нет, дипотношений нет | 2026-11-07 | — (общеизвестно) | высокая |
| CHN–IND | `closed` (для частных машин и туристов) | С 01.08.2026 после шестилетнего перерыва снова идёт **приграничная торговля** через Натху-Ла, Липулекх и Шипки-Ла. Кроме неё через границу пускают только организованное индийское паломничество Кайлаш-Мансаровар. Туристического автомобильного перехода нет | 2026-11-07 | [The Tribune](https://www.tribuneindia.com/news/india/india-china-resume-nathu-la-border-trade-after-six-year-hiatus); [ISAS NUS, авг. 2026](https://www.isas.nus.edu.sg/papers/reopening-china-india-border-trade-new-delhis-conundrum-on-the-border/) | средняя |
| CHN–PRK | `closed` (для частных машин) | КНДР закрыта для обычного въезда с 2020 года. С марта 2026 года ходит поезд Пекин–Пхеньян, туризм из КНР понемногу пробуют возобновить, но частные машины не пускают | 2026-11-07 | [FCDO North Korea](https://www.gov.uk/foreign-travel-advice/north-korea) (обн. 2025-12-10): «North Korea's borders have been closed to general entry since … 2020»; [Daily NK](https://www.dailynk.com/english/north-korea-china-travel-resumes-tourists-barred/) | высокая |
| IND–PAK | `closed` | ICP Аттари–Вагах закрыт для пассажиров и грузов с конца апреля 2025 года. Работает только как место церемонии спуска флагов. Коридор Картарпур тоже закрыт. На машине здесь и раньше можно было проехать только по спецразрешению | 2026-11-07 | [FCDO India](https://www.gov.uk/foreign-travel-advice/india) (обн. 2026-10-07): «The Wagah-Attari border crossing is closed for tourist transit»; [FCDO Pakistan](https://www.gov.uk/foreign-travel-advice/pakistan): «the only official land crossing … currently closed»; CBIC Instruction No. 08/2025-Customs ([пересказ](https://taxguru.in/?p=961886)) | высокая |
| KHM–THA | `closed` | Таиланд закрыл все КПП 23.06.2025. На 01.11.2026 граница закрыта, сроков открытия нет. Исключения: медицинские, гуманитарные, репатриация | 2026-11-07 | [FCDO Thailand](https://www.gov.uk/foreign-travel-advice/thailand) (обн. 2026-10-12): «Land borders and crossings between Thailand and Cambodia remain suspended»; [Bangkok Post](https://www.bangkokpost.com/thailand/general/3346169/border-with-cambodia-to-remain-shut-amid-concerns); [Khmer Times](https://www.khmertimeskh.com/501905085/anutin-says-no-reopening-of-border-with-cambodia-despite-economic-strain/) | высокая |
| KOR–PRK | `closed` | Демилитаризованная зона | 2026-11-07 | [FCDO North Korea](https://www.gov.uk/foreign-travel-advice/north-korea) | высокая |
| PRK–RUS | `closed` (для частных машин) | 07.09.2026 открыли первый автомобильный мост Хасан–Туманган. О пропуске частных машин данных нет, а КНДР закрыта для обычного въезда | 2026-11-07 | [AP via ABC News, 08.09.2026](https://abcnews.com/International/wireStory/russia-north-korea-open-road-link-shared-border-136254045); [FCDO North Korea](https://www.gov.uk/foreign-travel-advice/north-korea) | средняя |

### Африка

| Пара | Статус | С какого времени / подробности | Проверено | Источники | Уверенность |
|---|---|---|---|---|---|
| BDI–RWA | `closed` | Бурунди закрыла границу 11.01.2024 | 2026-11-07 | [FCDO Burundi](https://www.gov.uk/foreign-travel-advice/burundi) (обн. 2026-05-21); [FCDO Rwanda](https://www.gov.uk/foreign-travel-advice/rwanda) (обн. 2026-09-04) | высокая |
| BEN–NER | `closed` (закрыто со стороны Нигера) | Нигер закрыл границу 30.07.2023 после переворота. Бенин свою сторону открыл, но проехать всё равно нельзя. В июне 2026 года создали комитеты экспертов, на конец июля 2026 года граница закрыта, Нигер выдвигает условия | 2026-11-07 | [ISS Africa, 2026](https://issafrica.org/fr/iss-today/la-cooperation-securitaire-ouest-africaine-peut-elle-se-reconstruire-a-partir-des-frontieres); [allAfrica, 28.07.2026](https://fr.allafrica.com/stories/202607280426.html) | средняя (после августа нет данных) |
| DJI–ERI | `closed` | Действующего перехода нет, спорный участок Рас-Думейра. FCDO советует не ездить к границе вовсе | 2026-11-07 | [FCDO Djibouti](https://www.gov.uk/foreign-travel-advice/djibouti) (обн. 2026-07-27) | средняя |
| DZA–MAR | `closed` | Сухопутная граница закрыта с 1994 года | 2026-11-07 | [FCDO Algeria](https://www.gov.uk/foreign-travel-advice/algeria) (обн. 2026-09-25): «The land border between Algeria and Morocco is closed»; [FCDO Morocco](https://www.gov.uk/foreign-travel-advice/morocco) (обн. 2026-08-19) | высокая |
| ERI–ETH | `closed` | Эритрея закрыла все переходы в 2019 году. В июне 2025 года жители Тыграя неофициально пересекали границу у Заламбессы. В октябре 2026 года Эритрея разорвала дипотношения с Эфиопией, есть сообщения о её войсках в Тыграе | 2026-11-07 | [FCDO Eritrea](https://www.gov.uk/foreign-travel-advice/eritrea) (обн. 2026-10-12); [AP, 08.10.2026](https://abcnews.com/International/wireStory/eritrean-soldiers-entered-northern-ethiopian-towns-government-allied-137086855) | средняя |
| ERI–SDN | `closed` | — | 2026-11-07 | [FCDO Sudan](https://www.gov.uk/foreign-travel-advice/sudan) (обн. 2026-05-11): «Sudan's borders with Chad and Eritrea are currently closed» | высокая |
| KEN–SOM | `closed` | Закрыта с 2011 года. В 2026 году объявляли поэтапное открытие (Мандера, Либой, Киунга), сначала для торговли катом, но открытия для путешественников не нашёл | 2026-11-07 | [FCDO Somalia](https://www.gov.uk/foreign-travel-advice/somalia) (обн. 2026-06-04): «The land border with Kenya is currently closed»; [The Star, 03.05.2026](https://www.the-star.co.ke/news/2026-05-03-duale-kenya-somali-border-to-re-open-soon) | средняя |
| SDN–TCD | `closed` (гуманитарные исключения, например Адре) | Чад закрыл границу 23.02.2026 «до дальнейшего уведомления» | 2026-11-07 | [FCDO Chad](https://www.gov.uk/foreign-travel-advice/chad) (обн. 2026-11-04): «The Chad-Sudan border is closed to travellers»; [Asharq Al-Awsat](https://aawsat.com/node/5243804) | высокая |

### Америка

| Пара | Статус | С какого времени / подробности | Проверено | Источники | Уверенность |
|---|---|---|---|---|---|
| COL–PAN | `no_crossing` | Дарьенский пробел: дороги нет | 2026-11-07 | — (общеизвестно) | высокая |
| DOM–HTI | `closed` | Сухопутная и морская границы закрыты для путешественников | 2026-11-07 | [FCDO Dominican Republic](https://www.gov.uk/foreign-travel-advice/dominican-republic) (обн. 2026-08-07): «Land and sea borders between the Dominican Republic and Haiti are closed»; [FCDO Haiti](https://www.gov.uk/foreign-travel-advice/haiti) (обн. 2025-12-10) | высокая |
| GUY–VEN | `no_crossing` | Официального сухопутного перехода нет; Венесуэла оспаривает Эссекибо | 2026-11-07 | [FCDO Venezuela](https://www.gov.uk/foreign-travel-advice/venezuela) (обн. 2026-10-14): «There is no official land border crossing between Venezuela and Guyana» | высокая |

---

## Таблица 2. Пары, где работают только отдельные КПП (`crossings_only`)

У таких пар в OSM по-прежнему есть дороги через закрытые КПП (например, E18 Ваалимаа–Торфяновка), поэтому нужен белый список. Названия КПП даны с обеих сторон. Координаты КПП не выгружены: Overpass был недоступен (см. «Как искал»), их нужно заполнить из OSM (`barrier=border_control`) при реализации.

| Пара | Открытые КПП (для легковых) | Закрытые / нюансы | Проверено | Источники | Уверенность |
|---|---|---|---|---|---|
| BLR–LTU | Мядининкай–Каменный Лог; Шальчининкай–Бенякони (под вопросом) | 29.10–19.11.2025 закрывали обе. Правительство Литвы 19–20.11.2025 открыло обе, «только на машине». FCDO в августе 2026 года пишет, что открыт **только** Мядининкай. Лаворишкес и Райгардас закрыты с 2024 года; Шумскас и Тверечюс, по памяти, — с 2023 года (не перепроверено) | 2026-11-07 | [VRM Lithuania](https://vrm.lrv.lt/en/news/government-decides-to-reopen-salcininkai-and-medininkai-border-checkpoints-with-belarus-ODM1/); [Euronews, 19.11.2025](https://www.euronews.com/2025/11/19/lithuania-reopens-border-crossings-with-belarus-after-tensions-over-smuggling-balloons); [FCDO Lithuania](https://www.gov.uk/foreign-travel-advice/lithuania) (обн. 2026-08-11): «Only one border crossing point … remains open: Medininkai-Kamenny Log»; [Meduza, 22.02.2024](https://meduza.io/en/news/2024/02/22/lithuania-to-close-two-more-border-checkpoints-with-belarus-limit-disembarkation-from-transit-trains) | высокая (Мядининкай), средняя (Шальчининкай) |
| BLR–LVA | Патерниеки–Григоровщина | С 19.03.2025 только для автомобилей (без пешеходов и велосипедистов). С 15.10.2025 обязательна электронная очередь. 31.07–04.08.2026 КПП закрывали из-за сбоя ИТ, и 05.08 правительство отказалось приостанавливать его работу. Силене закрыт с 2023 года | 2026-11-07 | [IEM Latvia](https://www.iem.gov.lv/en/article/19-march-traffic-border-crossing-points-paternieki-terehova-and-grebneva-will-be-restricted); [LV portāls, 04.08.2026](https://lvportals.lv/dienaskartiba/392883-noversti-tehniskie-traucejumi-paternieku-robezkontroles-punkta-informacijas-sistemu-darbiba-2026); [Baltic Times](https://www.baltictimes.com/paternieki_border_checkpoint_will_not_be_closed__nato_forces_to_be_deployed_near_border_for_military_exercise/); [FCDO Latvia](https://www.gov.uk/foreign-travel-advice/latvia) (обн. 2026-08-11): «The Silene-Urbani road border crossing is currently closed» | высокая |
| BLR–POL | Тересполь–Брест; Кузница–Брузги (только легковые, открыт 17.11.2025); Бобровники–Берестовица (легковые, автобусы и грузовики с номерами ЕС, ЕЭЗ или Швейцарии; открыт 17.11.2025) | Остальные КПП закрыты. 12–24.09.2025 Польша закрывала всю границу на время учений «Запад» | 2026-11-07 | [Polskie Radio, 11.2025](https://www.polskieradio.pl/395/7785/Artykul/3608375,poland-reopens-two-key-border-crossings-with-belarus); [Reform.news](https://reform.news/en/nearly-one-million-people-used-kuznica-and-bobrowniki-border-crossings-in-nine-months-since-reopening) (около 1 млн человек за 9 месяцев, то есть на ~авг. 2026 года КПП работают); [FCDO Poland](https://www.gov.uk/foreign-travel-advice/poland) (обн. 2026-08-11): «The border is open but certain border checkpoints are closed» | высокая |
| EST–RUS | Койдула–Куничина Гора; Лухамаа–Шумилкино (машины и пешеходы); Нарва-1–Ивангород — **только пешком** | Машины через Ивангород не пускают с 01.02.2024: Россия закрыла КПП на реконструкцию, и Эстония обещает не открывать его для машин до конца войны. С 01.09.2026 все КПП работают постоянно **с 07:00 до 19:00**, ночью закрыты | 2026-11-07 | [EMTA, 13.08.2026](https://www.emta.ee/uudised/eesti-vene-piiripunktide-oine-sulgemine-muudeti-tahtajatuks); [FCDO Russia](https://www.gov.uk/foreign-travel-advice/russia) (обн. 2026-09-18): «the Narva-Ivangorod crossing is closed to vehicles but open to pedestrians»; [Moscow Times, 19.09.2025](https://www.themoscowtimes.com/2025/09/19/narva-border-crossing-will-stay-shut-to-vehicles-until-ukraine-war-ends-estonia-says-a90571) | высокая |
| LTU–RUS (Калининград) | Кибартай–Чернышевское; Панемуне–Советск | Нида–Морское (Куршская коса) для международного движения закрыт. Статус Рамонишкяй–Пограничный не нашёл | 2026-11-07 | [LRT, 08.10.2025](https://www.lrt.lt/en/news-in-english/19/2704586/despite-tensions-people-commute-between-russian-kaliningrad-and-lithuania) («one of two operating border checkpoints»); [Russiable](https://russiable.com/border-kaliningrad-russia/) (гид) | средняя |
| LVA–RUS | Терехова–Бурачки; Гребнева–Убылинка | С 19.03.2025 только для автомобилей. С 15.10.2025 обязательна электронная очередь. Вьентули–Лудонка закрыт с 16.10.2023 | 2026-11-07 | [IEM Latvia](https://www.iem.gov.lv/en/article/19-march-traffic-border-crossing-points-paternieki-terehova-and-grebneva-will-be-restricted); [VID Latvia](https://www.vid.gov.lv/en/article/operations-vientuli-border-crossing-point-latvian-border-russia-suspended-16-october) | высокая (на 2025 год), средняя (на ноябрь 2026 года) |
| POL–RUS (Калининград) | Гжехотки–Мамоново II; Безледы–Багратионовск | Статус Голдапа–Гусева не подтверждён, скорее всего закрыт | 2026-11-07 | [Russiable](https://russiable.com/border-kaliningrad-russia/) (гид, данные за сентябрь–октябрь 2026 года); [Notes from Poland](https://notesfrompoland.com/2024/01/02/record-number-of-crossings-at-polands-border-with-russia-angering-local-poles/) | средняя |
| ISR–JOR | Алленби / мост Короля Хусейна; Иордан / Шейх-Хусейн; Ицхак Рабин / Вади-Араба (для пассажиров) | Проезд на частной машине **не подтверждён**: исторически, видимо, только через Шейх-Хусейн. Переходы закрываются без предупреждения. Алленби FCDO не считает международным переходом | 2026-11-07 | [FCDO Israel](https://www.gov.uk/foreign-travel-advice/israel); [FCDO Jordan](https://www.gov.uk/foreign-travel-advice/jordan) (обн. 2026-10-27) | низкая (для машин) |
| EGY–ISR | Таба (круглосуточно) | Машины проезжают с египетскими формальностями: номера, сбор. Дальше Синая на израильской машине не уехать | 2026-11-07 | [FCDO Israel](https://www.gov.uk/foreign-travel-advice/israel): «Taba: Open 24 hours»; [Middle East Eye, 2026](https://www.middleeasteye.net/news/egypt-alarmed-israeli-influx-sinai-amid-double-standards-accusations) | средняя |
| JOR–PSE | Алленби / мост Короля Хусейна | Только пассажиры: автобусы и такси. Частных машин нет | 2026-11-07 | [FCDO Jordan](https://www.gov.uk/foreign-travel-advice/jordan) | средняя |
| KGZ–TJK | Кызыл-Бел–Гулистон (для всех); Кайрагач–Мадания (Madaniyat; **только** граждане KGZ и TJK); по таджикским данным всего 5 действующих КПП | Граница была закрыта с 2021–2022 годов до договора от 13.03.2025 | 2026-11-07 | [24.kg](https://24.kg/english/322686_Operation_of_checkpoints_on_Kyrgyzstan-Tajikistan_border_resumed); [Asia-Plus, 13.03.2025](https://asiaplus.news/en/2025/03/13/reopening-of-border-crossing-points-along-the-tajikistan-kyrgyzstan-border/) | средняя |
| SAU–YEM | Аль-Вадиа | Единственный официальный переход. Пускают ли иностранцев, не подтверждено; Йемен в любом случае закрыт визовыми правилами | 2026-11-07 | [Saiga Tours](https://www.saigatours.com/article/A-guide-to-Yemens-land-border-crossings); [Arab News](https://www.arabnews.pk/node/2628279) | низкая |
| CHN–PAK | Хунджераб | Единственный переход, открыт для иностранцев. С 2025 года заявлен как круглогодичный, но зимой его могут закрывать. На стороне КНР действуют правила `permit_only` (см. табл. 4) | 2026-11-07 | [FCDO Pakistan](https://www.gov.uk/foreign-travel-advice/pakistan): «The Khunjerab Pass, the only official land border crossing between Pakistan and China … is open to foreign tourists»; [Dawn](https://www.dawn.com/news/1906063) | высокая |
| MNG–* (CHN, RUS) | Только отдельные КПП для иностранцев | Многие КПП двусторонние, для граждан двух стран. О въезде на своей машине нужно заранее сообщить налоговой и пограничникам | 2026-11-07 | [FCDO Mongolia](https://www.gov.uk/foreign-travel-advice/mongolia) (обн. 2026-08-07): «Only a few specified land border crossings are open to foreigners» | высокая |
| NOR–RUS | Стурскуг–Борисоглебский | Это единственный переход, он открыт. Машины с российскими номерами Норвегия не пускает (см. «Ограничения по номерам») | 2026-11-07 | [Regjeringen](https://www.regjeringen.no/en/aktuelt/norway-is-tightening-its-restrictive-measures-against-russia/id2996416); [Russiable, 2026](https://russiable.com/norway-russia-border-crossing/) | высокая |

## Таблица 3. Закрытые переходы внутри открытых пар (уровень КПП)

Пара в целом открыта, но через эти КПП ехать нельзя. Их нужно задавать на уровне перехода, иначе маршрутизатор поедет через них.

| Пара (ISO) | КПП / участок | Статус | Подробности | Проверено | Источники | Уверенность |
|---|---|---|---|---|---|---|
| GEO–RUS | Псоу (Россия–Абхазия) | `closed` | По Закону Грузии об оккупированных территориях иностранцы въезжают в Абхазию только со стороны Зугдиди. Въезд из России — уголовно наказуемый незаконный въезд. Верхний Ларс открыт | 2026-11-07 | [FCDO Georgia](https://www.gov.uk/foreign-travel-advice/georgia): «It is illegal under Georgian law to enter Georgia from Russia through South Ossetia or Abkhazia»; [Закон, matsne.gov.ge](https://matsne.gov.ge/en/document/download/19132/6/en/pdf) | высокая |
| GEO–RUS | Рокский тоннель (Россия–Южная Осетия) | `closed` | Та же норма, въезд разрешён только со стороны Гори | 2026-11-07 | там же | высокая |
| GEO (внутр.) | Ингурский мост (Абхазия – остальная Грузия) | `pedestrian_only` | На машине линию не пересечь, только пешком. КПП часто закрывает де-факто власть Абхазии | 2026-11-07 | [Occupied.eastwatch](https://occupied.eastwatch.eu/abkhazia/checkpoint-regime-abkhazia/); [SMR Georgia, 2021](https://smr.gov.ge/en/news/read/2080/) | средняя |
| GEO (внутр.) | Ахалгори / Эргнети (Южная Осетия – остальная Грузия) | `closed` | Де-факто власть закрыла переходы в 2019 году | 2026-11-07 | — (данных за 2026 год не нашёл) | низкая |
| MDA–UKR | Все переходы на приднестровском участке (Кучурган–Первомайск и др.) | `closed` | Украина закрыла их 28.02.2022. С 01.01.2026 Украина и Молдова ведут совместный контроль, в 2026 году участок минировали. Остальные переходы MDA–UKR открыты | 2026-11-07 | [FCDO Moldova](https://www.gov.uk/foreign-travel-advice/moldova) (обн. 2026-11-04): «All border crossings between Ukraine and Transnistria are temporarily closed»; [Riddle](https://ridl.io/status-quo-under-pressure-transnistria-after-2022/) | высокая |
| EST–RUS | Нарва-1–Ивангород | `pedestrian_only` | см. табл. 2 | 2026-11-07 | см. табл. 2 | высокая |
| SRB–XKX | Все переходы | `one_way` (условно) | Сербия не считает переходы с Косово международными. Из Косово в Сербию пустят только с сербским въездным штампом, то есть если в Косово въехали из Сербии. `XKX` — не официальный код ISO 3166-1, а пользовательский, им пользуются ЕС и МВФ | 2026-11-07 | [FCDO Serbia](https://www.gov.uk/foreign-travel-advice/serbia) (обн. 2026-10-22); [FCDO Kosovo](https://www.gov.uk/foreign-travel-advice/kosovo) (обн. 2026-09-23) | высокая |
| CYP (внутр.) | Ledra Palace, Ledra/Lokmacı (Зелёная линия) | `pedestrian_only` | Остальные КПП между севером и югом открыты, машины проезжают | 2026-11-07 | [FCDO Cyprus](https://www.gov.uk/foreign-travel-advice/cyprus) (обн. 2026-08-14) | высокая |

## Таблица 4. Формально открыто, но иностранной машине нужно разрешение (`permit_only`)

| Страна (все её сухопутные границы, если не сказано иное) | Что требуется | Проверено | Источники | Уверенность |
|---|---|---|---|---|
| CHN | Иностранной машине нужны временные китайские номера и регистрация, водителю — китайские права, иностранные и международные права не признаются. На практике въезд организует агентство с сопровождением. Для Тибета (а значит, и для CHN–NPL) нужен отдельный пермит, его оформляет только агентство | 2026-11-07 | [FCDO China](https://www.gov.uk/foreign-travel-advice/china) (обн. 2026-08-27): «You must have a Chinese driving licence…», «You must get a permit to travel to Tibet … through a specialist travel agent»; [правительство Чунцина, 06.2026](https://english.cq.gov.cn/services/liveinchongqing/Transport/202606/t20260609_15738150.html) | высокая |
| MMR | Для машины с иностранными номерами на любом КПП нужно разрешение Минтуризма (MTT) и Дорожной администрации, а на всю поездку — офицер связи и лицензированный гид. Мэсот–Мьявади открыт снова с 28.05.2026 после 10 месяцев закрытия | 2026-11-07 | [MCS Myanmar Travel](https://www.mcs-myanmartravel.com/?p=39) (туроператор); [Khaosod, 28.05.2026](https://www.khaosodenglish.com/news/2026/05/28/mae-sot-myawaddy-border-crossing-shut-by-myanmar-conflict-reopens-after-10-months/); [FCDO Myanmar](https://www.gov.uk/foreign-travel-advice/myanmar) (обн. 2026-08-04) | средняя |
| IND–MMR дополнительно | С декабря 2024 года иностранцам для Манипура и Мизорама снова нужен Protected Area Permit | 2026-11-07 | [Northeast Live](https://northeastlivetv.com/around-ne/manipur/centre-asks-manipur-nagaland-and-mizoram-to-monitor-foreigners-activities-closely) | средняя |
| TKM | Транзитная виза по приглашению (LOI), в котором указаны КПП въезда и выезда. Для въезда из Ирана нужна особая санкция властей и подтверждение вылета | 2026-11-07 | [FCDO Turkmenistan](https://www.gov.uk/foreign-travel-advice/turkmenistan) (обн. 2026-10-21); [FCDO Iran](https://www.gov.uk/foreign-travel-advice/iran) | высокая |
| BTN | На своей машине — только с гидом и въездным пермитом | 2026-11-07 | [FCDO Bhutan](https://www.gov.uk/foreign-travel-advice/bhutan) (обн. 2025-12-10) | высокая |

## Таблица 5. Пары под вопросом (свежего подтверждения нет, перепроверить)

| Пара | Что известно | Источники |
|---|---|---|
| AFG–UZB | Термез–Хайратон, по данным Торгово-промышленной палаты Узбекистана (AFP), открыт для путешественников с 23.11.2025. FCDO в марте 2026 года пишет «officially closed to foreigners» | [Dawn/AFP, 04.12.2025](https://www.dawn.com/news/1959064); [FCDO Uzbekistan](https://www.gov.uk/foreign-travel-advice/uzbekistan) (обн. 2026-03-19) |
| AFG–TJK, AFG–TKM | По FCDO, часть границ Таджикистана для иностранцев закрыта; гид за 2026 год пишет, что Ишкашим для иностранцев закрыт. По Туркменистану см. табл. 4 | [FCDO Tajikistan](https://www.gov.uk/foreign-travel-advice/tajikistan); [Saiga Tours](https://www.saigatours.com/article/A-guide-to-land-border-crossings-of-Afghanistan) |
| DZA–MLI, DZA–NER, DZA–LBY | Формального закрытия не нашёл. Юг Алжира — военная зона с высоким риском похищений. Дипотношения и воздушное пространство Алжир и Мали восстановили в июле 2026 года | [FCDO Algeria](https://www.gov.uk/foreign-travel-advice/algeria); [ABC/AP](https://abcnews.com/International/wireStory/mali-algeria-reopen-airspace-reinstate-ambassadors-ending-yearlong-134672474) |
| LBY–TCD, LBY–NER, LBY–SDN | В сентябре 2026 года вооружённая группировка «Силы революционеров Феццана» объявила южную границу Ливии закрытой (не официально). По FCDO, все сухопутные границы Ливии могут закрыть без предупреждения | [Voice of Emirates, 13.09.2026](https://www.voiceofemirates.com/en/politics/2026/09/13/libya-fezzan-revolutionaries-force-announces-closure-of-the-border-strip-extending-from-algeria-to-chad-and-sudan/); [FCDO Libya](https://www.gov.uk/foreign-travel-advice/libya) |
| CMR–GNQ, GAB–GNQ | Экваториальная Гвинея периодически закрывает границы: в 2017 и 2022 годах, строила стену. Данных за 2025–2026 годы нет | [Africanews, 2022](https://www.africanews.com/2022/11/02/closure-of-equatorial-guineas-borders-impacts-cameroonian-traders) |
| OMN–YEM | Переходы Шахн и Сарфайт. Пускают ли иностранцев, неясно | — |
| ETH–KEN | Мояле открыт, но с октября 2026 года там беспорядки | [FCDO Kenya](https://www.gov.uk/foreign-travel-advice/kenya) (обн. 2026-11-06) |
| COD–RWA | Гисеньи–Гома и Чьянгугу–Букаву работают, но могут закрыться без предупреждения | [FCDO DRC](https://www.gov.uk/foreign-travel-advice/democratic-republic-of-the-congo) (обн. 2026-10-08) |
| CHN–MMR | Мусэ–Жуйли, похоже, только для организованных туров | [Irrawaddy](https://www.irrawaddy.com/news/burma/china-reopens-trade-through-border-crossings-controlled-by-armed-groups.html) (дата статьи не сверена) |

Открыты и проверены, хотя их называли в тикете: **COL–VEN** (нормальное движение на январь–май 2026 года, закрывают только на выборы) — [La República](https://www.larepublica.co/economia/migracion-colombia-reporto-normalidad-en-los-pasos-fronterizos-con-venezuela-4304020), [Cancillería](https://www.cancilleria.gov.co/en/node/32678); **BRA–VEN** открыта; **GEO–RUS** через Верхний Ларс открыта; **IRQ–SYR** (Аль-Каим–Букемаль, с 12.06.2025), **JOR–SYR** (Джабер–Насиб), **LBN–SYR** (Масна) открыты для туристов — [Saiga Tours](https://www.saigatours.com/article/a-guide-to-Syrian-land-border-crossings).

---

## Как представлять частичные случаи: рекомендация

**Две таблицы: пары со статусом по умолчанию плюс КПП-исключения с координатами.** Только пары не годятся: для POL–BLR, EST–RUS и т. п. закрытая пара запрещает и разрешённые переходы, а открытая пускает маршрутизатор через закрытые КПП, у которых в OSM остаётся сквозная дорога. Только КПП тоже плохо: пришлось бы вручную перечислять сотни переходов там, где граница закрыта целиком (FIN–RUS, ARM–TUR).

### `border-pairs` (одна запись на неупорядоченную пару)

```yaml
- pair: [EST, RUS]          # коды ISO 3166-1 alpha-3, по алфавиту
  status: crossings_only    # closed | closed_except | one_way | crossings_only | pedestrian_only | permit_only | no_crossing | no_control
  except: []                # для closed_except: гражданства, которые пропускают (например [SYR])
  direction: null           # для one_way: [AZE, RUS] = можно только из AZE в RUS
  delay_hours: null         # переопределение времени на границе (0 для no_control); null = правило по умолчанию
  since: 2024-02-01
  checked: 2026-11-07
  confidence: high
  sources:
    - https://www.emta.ee/uudised/eesti-vene-piiripunktide-oine-sulgemine-muudeti-tahtajatuks
  notes: КПП работают 07:00–19:00
```

### `border-crossings` (белый список для `crossings_only` и точечные исключения в открытых парах)

```yaml
- id: koidula
  pair: [EST, RUS]
  name: Koidula – Куничина Гора
  lat: null                 # точка пересечения дороги с границей, WGS84, 4 знака; заполнить из OSM
  lon: null
  osm: null                 # необязательно: id узла barrier=border_control или пути
  status: open              # open | closed | pedestrian_only
  open_to: all              # all | citizens_of_pair | locals
  hours: "07:00-19:00"
  checked: 2026-11-07
  sources: [https://www.emta.ee/uudised/eesti-vene-piiripunktide-oine-sulgemine-muudeti-tahtajatuks]
```

### Как это ложится на граф дорог (не зависит от движка)

1. При сборке графа пометить каждое ребро, которое пересекает международную границу, парой стран. Пару брать из полигонов стран, а не из тегов OSM: `barrier=border_control` размечены неполно.
2. По паре: `closed`, `no_crossing`, `pedestrian_only` → удалить ребро. `crossings_only` → оставить только рёбра в радиусе ~1–3 км от точки КПП из белого списка со статусом `open`. `closed_except` и `one_way` → проверять при запросе по гражданству и направлению либо собирать отдельные графы для каждого варианта. Точечные `closed` в открытой паре (Псоу, Приднестровье) → удалить рёбра рядом с этими точками.
3. Время на границе берётся из той же пометки ребра: 0 ч, если обе страны в Шенгене или у пары `no_control`/`delay_hours: 0`, иначе 1,5 ч.
4. **Риск, о котором стоит помнить**: даже на открытых границах вне Шенгена в OSM бывают полевые дороги и просёлки через границу без КПП. Маршрутизатор их «разрешит». MVP это допускает, но позже стоит разрешать вне Шенгена только рёбра рядом с официальными КПП.
5. Для ручной поддержки: каждой записи `checked` и `sources`, а lint, когда понадобится, может предупреждать о записях старше ~90 дней. Быстрее всего меняются EST/LVA/LTU/POL–BLR/RUS, AFG–PAK, THA–KHM и BEN–NER.

---

## Границы без паспортного контроля (для правила «время на границе»)

**Внутренний Шенген (0 ч по правилу)**: 29 стран — 25 стран ЕС (все, кроме CYP и IRL), а также ISL, NOR, CHE, LIE. BGR и ROU стали полноправными членами 01.01.2025. CYP в Шенген пока не входит, IRL не участвует — [Еврокомиссия](https://home-affairs.ec.europa.eu/policies/schengen/schengen-area_en). Между CHE и LIE с соседями нет паспортного контроля, но есть таможня: CHE не в таможенном союзе ЕС.

| Пара | Паспортный контроль | Предлагаемое время на границе | Источник | Уверенность |
|---|---|---|---|---|
| BLR–RUS | Для граждан RUS и BLR КПП нет (Союзное государство). Иностранцы с 11.01.2025 могут пересекать границу с визой РФ или РБ, на машине — только через ограниченное число авторизованных пунктов | 0 ч для граждан RUS и BLR; для остальных — уточнить | [FCDO Russia](https://www.gov.uk/foreign-travel-advice/russia): «You can only cross the land border between Russia and Belarus by road through a limited number of authorised crossing points»; [FCDO Belarus](https://www.gov.uk/foreign-travel-advice/belarus); [pravo.by, 01.2025](https://pravo.by/novosti/obshchestvenno-politicheskie-i-v-oblasti-prava/2025/january/80205/) | высокая |
| GBR–IRL | Common Travel Area: на сухопутной границе Северной Ирландии плановых проверок нет. ETA не требуется жителям Ирландии, въезжающим из Ирландии, а остальным формально нужно | 0 ч | [FCDO Ireland](https://www.gov.uk/foreign-travel-advice/ireland) (обн. 2026-09-04); [gov.uk/eta](https://www.gov.uk/eta) | высокая |
| ESP–GIB | С 15.07.2026 по договору ЕС–Великобритания (применяется временно) забор снят, сухопутного контроля нет. Шенгенские проверки перенесены в порт и аэропорт Гибралтара | 0 ч | [La Moncloa, 15.07.2026](https://www.lamoncloa.gob.es/lang/en/presidente/news/paginas/2026/20260715-gibraltar-fence-demolition.aspx); [MAEC](https://www.exteriores.gob.es/en/Comunicacion/Exteriores-explica/Paginas/2026_Articulos/El-Acuerdo-con-respecto-a-Gibraltar-cuando-se-aplica-y-que-supone-para-Espana.aspx) | высокая |
| FRA–MCO | Нет, Монако применяет правила Шенгена | 0 ч | [FCDO Monaco](https://www.gov.uk/foreign-travel-advice/monaco) | высокая |
| ITA–SMR | Нет: «You do not need to pass through border controls to enter San Marino» | 0 ч | [FCDO San Marino](https://www.gov.uk/foreign-travel-advice/san-marino) | высокая |
| ITA–VAT | Нет, но въезд на машине ограничен | 0 ч | — (общеизвестно) | высокая |
| AND–ESP, AND–FRA | **Есть**: Андорра не в Шенгене, на границе таможня и возможна проверка паспортов | 1,5 ч или меньше (решение Owner) | [FCDO Andorra](https://www.gov.uk/foreign-travel-advice/andorra) | высокая |
| GTM–HND–SLV–NIC (CA-4) | Единые 90 дней пребывания на четыре страны, но пограничные посты с миграционным контролем остались, ночью их закрывают | Оставить 1,5 ч или уменьшить (решение Owner) | [FCDO Guatemala](https://www.gov.uk/foreign-travel-advice/guatemala), [FCDO Nicaragua](https://www.gov.uk/foreign-travel-advice/nicaragua) (обн. 2026-11-05), [FCDO Honduras](https://www.gov.uk/foreign-travel-advice/honduras) | высокая |
| IND–NPL, BTN–IND | Граждане IND, NPL и BTN проезжают без паспортного контроля, иностранцы проходят иммиграционный контроль на назначенных КПП | 1,5 ч для иностранцев | — (общеизвестно) | средняя |
| ЕАЭС (RUS–KAZ, KAZ–KGZ и др.), Mercosur, ECOWAS, GCC | Таможенного контроля нет или он упрощён, паспортный **есть** | 1,5 ч | [FCDO Kazakhstan](https://www.gov.uk/foreign-travel-advice/kazakhstan) | высокая |
| MAF–SXM (о. Сен-Мартен) | Открытая граница без контроля. Остров, к материку не относится | 0 ч | — (не проверено) | низкая |

**Временный контроль на внутренних границах Шенгена**: в основном это выборочные проверки, не паспортный контроль каждой машины. Действующие уведомления по [странице Еврокомиссии](https://home-affairs.ec.europa.eu/policies/schengen/schengen-area/temporary-reintroduction-border-control_en) на 2026-11-07:

| Страна | Границы | Срок |
|---|---|---|
| DEU | Все сухопутные: FRA, LUX, BEL, NLD, DNK, AUT, CHE, CZE, POL | 16.09.2026 – 15.03.2027 |
| FRA | Все внутренние: BEL, DEU, LUX, CHE, ESP, ITA | 01.11.2026 – 30.04.2027 |
| AUT | SVK, CZE, HUN, SVN | 16.09.2026 – 15.03.2027 |
| POL | DEU, LTU | 02.10.2026 – 30.03.2027 |
| DNK | DEU (суша и море) | 12.11.2026 – 11.05.2027 (сменяет период до 11.11.2026) |
| SWE | Все внутренние, в т. ч. суша с DNK | 12.11.2026 – 11.05.2027 |
| NOR | Порты с паромами в Шенгенскую зону | 12.11.2026 – 11.05.2027 |
| ITA | SVN | 19.06.2026 – 18.12.2026 |

NLD, BEL, SVN и BGR в текущем списке нет. Предлагаю внутри Шенгена оставить 0 ч и при желании показывать пометку.

**Внешние границы Шенгена**: с 12.10.2025 вводилась система EES, полностью она работает с 10.04.2026. ETIAS обещают запустить в IV квартале 2026 года, точной даты нет. Очереди на внешних границах ЕС из-за этого могут вырасти: 1,5 ч может оказаться мало (EST–RUS, LVA–RUS, POL–BLR).

## Ограничения по номерам машины (не граница, но влияет на маршрут)

- **Машины с российскими номерами** (легковые до 9 мест) не пускают в ЕС: таково толкование санкционного регламента 833/2014 ст. 3i Еврокомиссией с сентября 2023 года. С октября 2023 года не пускает и **Норвегия**, в том числе на временный ввоз — [EC FAQ](https://finance.ec.europa.eu/eu-and-world/sanctions-restrictive-measures/sanctions-adopted-following-russias-military-aggression-against-ukraine/frequently-asked-questions-sanctions-against-russia_en), [Euronews, 11.09.2023](https://www.euronews.com/2023/09/11/dont-let-russian-cars-enter-eu-territory-brussels-tells-member-states), [Regjeringen](https://www.regjeringen.no/en/aktuelt/norway-is-tightening-its-restrictive-measures-against-russia/id2996416).
- **Машины с белорусскими номерами** ЕС не пускает по регламенту Совета ЕС 2024/1865, на литовской границе с 18.07.2024 — [LRT, 17.07.2024](https://www.lrt.lt/en/news-in-english/19/2321146/lithuania-to-ban-belarus-registered-cars).
- Путешественник по умолчанию — гражданин РФ. Если он едет на своей машине, то даже с шенгенской визой не проедет ни через одну границу RUS/BLR–EU/NOR, хотя каждая такая пара в таблице 2 «открыта». Решать, учитывать ли это, должен Owner.

## Вопросы к Owner (продуктовые)

1. **`permit_only` (CHN, MMR, TKM, BTN)**: считать эти страны закрытыми для поездки на машине или открытыми с предупреждением? Предлагаю по умолчанию закрытыми: спонтанно туда на своей машине не въехать.
2. **Номера машины**: добавить ли переключатель «машина с российскими (белорусскими) номерами»? С ним для путешественника по умолчанию закрываются ЕС и Норвегия.
3. **Абхазия, Южная Осетия, оккупированные территории Украины**: в ISO и OSM это GEO и UKR. Гражданин РФ фактически может доехать до Абхазии через Псоу, но по грузинскому закону это незаконный въезд. Показывать ли такие территории досягаемыми? Предлагаю нет: закрыть Псоу и Рокский тоннель, и тогда эти территории закрыты сами собой. Линия фронта в Украине — это не граница: через неё маршрутизатор тоже не должен ехать, но в этом тикете её нет.
4. **`one_way` (выезд из AZE в RUS)** нужен, только если точка старта в Азербайджане. Для MVP можно считать пару полностью закрытой.
5. **Динамические закрытия** не входят в список: погода (Верхний Ларс, перевал Лос-Либертадорес на CHL–ARG в июне–сентябре, Хунджераб зимой), выборы (COL–VEN, COL–ECU), ночное закрытие (EST–RUS 19:00–07:00). Предлагаю их не моделировать.
