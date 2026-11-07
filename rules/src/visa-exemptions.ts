// The visa exemptions' table, edited by hand (spec «Визовые правила и сведение»; #9, #11): which countries let in a
// holder of a visa or residence permit of Schengen, the USA, the UK or Canada whose citizenship needs a visa of its
// own. Its schema is `VisaExemption` in index.ts; `pnpm test` checks it with visaExemptionsProblems. It deploys
// with the Worker, and the client bundles it for the sheet «Мои визы». The monthly review of the table:
// docs/agents/visa-exemptions-review.md.
//
// The rows come from research/visa-exemptions (#9), all checked 2026-11-07: a row for each of the four visas a
// country names, where it gives entry without a visa or an e-visa (an ETA or Taiwan's TAC too). With #11:
// - A visa and a residence permit are one held visa, and the conditions are for people only: a row stands where
//   either one opens the country, as with Armenia (residence permits only) and the UK for Costa Rica.
// - Citizenships are listed where the source lists them: ARM, CRI, COL, PER, ARG, and MDA, IRL, TWN, PHL too.
// - A last day where the source sets one: MKD for the visas of the USA, the UK and Canada, ARM.
//
// Left out, until a source says more (the monthly review looks for one):
// - RKS: closed for everyone (#13). Its rule is SCHENGEN, visa-free for 15 days (multiple-entry visa or biometric
//   residence permit; https://ambasadat.net/vizat/).
// - TUR: a conditional e-visa for 16 citizenships, some of whom must fly certain airlines; by car not confirmed.
// - EGY, ARE: a visa on arrival, at airports only; the table has no such mode.
// - GTM, HND, SLV, DOM, SAU, QAT, OMN: secondary sources only (Wikipedia, Fragomen, news); GTM, HND and OMN
//   also for groups of citizenships no source lists.
// - GIB, MCO, SMR and VAT need no rows: they are in the Schengen area (schengen.ts), which SCHENGEN opens.
import type { VisaExemption } from './index.ts';
import { SHERPA_PASSPORTS } from './passports.ts';

const CHECKED = '2026-11-07';

const ALB = ['https://punetejashtme.gov.al/wp-content/uploads/2024/09/II-NR.3-REGJIMI-I-VIZAVE-PER-TE-HUAJT-INFO-PER-TE-HUAJT.pdf'];
const AND = ['https://www.gov.uk/foreign-travel-advice/andorra/entry-requirements'];
const MKD = ['https://mfa.gov.mk/en-GB/konzularni-uslugi/informacii-za-vlez-vo-rsm'];
const MNE = ['https://www.sluzbenilist.me/propisi/399550'];
const SRB = ['https://mfa.gov.rs/en/citizens/travel-serbia/visa-requirements', 'https://mfa.rs/en/citizens/frequently-asked-questions'];
const BIH = [
	'https://www.paragraf.ba/dnevne-vijesti/06092017/06092017-vijest1.html',
	'https://sps.gov.ba/en/information-for-foreigners/entry-of-aliens-to-bih/',
];
const MDA = ['https://www.mfa.gov.md/en/content/types-visas-requirements'];
const CYP = ['https://www.legislation.gov.uk/eudn/2014/565/body', 'https://home-affairs.ec.europa.eu/policies/schengen/schengen-area_en'];
const IRL = ['https://www.irishimmigration.ie/coming-to-visit-ireland/short-stay-visa-waiver-programme/'];
const GEO = ['https://matsne.gov.ge/en/document/view/2867377', 'https://matsne.gov.ge/ka/document/view/6478000'];
const ARM = [
	'https://www.mfa.am/en/visa/',
	'https://www.mfa.am/filemanager/consular/visa/2025/2026-06-30-LIST-OF-COUNTRIES-TEMPORARY-VISA-EXEMPTION.pdf',
];
const MAR = ['https://diplomatie.ma/en/launch-electronic-visa-evisa', 'https://in.diplomatie.ma/en/e-visa-0'];
const MEX = ['https://www.gob.mx/cms/uploads/attachment/file/793747/2023_GUIA_DEL_VIAJERO_No_Visa.pdf'];
const BLZ = ['https://www.agm.gov.bz/uploads/laws/68a7629377086_CAP_156s_Immigration_Act.pdf'];
const CRI = ['https://www.imprentanacional.go.cr/pub/2025/11/17/ALCA148_17_11_2025.pdf'];
const PAN = [
	'https://www.embassyofpanama.org/visas-1',
	'https://www.migracion.gob.pa/wp-content/uploads/DECRETO-EJECUTIVO-196-DE-28-DE-OCTUBRE-DE-2024-QUE-MODIFICA-EL-ARTICULO-2-DEL-DECRETO-EJECUTIVO-521-DE-06-DE-AGOSTO-DE-2018.pdf',
];
const COL = [
	'https://cancilleria.gov.co/sites/default/files/DOCUMENTOS-2026/Visas/Lista-Paises-exigen-visa-mayo-2026.pdf',
	'https://cancilleria.gov.co/sites/default/files/FOTOS2024/INFORMACI%C3%93N%20DE%20INGRESO%20A%20COLOMBIA%20Y%20VISA%20DE%20CORTES%C3%8DA%20(1).pdf',
];
const PER = ['https://busquedas.elperuano.pe/dispositivo/NL/1423003-3', 'https://andina.pe/ingles/noticia.aspx?id=656746'];
const ARG = ['https://www.argentina.gob.ar/normativa/nacional/norma-415345/texto'];
const TWN = ['https://www.boca.gov.tw/cp-220-1885-b6ae7-2.html'];
const PHL = [
	'https://mb.com.ph/2025/06/07/ph-allows-visa-free-entry-for-indian-tourists',
	'https://newdelhipe.dfa.gov.ph/index.php/newsroom/announcements/951-ajacssuk',
];

