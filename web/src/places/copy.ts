// What the screen calls a place's type (spec #154 «Экран», «Карточка места»): its chip on the card and in a row of the
// list of all, the names of the amendment's types.
import type { PlaceType } from 'data/places-file';

export const PLACE_TYPE_NAMES: Readonly<Record<PlaceType, string>> = {
	'national-park': 'Нацпарк',
	mountain: 'Гора',
	canyon: 'Каньон',
	waterfall: 'Водопад',
	cave: 'Пещера',
	lake: 'Озеро',
	beach: 'Пляж',
	island: 'Остров',
	monastery: 'Монастырь',
	castle: 'Замок или крепость',
	ruins: 'Руины',
};
