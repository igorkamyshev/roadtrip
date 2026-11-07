# PostHog на Cloudflare: как подключить аналитику и ошибки

Исследование к тикету [#17](https://github.com/igorkamyshev/roadtrip/issues/17) (карта: [#1](https://github.com/igorkamyshev/roadtrip/issues/1), рамки решены в [#16](https://github.com/igorkamyshev/roadtrip/issues/16)). Дата: 2026-11-07.

Проверено на версиях `posthog-js` 1.447.3 и `posthog-node` 5.63.1 (обе вышли 6 ноября 2026), `@posthog/rollup-plugin` 1.6.3, `@posthog/cli` 0.19.0. Снимок настроек — `defaults: '2026-08-30'`, последний в документации. Документация PostHog и Cloudflare — на 7 ноября 2026.

**Вопрос.** Что нужно знать, чтобы спека описала подключение PostHog без новых вопросов? Браузер: инициализация, просмотры страниц, когда настройки живут в ссылке, source maps. Worker, Container, управляемый прокси, ключи, лимиты и цена, и как не слать события из разработки и превью.

## Коротко

- **Браузер.** Ставим `posthog-js` из npm, `defaults: '2026-08-30'`, `capture_exceptions: true`, `disable_session_recording: true`. В `api_host` — поддомен управляемого прокси.
- **Просмотры страниц.** С этим снимком настроек просмотр пишется только при смене пути (`pathname`). Смена `?…` или `#…` его не создаёт, так что ползунок просмотров не плодит.
- **Координаты в ссылке.** Если состояние лежит в `#…`, PostHog вырезает эту часть из всех URL в событиях, и точка старта в PostHog не попадёт. Часть `?…` не вырезается.
- **Source maps.** Загружаем при сборке: плагин `@posthog/rollup-plugin` для Vite или `posthog-cli`. Для этого нужен **персональный API-ключ** (`phx_`, секрет) с правом «error tracking: write» и ID проекта. Ключ живёт только в секретах CI.
- **Worker.** Подходит `posthog-node`: у него есть отдельная сборка под `workerd`, флаг `nodejs_compat` не нужен.
  - Клиент PostHog создаём на каждый запрос. Отправка — `captureImmediate` и `captureExceptionImmediate` внутри `ctx.waitUntil()`.
  - На всех серверных событиях ставим `$process_person_profile: false`. Без этого серверные SDK пишут «опознанные» события, а они дороже.
- **Container.** В PostHog напрямую не ходит. Тайминги и ошибку он возвращает Worker'у в ответе, а Worker отправляет их в PostHog вместе с контекстом запроса.
- **Прокси.** Управляемый прокси бесплатен для всех клиентов PostHog Cloud.
  - Владелец создаёт прокси в настройках организации PostHog и заводит в Cloudflare DNS запись CNAME **с серым облаком** (без проксирования Cloudflare).
  - В коде меняются только `api_host` и `ui_host`.
- **Ключи.** Токен проекта (`phc_`) публичный и годится только для записи. Его можно держать и в коде клиента, и в репозитории. Секретен только персональный ключ для source maps.
- **Лимиты.** Каждый месяц бесплатно 1 млн событий аналитики (веб-аналитика входит в них) и 100 тыс. исключений.
  - На бесплатном плане всё сверх лимита молча отбрасывается, и денег никто не берёт.
  - 1 000 посещений в месяц — это 1–3 % лимита, $0.
  - 100 000 посещений — 1–3 млн событий. На бесплатном плане события перестанут приниматься в середине месяца. На платном это ≈$0–85 в месяц, а потолок ставится лимитом в долларах на каждый продукт.
- **Разработка и превью.** PostHog включаем только на боевом домене, и в клиенте, и в Worker. На встроенную защиту полагаться нельзя: на `localhost` posthog-js события шлёт и лишь помечает их как тестовые.

## 1. Браузер: posthog-js

### Инициализация

Набросок, который можно класть в спеку (значения в угловых скобках выбирает владелец):

```ts
import posthog from 'posthog-js'

const PROD_HOST = '<боевой домен>'

if (location.hostname === PROD_HOST) {
  posthog.init('<токен проекта>', {
    api_host: 'https://<поддомен прокси>.<боевой домен>',
    ui_host: 'https://us.posthog.com',
    defaults: '2026-08-30',
    capture_exceptions: true,        // window.onerror и unhandledrejection
    disable_session_recording: true, // session replay в MVP выключен
    tracing_headers: [PROD_HOST],    // заголовки X-POSTHOG-* в запросы к нашему API
  })
}
```

Что делает каждая настройка:

- **`defaults`** — дата снимка настроек по умолчанию. Последний снимок, `'2026-08-30'`, включает все предыдущие ([config](https://posthog.com/docs/libraries/js/config)). Для нас важны три вещи из него:
  - `capture_pageview: 'history_change'` (с `'2025-05-24'`): просмотры страниц в одностраничном приложении;
  - `disable_capture_url_hashes: true` (с `'2026-06-25'`): часть `#…` вырезается из URL в событиях. В таблице снимков на странице документации этого пункта нет, но он есть в коде SDK ([`posthog-core`, `defaultsThatVaryByConfig`](https://github.com/PostHog/posthog-js/blob/main/packages/browser/src/posthog-core.ts)) и в описании настройки в типах [`@posthog/types`](https://github.com/PostHog/posthog-js/blob/main/packages/types/src/posthog-config.ts);
  - `internal_or_test_user_hostname: /^(localhost|127\.0\.0\.1)$/` (с `'2026-01-30'`), подробнее в [разделе 7](#7-разработка-и-превью).
- **Стандартная веб-аналитика** включена без настроек. Посетители, сессии, отказы, источники трафика, страны и устройства считаются по событиям `$pageview` и `$pageleave` ([web analytics](https://posthog.com/docs/web-analytics)). Страны определяются по IP через GeoIP.
  - Автосбор кликов, изменений полей и отправок форм тоже включён по умолчанию ([usage](https://posthog.com/docs/libraries/js/usage)).
  - Web vitals (`$web_vitals`) включаются отдельно в настройках проекта и оплачиваются как обычные события, примерно 30 % от числа `$pageview` ([web vitals](https://posthog.com/docs/web-analytics/web-vitals)). В «поведение по умолчанию» они не входят.
- **Анонимные события.** По умолчанию `person_profiles: 'identified_only'`, и пока не вызван `identify`, события анонимные. У нас нет аккаунтов, поэтому анонимные все события. Они «до 4 раз дешевле» опознанных ([anonymous vs identified](https://posthog.com/docs/data/anonymous-vs-identified-events)).
- **Возвращаемость** считается по анонимному идентификатору браузера: по умолчанию `persistence: 'localStorage+cookie'` ([persistence](https://posthog.com/docs/libraries/js/persistence)).
- **`capture_exceptions: true`** перехватывает `window.onerror` и `unhandledrejection`, а `console.error` не трогает. Без этой настройки SDK смотрит на тумблер в настройках проекта, поэтому надёжнее включить её в коде. Проверено в исходниках [`exception-autocapture`](https://github.com/PostHog/posthog-js/tree/main/packages/browser/src/extensions/exception-autocapture); описание — в [error tracking pricing](https://posthog.com/docs/error-tracking/pricing).
- **`disable_session_recording: true`**: SDK не грузит модуль записи сессий, что бы ни стояло в настройках проекта ([config](https://posthog.com/docs/libraries/js/config)).
- **`tracing_headers: [PROD_HOST]`** добавляет в запросы к нашему домену заголовки `X-POSTHOG-DISTINCT-ID`, `X-POSTHOG-SESSION-ID` и `X-POSTHOG-WINDOW-ID`. Так Worker привязывает серверные события и ошибки к сессии браузера (описание опции — в [`@posthog/types`](https://github.com/PostHog/posthog-js/blob/main/packages/types/src/posthog-config.ts), старое имя `__add_tracing_headers`).
- **`ui_host`** нужен при прокси, чтобы ссылки на интерфейс PostHog вели на `us.posthog.com` ([proxy](https://posthog.com/docs/advanced/proxy)).

### Просмотры страниц, когда настройки в ссылке

- `capture_pageview: 'history_change'` в коде равен `{ path: true }`. SDK оборачивает `history.pushState`, `history.replaceState` и `popstate` и пишет `$pageview`, только если изменился `location.pathname` ([`history-autocapture.ts`](https://github.com/PostHog/posthog-js/blob/main/packages/browser/src/extensions/history-autocapture.ts)).
- Смена `?…` или `#…` пишет просмотр, только если явно задать `capture_pageview: { search: true }` или `{ hash: true }` (интерфейс `CapturePageviewOptions` в [`@posthog/types`](https://github.com/PostHog/posthog-js/blob/main/packages/types/src/posthog-config.ts)).
- Значит, у сайта на одном пути будет один `$pageview` на загрузку страницы, как бы человек ни двигал ползунок. Состояние в ссылку стоит писать через `history.replaceState`, а не `pushState`, чтобы кнопка «назад» не листала положения ползунка. Это решение интерфейса, на PostHog оно не влияет.

**Координаты точки старта.** Решено, что координаты в PostHog не уходят, только страна и ближайший город. Но SDK кладёт URL страницы в каждое событие, в том числе в `$exception`:

- `$current_url`, `$initial_current_url`, `$session_entry_url`;
- `href` ссылок, по которым кликнули (`$elements[*].attr__href`, `$external_click_url`).

Если в ссылке есть координаты, они уйдут в PostHog. Есть два способа этого избежать:

- **Состояние в `#…` (рекомендую).** При `disable_capture_url_hashes: true`, а это значение по умолчанию в нашем снимке, SDK вырезает `#…` из всех перечисленных полей. То же касается web vitals и данных для тепловых карт. Работает без своего кода (описание опции в [`@posthog/types`](https://github.com/PostHog/posthog-js/blob/main/packages/types/src/posthog-config.ts): «strip URL fragments (`#...`) from automatically captured URL fields»).
- **Состояние в `?…`.** Запрос не вырезается. Понадобится `before_send`, который чистит запрос во всех свойствах с `url` и `href` в имени (пример в [usage → Redacting information](https://posthog.com/docs/libraries/js/usage)). Есть и `mask_personal_data_properties: true` вместе с `custom_personal_data_properties: ['lat', 'lng']`, но эта пара маскирует только перечисленные параметры текущего URL.

Свои события и ошибки, клиентские и серверные, тоже не должны нести координаты.

### Ошибки в браузере

- Автосбор ловит только необработанные ошибки. Ошибки, которые код обрабатывает сам, отправляем явно через `posthog.captureException(error, props)` ([web error tracking](https://posthog.com/docs/error-tracking/installation/web)). Так стоит отправлять ответ API колец с кодом 5xx и событие `error` от MapLibre (например, тайл не загрузился).
- Ошибки, случившиеся до `posthog.init`, теряются. Поэтому инициализируем PostHog в точке входа, до карты.
- Защита от лавины: после 10 исключений одного типа SDK отправляет не больше одного в 10 секунд ([error tracking pricing](https://posthog.com/docs/error-tracking/pricing)).

### Размер в бандле

Я собрал оба варианта через esbuild с минификацией и сжал gzip -9:

- полный `posthog-js` — ≈123 КБ;
- «тонкая» сборка `posthog-js/dist/module.slim` с расширениями Analytics, ErrorTracking и Tracing — ≈74 КБ.

Тонкая сборка в документации помечена как экспериментальная, а расширения в ней подключаются через опцию `__extensionClasses` ([js](https://posthog.com/docs/libraries/js)). Для MVP хватит полной, оптимизация потом. Для сравнения, MapLibre с воркером весит ≈450 КБ ([#7](https://github.com/igorkamyshev/roadtrip/issues/7)).

### Source maps

PostHog разворачивает минифицированный стек двумя способами ([stack traces](https://posthog.com/docs/error-tracking/stack-traces)):

1. **Загрузка при сборке (рекомендую).** Для Vite есть [`@posthog/rollup-plugin`](https://posthog.com/docs/error-tracking/upload-source-maps/vite) с параметрами `personalApiKey`, `projectId` и `sourcemaps: { releaseName, releaseVersion, deleteAfterUpload }`.
   - Плагин вписывает в каждый JS-файл комментарий `//# chunkId=…` и загружает карты в PostHog. По умолчанию после загрузки он удаляет `.map` из сборки.
   - Задеплоить нужно именно эти, изменённые файлы. Если выкатить копию сборки без `chunkId`, стек не развернётся ([cli](https://posthog.com/docs/error-tracking/upload-source-maps/cli)).
   - Те же шаги делают `posthog-cli sourcemap inject` и `upload` или GitHub Action [`PostHog/upload-source-maps@v2`](https://posthog.com/docs/error-tracking/upload-source-maps/github-actions).
   - Версией релиза удобно брать git SHA. Тогда в ошибке видно, какой коммит её дал.
2. **Публичные `.map` без загрузки.** Если карты лежат на сайте и в JS есть `sourceMappingURL`, PostHog скачает их сам ([stack traces → Troubleshooting symbol sets](https://posthog.com/docs/error-tracking/stack-traces)). Ключ не нужен, а скрывать исходники незачем: репозиторий публичный.
   - Минус: после деплоя старые файлы с хешами исчезают из статики Worker, и ошибки из вкладок, открытых до деплоя, не развернутся.
   - Релизов в этом варианте нет.

**Какой ключ нужен.** Персональный API-ключ (`phx_`), он секретный.

- Плагину достаточно права «error tracking: write». CLI и GitHub Action просят ещё «organization: read» ([vite](https://posthog.com/docs/error-tracking/upload-source-maps/vite), [cli](https://posthog.com/docs/error-tracking/upload-source-maps/cli)).
- К ключу нужен ID проекта, он не секретный.
- Ключ кладём только в секреты CI, туда же, где идёт деплой.
- Ключ привязан к пользователю и удаляется вместе с ним ([personal API keys](https://posthog.com/docs/api/personal-api-keys)).
- Если `phx_` утечёт в публичный GitHub, PostHog сам его перевыпустит и пришлёт письмо ([API → GitHub secret scanning](https://posthog.com/docs/api)).

## 2. Worker: posthog-node

**SDK или HTTP API.** Берём SDK.

- В `package.json` у `posthog-node` есть условие экспорта `workerd`, которое ведёт на сборку `index.edge`. Встроенные модули Node.js она не использует, поэтому флаг `nodejs_compat` ей не нужен ([Cloudflare Workers](https://posthog.com/docs/libraries/cloudflare-workers)).
- Я собрал пробный Worker esbuild'ом с условием `workerd`: ≈59 КБ в gzip, статических импортов `node:*` нет.
- Голый HTTP API (`POST /i/v0/e/` или `/batch/` с токеном проекта, [capture](https://posthog.com/docs/api/capture)) тоже сработает. Но для ошибок пришлось бы самим собирать `$exception_list`, а SDK уже разбирает стек, строит его и ограничивает лавины.

**Как отправлять.** Схема из документации PostHog ([Cloudflare Workers](https://posthog.com/docs/libraries/cloudflare-workers)):

```ts
const posthog = new PostHog(env.POSTHOG_PROJECT_TOKEN, {
  host: 'https://us.i.posthog.com',
  flushAt: 1,       // без пачек: isolate может умереть раньше, чем пачка уйдёт
  flushInterval: 0,
  disabled: !analyticsEnabled(request), // см. раздел 7
})
ctx.waitUntil(posthog.captureImmediate({ distinctId, event: 'ring computed', properties }))
// ошибка:
ctx.waitUntil(posthog.captureExceptionImmediate(err, distinctId, properties))
// в конце запроса:
ctx.waitUntil(posthog.shutdown())
```

- Клиент создаём заново на каждый запрос. Документация так и советует: isolate может переиспользовать глобальные переменные, но с жизненным циклом `shutdown` надёжнее отдельный клиент.
- Была ошибка: `captureImmediate` завершался раньше сетевого запроса ([posthog-js#2225](https://github.com/PostHog/posthog-js/issues/2225)). Её закрыли, и в 5.63.1 метод возвращает промис отправки (проверено в `dist/client.mjs`).
- Автосбора ошибок в Worker нет: `enableExceptionAutocapture` держится на обработчиках процесса Node. Ловим сами: общий `try/catch` вокруг `fetch` (или `app.onError` в Hono, [hono](https://posthog.com/docs/error-tracking/installation/hono)), затем `captureExceptionImmediate` и ответ 500.
- **Контекст.** Worker читает `X-POSTHOG-DISTINCT-ID` и `X-POSTHOG-SESSION-ID`, которые прислал браузер. Значения чистим от управляющих символов и обрезаем до 1000 символов, как в примере из документации. Передаём их как `distinctId` и `$session_id`.
  - Без заголовков берём случайный UUID на запрос, а не общую константу вроде `server`. Константа склеит всех в одного «человека» ([anonymous vs identified → Backend](https://posthog.com/docs/data/anonymous-vs-identified-events)).
- **`$process_person_profile: false`** ставим на каждое серверное событие. Серверные SDK по умолчанию пишут опознанные события. Удобнее всего задать это в `before_send` клиента: опция есть у `posthog-node`.
- **GeoIP.** У `posthog-node` по умолчанию `disableGeoip: true` (проверено в `@posthog/core`), поэтому серверные события не получат координаты дата-центра Cloudflare. Страну и город точки старта передаём явно, свойствами.
- Пример из документации кладёт в событие `$current_url: request.url`. Нам так нельзя, если в URL запроса к API есть координаты.
- Хост для сервера — `https://us.i.posthog.com` напрямую. Прокси нужен только браузерам.

**Что теряется при сбое.**

- Ответ человеку не страдает: отправка идёт в `waitUntil` уже после ответа.
- После ответа у `waitUntil` есть 30 секунд, потом незавершённые промисы отменяются ([Context → waitUntil](https://developers.cloudflare.com/workers/runtime-apis/context/#waituntil)). `posthog-node` по умолчанию делает 3 повтора с паузой 3 с и тайм-аутом 10 с на запрос (`fetchRetryCount`, `fetchRetryDelay`, `requestTimeout`). Если PostHog не ответил за это время, событие потеряно. Очереди или записи на диск нет.
- Если Worker упал по лимиту CPU или памяти (Error 1102), `catch` не выполнится, и ошибка останется только в логах Cloudflare ([limits](https://developers.cloudflare.com/workers/platform/limits/)). На будущее такие падения можно ловить Tail Worker'ом: он видит `outcome: exceededCpu` и исключения ([Tail Workers](https://developers.cloudflare.com/workers/observability/logs/tail-workers/)). Tail Workers доступны на Workers Paid, а он и так нужен для Containers.
- Если превышена квота PostHog, приём событий всё равно отвечает 200 с полем `quota_limited`, а события выбрасываются молча ([API overview](https://posthog.com/docs/api)).
- Браузер повторяет неудачную отправку до 10 раз с нарастающей паузой, но очередь держит только в памяти. При закрытии страницы он досылает её через `sendBeacon` (по исходникам [`retry-queue`](https://github.com/PostHog/posthog-js/blob/main/packages/browser/src/retry-queue.ts)). От блокировщиков рекламы спасает прокси.

## 3. Container

Container с расчётом колец — процесс на TypeScript/Node в инстансе standard-1 ([#8](https://github.com/igorkamyshev/roadtrip/issues/8)).

**Напрямую технически можно.**

- У контейнера по умолчанию есть выход в интернет (`enableInternet` по умолчанию `true`, [outbound traffic](https://developers.cloudflare.com/containers/configuration/outbound-traffic/)).
- В Node работает обычный `posthog-node` с `enableExceptionAutocapture: true` ([node error tracking](https://posthog.com/docs/error-tracking/installation/node)).
- Перед остановкой нужно успеть вызвать `shutdown()`. Cloudflare шлёт SIGTERM, ждёт до 15 минут и потом шлёт SIGKILL. Простаивающий контейнер засыпает через `sleepAfter`, по умолчанию 10 минут ([lifecycle](https://developers.cloudflare.com/containers/concepts/architecture/)).

**Рекомендую через Worker.**

- Контейнер не знает, чей это запрос и из какой он сессии. Worker знает это из заголовков, а ещё знает, было ли попадание в кэш.
- SDK и его настройки живут в одном месте. Контейнер остаётся чистым расчётом: без ещё одной зависимости и без своей переменной с токеном.
- Пачки событий в долгоживущем процессе теряются при SIGKILL или нехватке памяти.

**Как это устроить.**

- В успешном ответе контейнер отдаёт `timings`: например, `graph_load_ms` при холодном старте, `dijkstra_ms`, число пройденных узлов.
- При ошибке контейнер отвечает 500 с телом `{ error: { name, message, stack } }`. Worker собирает из него `Error` с тем же `name`, `message` и `stack` и отправляет через `captureExceptionImmediate`. SDK разбирает строку стека парсером Node, поэтому в PostHog будут кадры из файлов контейнера. Это надо проверить при реализации.
- Если контейнер не ответил (упал или не поднялся вовремя), Worker отправляет свою ошибку, например `RingContainerUnavailable`.
- Время всего вызова, включая холодный старт, меряет Worker и кладёт в `ring computed` как `container_ms`.
- Сборку контейнера не минифицируем, чтобы стек читался без source maps.
- Вывод контейнера (stdout и stderr) остаётся в логах Cloudflare при `observability.enabled` и хранится 7 дней. С 1 декабря 2026 логи контейнеров оплачиваются по тарифу Cloudflare Observability ([Containers FAQ](https://developers.cloudflare.com/containers/faq/)).

## 4. Управляемый прокси

Описание — на странице [Deploy a reverse proxy](https://posthog.com/docs/advanced/proxy).

**Что даёт.**

- События, флаги и скрипты SDK (`/static/*`) идут через наш поддомен. Блокировщики его не знают, и данных собирается больше: по оценке PostHog, «typically increases event capture by 10–30%».
- SSL, маршрутизацию и обслуживание берёт на себя PostHog. Нам не нужен свой Worker, а значит, события не тратят наши запросы Workers.
- Цена: «free for all PostHog Cloud users». Платный план не нужен.
- Прокси работает на Cloudflare Workers на стороне PostHog. Запросы не логируются и не кэшируются, а заголовок `Cookie` удаляется до отправки в PostHog.
- Ограничение: DNS-блокировщики с раскрытием CNAME (NextDNS, Pi-hole) всё равно могут резать такие запросы.

**Что делает владелец.**

1. В PostHog: настройки организации, раздел Proxy, кнопка «new managed proxy». Вводит поддомен боевого домена. Имя должно быть нейтральным: без `analytics`, `tracking`, `telemetry`, `posthog` и `ph`.
2. В Cloudflare DNS: запись CNAME с этим поддоменом, цель вида `<id>.proxy-us.posthog.com`, её покажет PostHog. **Проксирование Cloudflare выключено (серое облако)**, иначе сертификат не выпустится.
3. Ждёт смены статуса waiting → issuing → live. Обычно это 2–5 минут, но может занять до 30.
   - Если в зоне есть записи CAA, в них нужно разрешить `pki.goog`, `letsencrypt.org` и `ssl.com`.
   - Проверка HTTP-01 должна достучаться до порта 80. С серым облаком так и будет.
   - Если что-то не так, в меню прокси есть кнопка Diagnose.
4. Прокси не работает в зонах Cloudflare Enterprise с zone hold. Это не наш случай.

**Что в коде.** Только `api_host: 'https://<поддомен>.<боевой домен>'` и `ui_host: 'https://us.posthog.com'`.

- Если спека задаёт Content-Security-Policy, поддомен прокси нужно добавить в `connect-src` и `script-src` ([js → CSP](https://posthog.com/docs/libraries/js)).
- Серверного кода прокси не касается.

## 5. Ключи

| Ключ | Префикс | Публичный? | Где живёт |
|---|---|---|---|
| Токен проекта (project API key) | `phc_` | Да, только на запись | Код клиента и `vars` Worker'а. Можно в репозитории |
| ID проекта | число | Да | Переменная CI для загрузки source maps |
| Персональный API-ключ | `phx_` | **Нет** | Только секреты CI: загрузка source maps |
| Секретный ключ проекта (beta) | `phs_` | Нет | Не нужен: он для локального расчёта флагов и Endpoints |
| Секретный ключ флагов (устаревший) | `phs_` | Нет | Не нужен |

- Документация прямо отвечает, можно ли показывать токен: «It is **ok** for your **project token** (starts with `phc_`) to be public… doesn't have access to your private data». А персональный ключ «should **NOT** be public» ([privacy FAQ](https://posthog.com/docs/privacy)).
- Токен проекта служит только для отправки событий и расчёта флагов. Читать данные им нельзя ([feature flags installation](https://posthog.com/docs/feature-flags/installation)).
- Токен в любом случае окажется в бандле клиента, поэтому в репозитории он ничего не добавляет к риску. Единственный риск — кто-то шлёт мусор на наш токен — одинаков в обоих случаях. От него страхуют лимиты расходов.
- Токен можно перевыпустить, старый перестаёт работать сразу ([projects](https://posthog.com/docs/settings/projects)).

## 6. Лимиты и цена

**Бесплатно каждый месяц** ([pricing](https://posthog.com/pricing)). Объём одинаковый, есть карта или нет.

| Продукт | Бесплатно | Дальше |
|---|---|---|
| Продуктовая аналитика: события, включая веб-аналитику | 1 млн событий | $0,00005 за событие до 2 млн, $0,0000343 до 15 млн |
| Error tracking: события `$exception` | 100 тыс. | $0,00037 до 325 тыс. |
| Feature flags: запросы `/flags` | 1 млн | Не платим: запрос платный, только если считает активный флаг, а флагов у нас нет ([cutting costs](https://posthog.com/docs/feature-flags/cutting-costs)) |
| Session replay | 5 тыс. записей | Выключен |

- Веб-аналитика «included with Product Analytics at no extra cost». `$pageview`, `$pageleave` и `$autocapture` считаются как обычные события, а `$exception` идёт только в счёт error tracking ([billing FAQ](https://posthog.com/docs/billing/common-questions)).
- Учёт общий на организацию: все проекты делят один бесплатный объём ([billing FAQ](https://posthog.com/docs/billing/common-questions)).

**Планы.**

- **Free** — без карты. Один проект, данные хранятся 1 год. На этом плане «any additional events are permanently dropped», а счёт не выставляется: потолок расходов здесь $0 сам собой.
- **Pay-as-you-go** — нужна карта, базовой платы нет. До 6 проектов, данные хранятся 2 года.
  - Сверх бесплатного объёма платим по таблице.
  - Потолок задаётся **лимитом в долларах отдельно на каждый продукт** в настройках биллинга организации. Сверх лимита данные выбрасываются, и больше лимита не спишут ([billing limits](https://posthog.com/docs/billing/limits-alerts)).
  - Владелец организации получает письма при 80 % и 100 % лимита и бесплатного объёма. Раз в день работает проверка всплесков ([spike detection](https://posthog.com/docs/billing/spike-detection)).

**Оценка.** Посещение — это одна сессия. Опубликованных цифр под наш сайт нет, поэтому сценарии — моя оценка.

- **Типичное посещение — ≈20 событий:**
  - `$pageview` и `$pageleave` — 2;
  - `$autocapture` — около 6: 3 отпускания ползунка, 2 изменения настроек, 1 кнопка;
  - `$rageclick` и `$dead_click` — около 1;
  - свои события клиента — около 5;
  - серверное `ring computed` — 3–4;
  - запросы к Sherpa — почти 0: правила кэшируются на сутки ([#11](https://github.com/igorkamyshev/roadtrip/issues/11)).
- **Скромно — ≈10 событий.** Ползунок и карта исключены из автосбора, своих событий меньше.
- **С запасом — ≈30 событий.**
- **Исключения:** закладываю не больше 0,05 на посещение.

| | 1 000 посещений | 100 000 посещений |
|---|---|---|
| Событий при ≈10 / 20 / 30 на посещение | 10 тыс. / 20 тыс. / 30 тыс. | 1 млн / 2 млн / 3 млн |
| Free | $0, 1–3 % объёма | $0, но при 2 млн приём встанет примерно к 15-му числу, при 3 млн — к 10-му |
| Pay-as-you-go | $0 | ≈$0 / ≈$50 / ≈$84 |
| Исключения | ≈50, $0 | ≈5 000, $0 (5 % объёма) |

Как считал платный план: при 2 млн событий — (2 млн − 1 млн) × $0,00005 = $50; при 3 млн — $50 + 1 млн × $0,0000343 ≈ $84,3.

## 7. Разработка и превью

**Клиент.** `posthog.init` вызываем, только если `location.hostname` совпадает с боевым доменом. Так события не уйдут ни с `localhost`, ни с превью на `workers.dev`, ни с чужих копий сайта.

На PostHog в этом полагаться нельзя. При `defaults` от `'2026-01-30'` настройка `internal_or_test_user_hostname` по умолчанию совпадает с `localhost` и `127.0.0.1`. На таком хосте SDK вызывает `setInternalOrTestUser()`: события **отправляются** с пометкой `$internal_or_test_user: true` и при этом включают профиль человека, то есть становятся дорогими опознанными (описание опции в [`@posthog/types`](https://github.com/PostHog/posthog-js/blob/main/packages/types/src/posthog-config.ts)). Документация сама предлагает проверять хост перед `init` ([js → Don't want to send test data](https://posthog.com/docs/libraries/js)).

**Worker.**

- Та же проверка по `new URL(request.url).hostname`. Если хост не боевой, клиент создаём с `disabled: true`, и все вызовы становятся пустыми (опция `disabled` в `@posthog/core`).
- Это закрывает и `wrangler dev`, который берёт `vars` из конфигурации.
- Превью Cloudflare (`wrangler preview`) не наследуют боевые настройки: `vars` верхнего уровня в превью не попадают, их нужно явно повторить в блоке `previews` ([previews → configuration](https://developers.cloudflare.com/workers/previews/configuration/)). Если не класть туда токен PostHog, превью останутся без аналитики, даже если проверку хоста кто-то сломает.
- Version URLs для Worker'ов с Durable Objects и Containers не создаются вовсе ([version URLs](https://developers.cloudflare.com/workers/versions-and-deployments/version-urls/)).

**Отдельный проект для разработки не нужен.** На Free он недоступен (один проект), а на платном плане делит тот же бесплатный объём ([projects](https://posthog.com/docs/settings/projects)). Проверить отправку событий можно на боевом домене с `?__posthog_debug=true` ([usage](https://posthog.com/docs/libraries/js/usage)) или во вкладке Network.

## 8. События здоровья сервиса (предложение)

Названия — в формате «[объект] [глагол]», как советует PostHog ([usage](https://posthog.com/docs/libraries/js/usage)).

| Событие | Откуда | Свойства |
|---|---|---|
| `ring computed` | Worker, на каждый запрос кольца | `cache`: `hit` или `miss`, `hours`, `total_ms`, `container_ms`, `dijkstra_ms`, `cold_start`, `closed_countries_count`, `start_country`, `start_city`. Без координат |
| `sherpa requested` | Worker, на каждый вызов Sherpa | `endpoint`, `status`, `duration_ms`, `citizenship` |
| `$exception` | Worker | Сбои Sherpa (решено в [#11](https://github.com/igorkamyshev/roadtrip/issues/11)), ошибки расчёта, недоступность контейнера, необработанные ошибки Worker'а |

- Доля попаданий в кэш и время расчёта считаются графиками в PostHog по `ring computed`.
- Расход квоты Sherpa — это число `sherpa requested` за час против 1000 в час у тестового ключа. Заголовков с остатком лимита Sherpa на деле не присылает (исследование [#2](https://github.com/igorkamyshev/roadtrip/issues/2)), так что считаем вызовы сами.
- Тревоги настраивает владелец, они вне рамок.

## Риски и что проверить

- **Просмотры и `#…`.** На прототипе проверить во вкладке Network, что на загрузку приходится один `$pageview` и что в `$current_url` нет `#…`.
- **Шум от карты.** Тапы и жесты по холсту MapLibre могут давать `$dead_click` (если их включить в проекте) и `$rageclick` (быстрые тапы). Если шумно — классы `ph-no-deadclick` и `ph-no-rageclick` на контейнер карты ([autocapture](https://posthog.com/docs/product-analytics/autocapture)).
- **100 000 посещений не влезают в Free.** При росте трафика придётся решать: добавить карту и поставить лимит в долларах или урезать автосбор.
- **Персональный ключ** для source maps привязан к пользователю-владельцу и удаляется вместе с ним.
- **Стек ошибки из контейнера,** пересобранный в Worker, нужно проверить: разбирает ли его PostHog в кадры.
- **GeoIP по умолчанию** добавляет к событиям примерные координаты IP (`$geoip_latitude` и `$geoip_longitude`, уровень города). Это не точка старта, и решение «IP по умолчанию» принято в [#16](https://github.com/igorkamyshev/roadtrip/issues/16). Отключается это трансформацией GeoIP в проекте ([data collection](https://posthog.com/docs/privacy/data-collection)).
- **Частые релизы SDK.** `posthog-js` выходит почти каждый день, и PostHog просит его обновлять ([js](https://posthog.com/docs/libraries/js)). Версии фиксируем и обновляем осознанно.

## Рекомендация для спеки

1. **Браузер.**
   - `posthog-js` из npm, инициализация в точке входа до карты и только на боевом домене.
   - Настройки: `defaults: '2026-08-30'`, `api_host` — поддомен прокси, `ui_host: 'https://us.posthog.com'`, `capture_exceptions: true`, `disable_session_recording: true`, `tracing_headers: [<боевой домен>]`. Остальное по умолчанию.
   - Состояние ссылки пишем в `#…` через `history.replaceState`. Тогда просмотр страницы один на загрузку, а координаты в PostHog не уходят.
   - Обработанные ошибки (ответ API 5xx, `error` от MapLibre) отправляем через `posthog.captureException`.
2. **Source maps.**
   - `@posthog/rollup-plugin` в сборке Vite, версия релиза — git SHA. Деплоим ровно ту сборку, в которую плагин вписал `chunkId`.
   - Персональный API-ключ с правом «error tracking: write» и ID проекта лежат в секретах CI.
3. **Worker.**
   - `posthog-node` без `nodejs_compat`, клиент на каждый запрос с `flushAt: 1`, `flushInterval: 0` и `disabled` вне боевого домена.
   - Отправка — `captureImmediate` и `captureExceptionImmediate` в `ctx.waitUntil`, в конце `shutdown()`.
   - На каждом событии `$process_person_profile: false`.
   - `distinctId` и `$session_id` берём из заголовков `X-POSTHOG-*`, без них — случайный UUID.
   - Хост `https://us.i.posthog.com`.
   - Общий `try/catch` отправляет ошибку и отвечает 500. Координат в событиях и ошибках нет.
4. **Container.**
   - Сам в PostHog не ходит. Отдаёт `timings` в ответе, а при ошибке — `{ error: { name, message, stack } }` с кодом 500.
   - Worker отправляет `ring computed` и `$exception`.
   - Сборка без минификации.
5. **Прокси.**
   - Владелец создаёт управляемый прокси в настройках организации PostHog и CNAME в Cloudflare DNS с серым облаком. Поддомен с нейтральным именем.
   - В коде только `api_host` и `ui_host`. Если будет CSP, поддомен добавляем в `connect-src` и `script-src`.
6. **Ключи.**
   - Токен проекта (`phc_`) публичный: константа клиента и `vars` Worker'а, можно в репозитории. В блок `previews` его не копируем.
   - Единственный секрет — персональный ключ (`phx_`) в CI.
7. **Лимиты.**
   - Старт на бесплатном плане: 1 млн событий и 100 тыс. исключений в месяц, сверх лимита данные выбрасываются, $0.
   - Когда трафик подойдёт к ~50 000 посещений в месяц, решить: карта и лимиты в долларах на продукт или урезанный автосбор.
8. **Разработка.**
   - Один признак «боевой хост» включает PostHog и в клиенте, и в Worker. Отдельного проекта для разработки нет.
9. **События здоровья.**
   - `ring computed` и `sherpa requested` из Worker, `$exception` для сбоев.
   - Графики и тревоги строит владелец.
