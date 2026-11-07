import fs from 'fs';
const st = JSON.parse(fs.readFileSync('stage.json'));
const ids = st.cities.map(c => c.id);
const out = fs.existsSync('ru.json') ? JSON.parse(fs.readFileSync('ru.json')) : {};
const todo = ids.filter(i => !(i in out));
for (let k = 0; k < todo.length; k += 400) {
  const batch = todo.slice(k, k + 400);
  const q = `SELECT ?gn ?l WHERE { VALUES ?gn { ${batch.map(i => `"${i}"`).join(' ')} } ?it wdt:P1566 ?gn . ?it rdfs:label ?l FILTER(lang(?l)="ru") }`;
  const r = await fetch('https://query.wikidata.org/sparql', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/sparql-results+json', 'User-Agent': 'roadtrip-prototype/0.1' }, body: 'query=' + encodeURIComponent(q) });
  if (!r.ok) { console.error('fail', r.status); break; }
  const j = await r.json();
  for (const i of batch) out[i] = null;
  for (const b of j.results.bindings) { const p = out[b.gn.value]; if (!p || b.l.value.length < p.length) out[b.gn.value] = b.l.value; }
  console.error(k + batch.length, '/', todo.length);
}
fs.writeFileSync('ru.json', JSON.stringify(out));
const have = ids.filter(i => out[i]).length; console.error('ru names', have, 'of', ids.length);