/** Moldova's 30 citizenships marked [2] in the MFA's list of those who need a visa. */
const MDA_CITIZENSHIPS = [
	'BHR', 'BLZ', 'BOL', 'CHN', 'COM', 'CPV', 'CUB', 'DOM', 'ECU', 'FJI', 'GAB', 'GUY', 'HTI', 'IND', 'JAM', 'KHM', 'KWT',
	'MDG', 'MDV', 'MNG', 'NRU', 'OMN', 'PNG', 'QAT', 'SAU', 'STP', 'SWZ', 'TGO', 'THA', 'ZAF',
];

/** Every citizenship but those of Turkey and Azerbaijan, whose documents Cyprus does not recognise. */
const CYP_CITIZENSHIPS = SHERPA_PASSPORTS.filter((code) => code !== 'TUR' && code !== 'AZE');

/** The 22 citizenships of Ireland's Short-Stay Visa Waiver Programme. */
const IRL_CITIZENSHIPS = [
	'BHR', 'BIH', 'CHN', 'COL', 'IDN', 'IND', 'KAZ', 'KWT', 'MKD', 'MNE', 'OMN', 'PER', 'PHL', 'QAT', 'RKS', 'SAU', 'SRB',
	'THA', 'TUR', 'UKR', 'UZB', 'VNM',
];

/** The 111 countries of the MFA of Armenia's list of 2026-06-30 (with North Korea, which Sherpa has no passport of). */
const ARM_CITIZENSHIPS = [
	'AGO', 'ATG', 'BDI', 'BEN', 'BFA', 'BHS', 'BIH', 'BLZ', 'BOL', 'BRN', 'BTN', 'BWA', 'CAF', 'CAN', 'CHL', 'CIV', 'CMR',
	'COD', 'COG', 'COL', 'COM', 'CPV', 'CRI', 'CUB', 'DJI', 'DMA', 'DOM', 'DZA', 'EGY', 'ERI', 'ETH', 'FJI', 'FSM', 'GAB',
	'GHA', 'GIN', 'GMB', 'GNB', 'GNQ', 'GRD', 'GTM', 'GUY', 'HND', 'HTI', 'IDN', 'IND', 'IRQ', 'ISR', 'JAM', 'JOR', 'KEN',
	'KHM', 'KIR', 'KNA', 'LAO', 'LBN', 'LBR', 'LBY', 'LCA', 'LKA', 'MAR', 'MDG', 'MDV', 'MEX', 'MKD', 'MLI', 'MNG', 'MOZ',
	'MRT', 'MUS', 'MWI', 'MYS', 'NAM', 'NER', 'NIC', 'NPL', 'NRU', 'PAK', 'PER', 'PHL', 'PLW', 'PRK', 'PRY', 'PSE', 'RWA',
	'SEN', 'SLB', 'SLE', 'SLV', 'SOM', 'SUR', 'SWZ', 'SYC', 'SYR', 'TCD', 'TGO', 'THA', 'TKM', 'TLS', 'TTO', 'TUN', 'TUV',
	'TZA', 'UGA', 'VCT', 'VEN', 'VNM', 'VUT', 'ZAF', 'ZMB', 'ZWE',
];

