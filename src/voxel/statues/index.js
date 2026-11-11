// Statue recipes by landmark: merges the recipe files and looks them up by the tile feature's `a` field.
import ids from './ids.json' with { type: 'json' };
import famous from './recipes-famous.js';
import r1 from './recipes-1.js';
import r2 from './recipes-2.js';
import r3 from './recipes-3.js';

/** All recipes by OpenStreetMap id. Famous overrides the others. */
export const RECIPES = Object.assign({}, r1, r2, r3, famous);
export const IDS = ids;

/** index1 = the 1-based position in ids.json carried by the tile feature (0 or missing = no recipe). */
export function recipeFor(index1) {
  if (!(index1 >= 1)) return null;
  const id = ids[index1 - 1];
  return (id && RECIPES[id]) || null;
}
