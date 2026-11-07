import fs from 'fs';
import * as topojson from 'topojson-client';
import * as d3 from 'd3-geo';

const LON0 = -11, LON1 = 52, LAT0 = 34, LAT1 = 64, RES = 0.2, K = 10;
const C = Math.cos(48 * Math.PI / 180);
const W = Math.round((LON1 - LON0) / RES), H = Math.round((LAT1 - LAT0) / RES);
const MW = (LON1 - LON0) * K * C, MH = (LAT1 - LAT0) * K;

// name in world-atlas -> [iso3, iso2 list, ru, schengen]
const T = {
  'Vatican': ['VAT', ['VA'], 'Ватикан', 1], 'United Kingdom': ['GBR', ['GB', 'JE', 'GG', 'IM'], 'Великобритания', 0],
  'Jersey': ['GBR'], 'Guernsey': ['GBR'], 'Isle of Man': ['GBR'],
  'Ukraine': ['UKR', ['UA'], 'Украина', 0], 'Turkey': ['TUR', ['TR'], 'Турция', 0], 'Tunisia': ['TUN', ['TN'], 'Тунис', 0],
  'Syria': ['SYR', ['SY'], 'Сирия', 0], 'Switzerland': ['CHE', ['CH'], 'Швейцария', 1], 'Sweden': ['SWE', ['SE'], 'Швеция', 1],
  'Spain': ['ESP', ['ES'], 'Испания', 1], 'Slovakia': ['SVK', ['SK'], 'Словакия', 1], 'Slovenia': ['SVN', ['SI'], 'Словения', 1],
  'Serbia': ['SRB', ['RS'], 'Сербия', 0], 'San Marino': ['SMR', ['SM'], 'Сан-Марино', 1], 'Russia': ['RUS', ['RU'], 'Россия', 0],
  'Romania': ['ROU', ['RO'], 'Румыния', 1], 'Portugal': ['PRT', ['PT'], 'Португалия', 1], 'Poland': ['POL', ['PL'], 'Польша', 1],
  'Norway': ['NOR', ['NO'], 'Норвегия', 1], 'Netherlands': ['NLD', ['NL'], 'Нидерланды', 1], 'Morocco': ['MAR', ['MA'], 'Марокко', 0],
  'Montenegro': ['MNE', ['ME'], 'Черногория', 0], 'Moldova': ['MDA', ['MD'], 'Молдова', 0], 'Monaco': ['MCO', ['MC'], 'Монако', 1],
  'Malta': ['MLT', ['MT'], 'Мальта', 1], 'Macedonia': ['MKD', ['MK'], 'Северная Македония', 0], 'Luxembourg': ['LUX', ['LU'], 'Люксембург', 1],
  'Lithuania': ['LTU', ['LT'], 'Литва', 1], 'Liechtenstein': ['LIE', ['LI'], 'Лихтенштейн', 1], 'Lebanon': ['LBN', ['LB'], 'Ливан', 0],
  'Latvia': ['LVA', ['LV'], 'Латвия', 1], 'Kosovo': ['XKX', ['XK'], 'Косово', 0], 'Kazakhstan': ['KAZ', ['KZ'], 'Казахстан', 0],
  'Italy': ['ITA', ['IT'], 'Италия', 1], 'Ireland': ['IRL', ['IE'], 'Ирландия', 0], 'Iraq': ['IRQ', ['IQ'], 'Ирак', 0],
  'Iran': ['IRN', ['IR'], 'Иран', 0], 'Hungary': ['HUN', ['HU'], 'Венгрия', 1], 'Greece': ['GRC', ['GR'], 'Греция', 1],
  'Germany': ['DEU', ['DE'], 'Германия', 1], 'Georgia': ['GEO', ['GE'], 'Грузия', 0], 'France': ['FRA', ['FR'], 'Франция', 1],
  'Åland': ['FIN'], 'Finland': ['FIN', ['FI', 'AX'], 'Финляндия', 1], 'Estonia': ['EST', ['EE'], 'Эстония', 1],
  'Faeroe Is.': ['DNK'], 'Denmark': ['DNK', ['DK', 'FO'], 'Дания', 1], 'Czechia': ['CZE', ['CZ'], 'Чехия', 1],
  'N. Cyprus': ['CYP'], 'Cyprus': ['CYP', ['CY'], 'Кипр', 0], 'Croatia': ['HRV', ['HR'], 'Хорватия', 1],
  'Bulgaria': ['BGR', ['BG'], 'Болгария', 1], 'Bosnia and Herz.': ['BIH', ['BA'], 'Босния и Герцеговина', 0],
  'Belgium': ['BEL', ['BE'], 'Бельгия', 1], 'Belarus': ['BLR', ['BY'], 'Беларусь', 0], 'Azerbaijan': ['AZE', ['AZ'], 'Азербайджан', 0],
  'Austria': ['AUT', ['AT'], 'Австрия', 1], 'Armenia': ['ARM', ['AM'], 'Армения', 0], 'Andorra': ['AND', ['AD'], 'Андорра', 1],
  'Algeria': ['DZA', ['DZ'], 'Алжир', 0], 'Albania': ['ALB', ['AL'], 'Албания', 0],
};