/**
 * Costa Rica's groups 3 (consular visa, 79) and 4 (restricted visa, 23) of the Directrices of 2025-11-17, «SEGUNDO»;
 * Western Sahara as ESH and North Korea, which Sherpa has no passports of, included. Russians are in group 2.
 */
const CRI_CITIZENSHIPS = [
	'AFG', 'AGO', 'ALB', 'ARM', 'AZE', 'BDI', 'BEN', 'BFA', 'BGD', 'BHR', 'BIH', 'BLR', 'BTN', 'BWA', 'CAF', 'CHN', 'CIV',
	'CMR', 'COD', 'COG', 'COL', 'COM', 'CPV', 'CUB', 'DJI', 'DOM', 'DZA', 'ECU', 'EGY', 'ERI', 'ESH', 'ETH', 'GAB', 'GEO',
	'GHA', 'GIN', 'GMB', 'GNB', 'GNQ', 'HTI', 'IDN', 'IND', 'IRN', 'IRQ', 'JAM', 'JOR', 'KAZ', 'KEN', 'KGZ', 'KHM', 'KWT',
	'LAO', 'LBN', 'LBR', 'LBY', 'LKA', 'LSO', 'MAR', 'MDA', 'MDG', 'MKD', 'MLI', 'MMR', 'MNG', 'MOZ', 'MRT', 'MWI', 'NAM',
	'NER', 'NGA', 'NIC', 'NPL', 'OMN', 'PAK', 'PNG', 'PRK', 'PSE', 'RKS', 'RWA', 'SAU', 'SDN', 'SEN', 'SLE', 'SOM', 'SSD',
	'SWZ', 'SYR', 'TCD', 'TGO', 'THA', 'TJK', 'TKM', 'TLS', 'TUN', 'TZA', 'UGA', 'UZB', 'VEN', 'VNM', 'YEM', 'ZMB', 'ZWE',
];

/** Colombia's: CHN, IND, KHM, MMR, THA, TWN and VNM (Cancillería, May 2026). */
const COL_CITIZENSHIPS = ['CHN', 'IND', 'KHM', 'MMR', 'THA', 'TWN', 'VNM'];

/** Taiwan's TAC: seven of South-East and South Asia. */
const TWN_CITIZENSHIPS = ['IDN', 'IND', 'KHM', 'LAO', 'MMR', 'PHL', 'VNM'];

