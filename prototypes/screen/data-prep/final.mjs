import fs from 'fs';
const st = JSON.parse(fs.readFileSync('stage.json'));
const ru = JSON.parse(fs.readFileSync('ru.json')); const ovr = JSON.parse(fs.readFileSync('ovr.json'));
for (const c of st.cities) if (ovr[c.name] && (!ru[c.id] || c.name === 'Madrid')) ru[c.id] = ovr[c.name];
const cities = st.cities.sort((a, b) => b.pop - a.pop).map(c => [ru[c.id] || '', c.name === ru[c.id] ? '' : c.name, +c.lat.toFixed(3), +c.lon.toFixed(3), c.pop, c.c]);
const { countries, grid, cities: _, ...meta } = st;
const js = `// PROTOTYPE DATA: Natural Earth 1:50m (world-atlas), GeoNames cities15000 + Wikidata ru labels.\nwindow.RT_DATA = ${JSON.stringify({ meta, countries, grid, cities })};\n`;
fs.writeFileSync('data.js', js);
console.log('data.js', (js.length / 1024).toFixed(0), 'KB; paths', (countries.reduce((s, c) => s + c.d.length, 0) / 1024).toFixed(0), 'KB');
