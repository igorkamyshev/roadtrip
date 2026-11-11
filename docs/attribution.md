# Attribution

What each source of the site's data asks for its credit, in its own words, and how the screen meets it (#46). The credit is one line, `DataSources` in `web/src/screen/attribution.tsx`: in ⓘ «Что важно знать» always, and under the phrase for 5 s once the screen opens (`SourcesOnOpen`). Checked on 2026-11-09; a new source of data adds its section here and its link to that line.

## OpenStreetMap (ODbL)

The basemap's data. The [OSMF Attribution Guidelines](https://osmfoundation.org/wiki/Licence/Attribution_Guidelines) (adopted 2021-06-25), the way to meet ODbL 4.3's notice «reasonably calculated to make any Person that uses, views, accesses, interacts with, or is otherwise exposed to the Produced Work aware»:

- **Seen without a tap.** «The attribution format should not require individuals to interact with the map or produced work to see the attribution.» A credit only in ⓘ falls short of this.
- **Where.** «For a browsable map … the credit should typically appear in a corner of the map», or «adjacent to the map or on a splash screen or pop-up shown when a user starts the app, device, website, etc.»
- **Folding.** Allowed only after it was shown: «immediately with a dismiss interaction», «automatically on map interaction such as panning, clicking, or zooming», «automatically after five seconds». Then «the user must still be able to find the licence information if they look for it, for example from an '(i)' button in the corner of the map or an 'About' option in a menu.»
- **Words and link.** «Attribution must be to "OpenStreetMap"», and it must say the data is under the ODbL, which «may be done by making the text "OpenStreetMap" a link to openstreetmap.org/copyright». «© OpenStreetMap» is acceptable too.

The screen: the line under the phrase for 5 s, then ⓘ; «OpenStreetMap» links `https://www.openstreetmap.org/copyright`.

## Protomaps

The tiles (Protomaps' daily build) and the style `@protomaps/basemaps` (BSD-3). [Its README](https://github.com/protomaps/basemaps): «We kindly request that you attribute the Protomaps project if you use the basemap styles unmodified or with additions, but you are not required to do so.» The tiles are an ODbL Produced Work, so OpenStreetMap's credit is the one required. We credit Protomaps anyway.

## ESA WorldCover (CC BY 4.0)

The land cover of the `light` and `dark` flavors (the `landcover` layer, z0–7): «landcover is derived from the ESA WorldCover dataset, available under CC-BY 4.0» (`LICENSE_DATA.md` of protomaps/basemaps). [ESA](https://esa-worldcover.org/en/data-access) asks a published map to credit it. The line: «ESA WorldCover (CC BY 4.0)», each a link.

## GeoNames (CC BY 4.0)

The cities file. [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/legalcode.en) §3(a) asks to name the source, link the licence and «indicate if You modified the Licensed Material»: the file keeps the places of 15 000 people and more and fills a missing Russian name from Wikidata or our table of Russian names, hence «с изменениями». It may be met «in any reasonable manner based on the medium, means, and context», so ⓘ alone would do; the line shows it with the rest.

## Wikidata (CC0)

The places file (ADR 0003): which objects of OSM are places, their fame by the sitelinks of Wikidata's dump `wb_items_per_site`, their Russian and English labels and points, and a city's Russian label where GeoNames has none. [Wikidata's data is CC0](https://www.wikidata.org/wiki/Wikidata:Licensing): «All structured data in the main, property and lexeme namespaces is made available under the Creative Commons CC0 License», so no credit is required. A place's Russian name may be the title of its article in ruwiki, a name and no work of authorship. The places themselves are OSM's objects, whose credit the line gives already. Whether the line names Wikidata too is for the screen's ticket of the places (#160).

## MapLibre (BSD-3)

Nothing on the map: «Showing the logo of MapLibre is not required for using MapLibre» (`MapOptions.attributionControl`). The control is off (`attributionControl: false`, `web/src/map/use-map.ts`); the licence travels with the bundle.

## Sherpa

The visa rules. The line names it as their source ([spec #20](specs/20.md) «ⓘ «Что важно знать»»).