const topo = JSON.parse(fs.readFileSync('package/countries-50m.json'));
const fc = topojson.feature(topo, topo.objects.countries);
const proj = d3.geoProjection((l, p) => [l * C, p]).scale(K * 180 / Math.PI)
  .translate([-K * LON0 * C, K * LAT1]).clipExtent([[-4, -4], [MW + 4, MH + 4]]).precision(0.2);

const countries = []; const byIso = {};
for (const [name, v] of Object.entries(T)) if (v.length > 1) {
  byIso[v[0]] = countries.length + 1;
  countries.push({ iso: v[0], iso2: v[1], ru: v[2], sch: v[3], rings: [], d: '' });
}
for (const f of fc.features) {
  const v = T[f.properties.name]; if (!v) continue;
  const c = countries[byIso[v[0]] - 1];
  // collect planar rings
  let cur = null;
  const ctx = { moveTo(x, y) { cur = [[x, y]]; c.rings.push(cur); }, lineTo(x, y) { cur.push([x, y]); }, closePath() {}, arc() {}, rect() {} };
  d3.geoPath(proj, ctx)(f);
  c.d += d3.geoPath(proj).digits(1)(f) || '';
}
for (const c of countries) c.rings = c.rings.filter(r => r.length > 2).map(r => {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, a = 0, cx = 0, cy = 0;
  for (let i = 0; i < r.length; i++) { const [x, y] = r[i], [x2, y2] = r[(i + 1) % r.length];
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
    const cr = x * y2 - x2 * y; a += cr; cx += (x + x2) * cr; cy += (y + y2) * cr; }
  return { r, b: [x0, y0, x1, y1], a: a / 2, cx: cx / (3 * a), cy: cy / (3 * a) };
});
// label point = centroid of largest ring
for (const c of countries) { let best = null; for (const r of c.rings) if (!best || Math.abs(r.a) > Math.abs(best.a)) best = r;
  c.label = best ? [+best.cx.toFixed(1), +best.cy.toFixed(1)] : null; c.area = c.rings.reduce((s, r) => s + Math.abs(r.a), 0); }

function pip(c, x, y) { let inside = false;
  for (const { r, b } of c.rings) { if (x < b[0] || x > b[2] || y < b[1] || y > b[3]) continue;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, yi] = r[i], [xj, yj] = r[j];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside; } }
  return inside; }
const order = countries.map((c, i) => i).sort((a, b) => countries[a].area - countries[b].area);
const grid = new Uint8Array(W * H);
for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
  const x = (i + 0.5) * RES * K * C, y = (j + 0.5) * RES * K;
  for (const k of order) if (pip(countries[k], x, y)) { grid[j * W + i] = k + 1; break; }
}
console.error('grid', W, H, 'land', grid.filter(v => v).length);

// cities
const iso2 = {}; countries.forEach((c, i) => c.iso2.forEach(s => iso2[s] = i + 1));
const lines = fs.readFileSync('cities15000.txt', 'utf8').split('\n');
let cities = [];
for (const L of lines) { const f = L.split('\t'); if (f.length < 15) continue;
  const lat = +f[4], lon = +f[5], cc = f[8], pop = +f[14], fcode = f[7];
  if (lat < LAT0 || lat > LAT1 || lon < LON0 || lon > LON1) continue;
  if (!iso2[cc] || pop < 15000 || ['PPLX', 'PPLH', 'PPLQ', 'PPLW'].includes(fcode)) continue;
  cities.push({ id: f[0], name: f[1], lat, lon, pop, c: iso2[cc] }); }
console.error('cities', cities.length);
fs.writeFileSync('stage.json', JSON.stringify({ LON0, LON1, LAT0, LAT1, RES, K, C, W, H, MW, MH,
  countries: countries.map(c => ({ iso: c.iso, ru: c.ru, sch: c.sch, d: c.d, label: c.label })),
  grid: Buffer.from(grid).toString('base64'), cities }));