export const VISA_EXEMPTIONS: readonly VisaExemption[] = [
	// The Balkans, Moldova, Cyprus and Ireland.
	{
		country: 'ALB',
		visa: 'SCHENGEN',
		gives: 'visa_free',
		conditions: 'Многократная виза, уже использованная для въезда в Шенген, или действующий ВНЖ.',
		checked: CHECKED,
		sources: ALB,
	},
	{
		country: 'ALB',
		visa: 'USA',
		gives: 'visa_free',
		conditions: 'Многократная виза, уже использованная для въезда в США, или действующий ВНЖ.',
		checked: CHECKED,
		sources: ALB,
	},
	{
		country: 'ALB',
		visa: 'GBR',
		gives: 'visa_free',
		conditions: 'Многократная виза, уже использованная для въезда в Великобританию, или действующий ВНЖ.',
		checked: CHECKED,
		sources: ALB,
	},
	{
		country: 'AND',
		visa: 'SCHENGEN',
		gives: 'visa_free',
		conditions:
			'Своих виз у Андорры нет, въезд только через Францию или Испанию, а возврат — новый въезд в Шенген: нужна виза на 2 и больше въезда или ВНЖ.',
		checked: CHECKED,
		sources: AND,
	},
	{
		country: 'MKD',
		visa: 'SCHENGEN',
		gives: 'visa_free',
		conditions: 'Многократная виза C, действует на 5 дней дольше поездки, или ВНЖ. До 15 дней за въезд, не больше 90 дней из 180.',
		checked: CHECKED,
		sources: MKD,
	},
	{
		country: 'MKD',
		visa: 'USA',
		gives: 'visa_free',
		until: '2026-12-31',
		conditions: 'Многократная виза в паспорте, действует на 5 дней дольше поездки; ВНЖ не назван. До 15 дней за въезд. Временно, с 01.01.2026 по 31.12.2026.',
		checked: CHECKED,
		sources: MKD,
	},
	{
		country: 'MKD',
		visa: 'GBR',
		gives: 'visa_free',
		until: '2026-12-31',
		conditions: 'Многократная виза в паспорте, действует на 5 дней дольше поездки; ВНЖ не назван. До 15 дней за въезд. Временно, с 01.01.2026 по 31.12.2026.',
		checked: CHECKED,
		sources: MKD,
	},
	{
		country: 'MKD',
		visa: 'CAN',
		gives: 'visa_free',
		until: '2026-12-31',
		conditions: 'Многократная виза в паспорте, действует на 5 дней дольше поездки; ВНЖ не назван. До 15 дней за въезд. Временно, с 01.01.2026 по 31.12.2026.',
		checked: CHECKED,
		sources: MKD,
	},
	{
		country: 'MNE',
		visa: 'SCHENGEN',
		gives: 'visa_free',
		conditions: 'Действующая виза любого типа или ВНЖ. До 30 дней, не дольше срока визы. Декрет действует с 01.11.2026.',
		checked: CHECKED,
		sources: MNE,
	},
	{
		country: 'MNE',
		visa: 'USA',
		gives: 'visa_free',
		conditions: 'Действующая виза любого типа или ВНЖ. До 30 дней, не дольше срока визы. Декрет действует с 01.11.2026.',
		checked: CHECKED,
		sources: MNE,
	},
	{
		country: 'MNE',
		visa: 'GBR',
		gives: 'visa_free',
		conditions: 'Действующая виза любого типа или ВНЖ. До 30 дней, не дольше срока визы. Декрет действует с 01.11.2026.',
		checked: CHECKED,
		sources: MNE,
	},
	{
		country: 'MNE',
		visa: 'CAN',
		gives: 'visa_free',
		conditions: 'Действующая виза любого типа или ВНЖ. До 30 дней, не дольше срока визы. Декрет действует с 01.11.2026.',
		checked: CHECKED,
		sources: MNE,
	},
	{
		country: 'SRB',
		visa: 'SCHENGEN',
		gives: 'visa_free',
		conditions: 'Действующая виза или ВНЖ, многократность не нужна. До 90 дней из 180, не дольше срока визы.',
		checked: CHECKED,
		sources: SRB,
	},
	{
		country: 'SRB',
		visa: 'USA',
		gives: 'visa_free',
		conditions: 'Действующая виза или ВНЖ, многократность не нужна. До 90 дней из 180, не дольше срока визы.',
		checked: CHECKED,
		sources: SRB,
	},
	{
		country: 'SRB',
		visa: 'GBR',
		gives: 'visa_free',
		conditions: 'Действующая виза, многократность не нужна; ВНЖ Великобритании прямо не назван. До 90 дней из 180, не дольше срока визы.',
		checked: CHECKED,
		sources: SRB,
	},
	{
		country: 'BIH',
		visa: 'SCHENGEN',
		gives: 'visa_free',
		conditions: 'Многократная действующая виза или ВНЖ. 90 дней из 180, за один раз не больше 30.',
		checked: CHECKED,
		sources: BIH,
		notes: 'The MFA site was unreachable: the government decision of 2017 as paragraf.ba retells it, and the service for foreigners.',
	},
	{
		country: 'BIH',
		visa: 'USA',
		gives: 'visa_free',
		conditions: 'Многократная действующая виза или ВНЖ. 90 дней из 180, за один раз не больше 30.',
		checked: CHECKED,
		sources: BIH,
		notes: 'The MFA site was unreachable: the government decision of 2017 as paragraf.ba retells it, and the service for foreigners.',
	},
	{
		country: 'MDA',
		visa: 'SCHENGEN',
		gives: 'visa_free',
		citizenships: MDA_CITIZENSHIPS,
		conditions: 'Действующая виза, кроме транзитной, или ВНЖ. Только для 30 гражданств из сноски [2] списка МИД.',
		checked: CHECKED,
		sources: MDA,
		notes: 'The page has no date; some of the 30 may be visa-free by now.',
	},
	{
		country: 'MDA',
		visa: 'USA',
		gives: 'visa_free',
		citizenships: MDA_CITIZENSHIPS,
		conditions: 'Действующая виза, кроме транзитной, или ВНЖ. Только для 30 гражданств из сноски [2] списка МИД.',
		checked: CHECKED,
		sources: MDA,
		notes: 'The page has no date; some of the 30 may be visa-free by now.',
	},
	{
		country: 'MDA',
		visa: 'GBR',
		gives: 'visa_free',
		citizenships: MDA_CITIZENSHIPS,
		conditions: 'Действующая виза, кроме транзитной, или ВНЖ. Только для 30 гражданств из сноски [2] списка МИД.',
		checked: CHECKED,
		sources: MDA,
		notes: 'The page has no date; some of the 30 may be visa-free by now.',
	},
	{
		country: 'MDA',
		visa: 'CAN',
		gives: 'visa_free',
		citizenships: MDA_CITIZENSHIPS,
		conditions: 'Действующая виза, кроме транзитной, или ВНЖ. Только для 30 гражданств из сноски [2] списка МИД.',
		checked: CHECKED,
		sources: MDA,
		notes: 'The page has no date; some of the 30 may be visa-free by now.',
	},
	{
		country: 'CYP',
		visa: 'SCHENGEN',
		gives: 'visa_free',
		citizenships: CYP_CITIZENSHIPS,
		conditions: 'Виза на 2 и больше въезда, национальная виза D или ВНЖ. Не для граждан Турции и Азербайджана. 90 дней из 180.',
		checked: CHECKED,
		sources: CYP,
		notes: 'Decision 565/2014/EU applies until the Council lets Cyprus into Schengen in full.',
	},
	{
		country: 'IRL',
		visa: 'GBR',
		gives: 'visa_free',
		citizenships: IRL_CITIZENSHIPS,
		conditions:
			'Краткосрочная британская виза C, и сначала въезд в Великобританию по ней; не ETA, не виза D. Только для 22 гражданств программы, до конца британского разрешения.',
		checked: CHECKED,
		sources: IRL,
	},

	// The Caucasus.
	{
		country: 'GEO',
		visa: 'SCHENGEN',
		gives: 'visa_free',
		conditions: 'Виза или ВНЖ, действующие в день въезда. 90 дней из 180.',
		checked: CHECKED,
		sources: GEO,
	},
	{
		country: 'GEO',
		visa: 'USA',
		gives: 'visa_free',
		conditions: 'Виза или ВНЖ, действующие в день въезда. 90 дней из 180.',
		checked: CHECKED,
		sources: GEO,
	},
	{
		country: 'GEO',
		visa: 'GBR',
		gives: 'visa_free',
		conditions: 'Виза или ВНЖ, действующие в день въезда. 90 дней из 180.',
		checked: CHECKED,
		sources: GEO,
	},
	{
		country: 'GEO',
		visa: 'CAN',
		gives: 'visa_free',
		conditions: 'Виза или ВНЖ, действующие в день въезда. 90 дней из 180.',
		checked: CHECKED,
		sources: GEO,
	},
	{
		country: 'ARM',
		visa: 'SCHENGEN',
		gives: 'visa_free',
		until: '2027-07-01',
		citizenships: ARM_CITIZENSHIPS,
		conditions:
			'Только ВНЖ, не виза: действует ещё 6 месяцев с даты въезда, данные латиницей. До 180 дней в году. Временно, с 01.07.2026 по 01.07.2027, для граждан 111 стран из списка МИД.',
		checked: CHECKED,
		sources: ARM,
	},
	{
		country: 'ARM',
		visa: 'USA',
		gives: 'visa_free',
		until: '2027-07-01',
		citizenships: ARM_CITIZENSHIPS,
		conditions:
			'Только ВНЖ, не виза: действует ещё 6 месяцев с даты въезда, данные латиницей. До 180 дней в году. Временно, с 01.07.2026 по 01.07.2027, для граждан 111 стран из списка МИД.',
		checked: CHECKED,
		sources: ARM,
	},

	// Morocco, by car from Ceuta and Melilla.
	{
		country: 'MAR',
		visa: 'SCHENGEN',
		gives: 'evisa',
		conditions:
			'Электронная виза AEVM на 30 дней. Виза не электронная, многократная, действует ещё 90 дней на дату заявки; или ВНЖ страны ЕС, действующий ещё 180 дней.',
		checked: CHECKED,
		sources: MAR,
		notes: 'The MFA text is of 2022; the list of citizenships has grown since.',
	},
	{
		country: 'MAR',
		visa: 'USA',
		gives: 'evisa',
		conditions: 'Электронная виза AEVM на 30 дней. Виза не электронная, многократная, действует ещё 90 дней на дату заявки; или ВНЖ, действующий ещё 180 дней.',
		checked: CHECKED,
		sources: MAR,
		notes: 'The MFA text is of 2022; the list of citizenships has grown since.',
	},
	{
		country: 'MAR',
		visa: 'GBR',
		gives: 'evisa',
		conditions: 'Электронная виза AEVM на 30 дней. Виза не электронная, многократная, действует ещё 90 дней на дату заявки; или ВНЖ, действующий ещё 180 дней.',
		checked: CHECKED,
		sources: MAR,
		notes: 'The MFA text is of 2022; the list of citizenships has grown since.',
	},
	{
		country: 'MAR',
		visa: 'CAN',
		gives: 'evisa',
		conditions: 'Электронная виза AEVM на 30 дней. Виза не электронная, многократная, действует ещё 90 дней на дату заявки; или ВНЖ, действующий ещё 180 дней.',
		checked: CHECKED,
		sources: MAR,
		notes: 'The MFA text is of 2022; the list of citizenships has grown since.',
	},

	// The Americas, on the road from the USA to Panama, and South America.
	{
		country: 'MEX',
		visa: 'SCHENGEN',
		gives: 'visa_free',
		conditions: 'Действующая виза или постоянный ВНЖ; временный ВНЖ не подходит. До 180 дней.',
		checked: CHECKED,
		sources: MEX,
		notes: "INM's guide of 2023; the consulates' pages are behind a bot wall.",
	},
	{
		country: 'MEX',
		visa: 'USA',
		gives: 'visa_free',
		conditions: 'Действующая виза или постоянный ВНЖ; временный ВНЖ не подходит. До 180 дней.',
		checked: CHECKED,
		sources: MEX,
		notes: "INM's guide of 2023; the consulates' pages are behind a bot wall.",
	},
	{
		country: 'MEX',
		visa: 'GBR',
		gives: 'visa_free',
		conditions: 'Действующая виза или постоянный ВНЖ; временный ВНЖ не подходит. До 180 дней.',
		checked: CHECKED,
		sources: MEX,
		notes: "INM's guide of 2023; the consulates' pages are behind a bot wall.",
	},
	{
		country: 'MEX',
		visa: 'CAN',
		gives: 'visa_free',
		conditions: 'Действующая виза или постоянный ВНЖ; временный ВНЖ не подходит. До 180 дней.',
		checked: CHECKED,
		sources: MEX,
		notes: "INM's guide of 2023; the consulates' pages are behind a bot wall.",
	},
	{
		country: 'BLZ',
		visa: 'SCHENGEN',
		gives: 'visa_free',
		conditions: 'Любая действующая шенгенская виза или ПМЖ (карта). До 90 дней.',
		checked: CHECKED,
		sources: BLZ,
	},
	{
		country: 'BLZ',
		visa: 'USA',
		gives: 'visa_free',
		conditions: 'Многократная виза или ПМЖ (карта).',
		checked: CHECKED,
		sources: BLZ,
	},
	{
		country: 'BLZ',
		visa: 'CAN',
		gives: 'visa_free',
		conditions: 'Многократная виза или ПМЖ (карта).',
		checked: CHECKED,
		sources: BLZ,
	},
	{
		country: 'CRI',
		visa: 'SCHENGEN',
		gives: 'visa_free',
		citizenships: CRI_CITIZENSHIPS,
		conditions:
			'Многократная шенгенская виза C или D, действует ещё день с даты въезда, или ВНЖ страны ЕС, Исландии, Норвегии, Швейцарии. Только для граждан групп 3 и 4 директивы 2025 года.',
		checked: CHECKED,
		sources: CRI,
	},
	{
		country: 'CRI',
		visa: 'USA',
		gives: 'visa_free',
		citizenships: CRI_CITIZENSHIPS,
		conditions:
			'Многократная виза или ВНЖ любой категории, действует ещё день с даты въезда; транзитные визы C1, C2, C3 не подходят. Только для граждан групп 3 и 4 директивы 2025 года.',
		checked: CHECKED,
		sources: CRI,
	},
	{
		country: 'CRI',
		visa: 'GBR',
		gives: 'visa_free',
		citizenships: CRI_CITIZENSHIPS,
		conditions:
			'Только ВНЖ, британская виза не подходит: многократный или действует ещё 90 дней. Только для граждан групп 3 и 4 директивы 2025 года.',
		checked: CHECKED,
		sources: CRI,
	},
	{
		country: 'CRI',
		visa: 'CAN',
		gives: 'visa_free',
		citizenships: CRI_CITIZENSHIPS,
		conditions:
			'Многократная виза или ВНЖ любой категории, действует ещё день с даты въезда. Только для граждан групп 3 и 4 директивы 2025 года.',
		checked: CHECKED,
		sources: CRI,
	},
	{
		country: 'PAN',
		visa: 'SCHENGEN',
		gives: 'visa_free',
		conditions:
			'Действующая виза или ВНЖ государства ЕС (не Швейцарии, Норвегии, Исландии, Лихтенштейна); многократность не нужна с 28.10.2024. При себе от 500 USD.',
		checked: CHECKED,
		sources: PAN,
		notes: 'The decree of 2024 did not open; the embassy in the USA retells it.',
	},
	{
		country: 'PAN',
		visa: 'USA',
		gives: 'visa_free',
		conditions: 'Действующая виза или ВНЖ; многократность не нужна с 28.10.2024. При себе от 500 USD.',
		checked: CHECKED,
		sources: PAN,
		notes: 'The decree of 2024 did not open; the embassy in the USA retells it.',
	},
	{
		country: 'PAN',
		visa: 'GBR',
		gives: 'visa_free',
		conditions: 'Действующая виза или ВНЖ; многократность не нужна с 28.10.2024. При себе от 500 USD.',
		checked: CHECKED,
		sources: PAN,
		notes: 'The decree of 2024 did not open; the embassy in the USA retells it.',
	},
	{
		country: 'PAN',
		visa: 'CAN',
		gives: 'visa_free',
		conditions: 'Действующая виза или ВНЖ; многократность не нужна с 28.10.2024. При себе от 500 USD.',
		checked: CHECKED,
		sources: PAN,
		notes: 'The decree of 2024 did not open; the embassy in the USA retells it.',
	},
	{
		country: 'COL',
		visa: 'SCHENGEN',
		gives: 'visa_free',
		citizenships: COL_CITIZENSHIPS,
		conditions: 'Виза действует ещё больше 180 дней с даты въезда, или ПМЖ. Только для граждан Китая, Индии, Камбоджи, Мьянмы, Таиланда, Тайваня и Вьетнама.',
		checked: CHECKED,
		sources: COL,
	},
	{
		country: 'COL',
		visa: 'USA',
		gives: 'visa_free',
		citizenships: COL_CITIZENSHIPS,
		conditions: 'Виза действует ещё больше 180 дней с даты въезда, или ПМЖ. Только для граждан Китая, Индии, Камбоджи, Мьянмы, Таиланда, Тайваня и Вьетнама.',
		checked: CHECKED,
		sources: COL,
	},
	{
		country: 'PER',
		visa: 'SCHENGEN',
		gives: 'visa_free',
		citizenships: ['CHN', 'IND'],
		conditions: 'Виза действует ещё 6 месяцев, или ПМЖ. До 180 дней за 6 месяцев. Только для граждан Китая и Индии.',
		checked: CHECKED,
		sources: PER,
		notes: 'India by Andina only.',
	},
	{
		country: 'PER',
		visa: 'USA',
		gives: 'visa_free',
		citizenships: ['CHN', 'IND'],
		conditions: 'Виза действует ещё 6 месяцев, или ПМЖ. До 180 дней за 6 месяцев. Только для граждан Китая и Индии.',
		checked: CHECKED,
		sources: PER,
		notes: 'India by Andina only.',
	},
	{
		country: 'PER',
		visa: 'GBR',
		gives: 'visa_free',
		citizenships: ['CHN', 'IND'],
		conditions: 'Виза действует ещё 6 месяцев, или ПМЖ. До 180 дней за 6 месяцев. Только для граждан Китая и Индии.',
		checked: CHECKED,
		sources: PER,
		notes: 'India by Andina only.',
	},
	{
		country: 'PER',
		visa: 'CAN',
		gives: 'visa_free',
		citizenships: ['CHN', 'IND'],
		conditions: 'Виза действует ещё 6 месяцев, или ПМЖ. До 180 дней за 6 месяцев. Только для граждан Китая и Индии.',
		checked: CHECKED,
		sources: PER,
		notes: 'India by Andina only.',
	},
	{
		country: 'ARG',
		visa: 'USA',
		gives: 'visa_free',
		citizenships: ['CHN', 'DOM'],
		conditions: 'Действующая виза США той же категории, туризм или бизнес. Только для граждан Китая (до 30 дней) и Доминиканской Республики (до 90 дней).',
		checked: CHECKED,
		sources: ARG,
	},

	// Asia: by air only, for the counters and the cities' labels.
	{
		country: 'TWN',
		visa: 'SCHENGEN',
		gives: 'evisa',
		citizenships: TWN_CITIZENSHIPS,
		conditions: 'Онлайн-разрешение TAC, 30 дней. Виза или ВНЖ действующие или истекшие меньше 10 лет назад. Только для граждан 7 стран Юго-Восточной и Южной Азии.',
		checked: CHECKED,
		sources: TWN,
	},
	{
		country: 'TWN',
		visa: 'USA',
		gives: 'evisa',
		citizenships: TWN_CITIZENSHIPS,
		conditions: 'Онлайн-разрешение TAC, 30 дней. Виза или ВНЖ действующие или истекшие меньше 10 лет назад. Только для граждан 7 стран Юго-Восточной и Южной Азии.',
		checked: CHECKED,
		sources: TWN,
	},
	{
		country: 'TWN',
		visa: 'GBR',
		gives: 'evisa',
		citizenships: TWN_CITIZENSHIPS,
		conditions: 'Онлайн-разрешение TAC, 30 дней. Виза или ВНЖ действующие или истекшие меньше 10 лет назад. Только для граждан 7 стран Юго-Восточной и Южной Азии.',
		checked: CHECKED,
		sources: TWN,
	},
	{
		country: 'TWN',
		visa: 'CAN',
		gives: 'evisa',
		citizenships: TWN_CITIZENSHIPS,
		conditions: 'Онлайн-разрешение TAC, 30 дней. Виза или ВНЖ действующие или истекшие меньше 10 лет назад. Только для граждан 7 стран Юго-Восточной и Южной Азии.',
		checked: CHECKED,
		sources: TWN,
	},
	{
		country: 'PHL',
		visa: 'SCHENGEN',
		gives: 'visa_free',
		citizenships: ['IND'],
		conditions: 'Действующая виза или ВНЖ. 30 дней без продления. Только для граждан Индии.',
		checked: CHECKED,
		sources: PHL,
	},
	{
		country: 'PHL',
		visa: 'USA',
		gives: 'visa_free',
		citizenships: ['IND'],
		conditions: 'Действующая виза или ВНЖ. 30 дней без продления. Только для граждан Индии.',
		checked: CHECKED,
		sources: PHL,
	},
	{
		country: 'PHL',
		visa: 'GBR',
		gives: 'visa_free',
		citizenships: ['IND'],
		conditions: 'Действующая виза или ВНЖ. 30 дней без продления. Только для граждан Индии.',
		checked: CHECKED,
		sources: PHL,
	},
	{
		country: 'PHL',
		visa: 'CAN',
		gives: 'visa_free',
		citizenships: ['IND'],
		conditions: 'Действующая виза или ВНЖ. 30 дней без продления. Только для граждан Индии.',
		checked: CHECKED,
		sources: PHL,
	},
];
