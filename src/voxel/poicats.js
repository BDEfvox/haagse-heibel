// What kind of place a point of interest is. One list, shared by the data build (scripts/build-world.mjs writes the
// index into the tiles, key `ps`) and the city (shop fronts, signs, terraces). Append only: tiles store the index.
export const POI_CATS = [
  'other', 'restaurant', 'snackbar', 'burger', 'pizza', 'kebab', 'chicken', 'sandwich', 'fish', 'ice_cream',
  'cafe', 'pub', 'nightclub', 'coffeeshop', 'supermarket', 'convenience', 'bakery', 'butcher', 'greengrocer', 'chemist',
  'pharmacy', 'clothes', 'shoes', 'hairdresser', 'beauty', 'optician', 'jewelry', 'florist', 'books', 'electronics',
  'bicycle', 'car', 'furniture', 'diy', 'department', 'liquor', 'bank', 'atm', 'fuel', 'hotel',
  'laundry', 'second_hand', 'gift', 'sports', 'pet', 'tattoo', 'office', 'vacant', 'asian', 'roti',
  'casino', 'massage', 'cinema', 'gym', 'terrace', 'market_stall',
];
export const POI_CAT = Object.fromEntries(POI_CATS.map((k, i) => [k, i]));
// bits of the per-POI flags in `ps`
export const POI_FLAG = { TERRACE: 1, CHAIN: 2, TAKEAWAY: 4 };
