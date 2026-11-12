// Copies a src directory to a scratch work dir and patches the COPY so its modules load under Node and expose internals.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export function listFiles(dir, base = dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) listFiles(p, base, out);
    else out.push(path.relative(base, p));
  }
  return out;
}

/** sha256 of every file of a source tree (before patching) + one hash of all. */
export function fingerprint(dir) {
  const files = {}, all = crypto.createHash('sha256');
  for (const f of listFiles(dir)) {
    const h = crypto.createHash('sha256').update(fs.readFileSync(path.join(dir, f))).digest('hex').slice(0, 12);
    files[f] = h;
    all.update(f + ':' + h + '\n');
  }
  return { files, all: all.digest('hex').slice(0, 16) };
}

// Internals the tool needs and the file they live in today (hint; if the hinted file lost the declaration, every other
// src/voxel file outside statues/ is searched, so a function that moved to another module is still found).
export const WANT = {
  buildTile: 'voxel/world.js',
  frontsOf: 'voxel/world.js',
  drawHero: 'voxel/world.js',
  unitRng: 'voxel/world.js',
  frontInfo: 'voxel/world.js',
  loadCity: 'voxel/world.js',
  Streamer: 'voxel/world.js',
  cityModel: 'voxel/world.js',
};

const declRe = (name) => new RegExp(`^(?:export\\s+)?(?:async\\s+)?function\\s*\\*?\\s*${name}\\b|^(?:export\\s+)?(?:const|let|var|class)\\s+${name}\\b`, 'm');

/**
 * Returns { work, srcWork, patches: [...], located: { name: relFile | null }, skipped: { what: reason } }.
 * srcDir is only read; everything is written under `work`.
 */
export function prepare({ srcDir, work, modules, scriptsFrom }) {
  fs.rmSync(work, { recursive: true, force: true });
  fs.mkdirSync(work, { recursive: true });
  const srcWork = path.join(work, 'src');
  fs.cpSync(srcDir, srcWork, { recursive: true });
  fs.symlinkSync(modules, path.join(work, 'node_modules'), 'dir');
  fs.writeFileSync(path.join(work, 'package.json'), JSON.stringify({ name: 'harness-work', type: 'module', private: true }) + '\n');
  if (scriptsFrom && fs.existsSync(scriptsFrom)) { fs.mkdirSync(path.join(work, 'scripts')); fs.copyFileSync(scriptsFrom, path.join(work, 'scripts', 'check-statues.mjs')); }
  const patches = [], skipped = {}, located = {};
  const files = listFiles(srcWork).filter((f) => f.endsWith('.js'));
  const text = new Map(files.map((f) => [f, fs.readFileSync(path.join(srcWork, f), 'utf8')]));
  const edit = (f, fn, label) => {
    const before = text.get(f), after = fn(before);
    if (after !== before) { text.set(f, after); patches.push(label + ' in ' + f); return true; }
    return false;
  };

  // 1. a production build: import.meta.env.DEV is false; CSS side-effect imports vanish; json imports get their attribute
  for (const f of files) {
    edit(f, (s) => s.replace(/import\.meta\.env\s*&&\s*import\.meta\.env\.DEV/g, 'false'), 'DEV-and-guard -> false');
    edit(f, (s) => s.replace(/import\.meta\.env\.DEV/g, 'false'), 'import.meta.env.DEV -> false');
    edit(f, (s) => s.replace(/import\.meta\.env\.PROD/g, 'true'), 'import.meta.env.PROD -> true');
    edit(f, (s) => s.replace(/import\.meta\.env/g, '({})'), 'import.meta.env -> {}');
    edit(f, (s) => s.replace(/^\s*import\s+['"][^'"]+\.css['"];?\s*$/gm, ''), 'css import removed');
    edit(f, (s) => s.replace(/(import\s+[\w{}*,\s]+\s+from\s+['"][^'"]+\.json['"])(\s*;)/g, "$1 with { type: 'json' }$2"), 'json import attribute');
  }

  // 2. aliased exports of the internals that are not exported today (alias names never clash with existing exports)
  const voxelFiles = files.filter((f) => f.startsWith('voxel' + path.sep) && !f.includes(path.sep + 'statues' + path.sep) && !f.includes(path.sep + 'acts' + path.sep));
  const wanted = {};
  for (const [name, hint] of Object.entries(WANT)) {
    const hintF = hint.split('/').join(path.sep);
    const order = [hintF, ...voxelFiles.filter((f) => f !== hintF)];
    const hit = order.find((f) => text.has(f) && declRe(name).test(text.get(f)));
    located[name] = hit || null;
    if (!hit) { skipped[name] = `no top-level declaration of ${name} found in src/voxel (looked in ${order.length} files)`; continue; }
    (wanted[hit] ||= []).push(name);
  }
  for (const [f, names] of Object.entries(wanted)) {
    edit(f, (s) => s + `\nexport { ${names.map((n) => `${n} as __h_${n}`).join(', ')} }; // (harness)\n`, 'export aliases ' + names.join(','));
  }

  // 2b. names that lost their export keyword in a refactor: export them again in the copy (same name)
  const AGAIN = { 'voxel/places.js': ['PLACES'], 'voxel/cast.js': ['MOODS', 'SKINS', 'SHIRTS', 'PANTS', 'HAIRS'], 'voxel/districts.js': ['DISTRICTS'], 'voxel/world.js': ['EX', 'C'], 'voxel/gags.js': ['DEFAULT_STAGE'], 'voxel/brands.js': ['shadeHex'], 'voxel/setting.js': ['FURN'] };
  for (const [f0, names] of Object.entries(AGAIN)) {
    const f = f0.split('/').join(path.sep);
    if (!text.has(f)) continue;
    const add = names.filter((n) => new RegExp('^(?:const|let|var|function\\*?|class)\\s+' + n + '\\b', 'm').test(text.get(f)) && !new RegExp('^export\\s+(?:const|let|var|function\\*?|class)\\s+' + n + '\\b', 'm').test(text.get(f)) && !new RegExp('^export\\s*\\{[^}]*\\b' + n + '\\b[^}]*\\}', 'm').test(text.get(f)));
    if (add.length) edit(f, (t) => t + '\nexport { ' + add.join(', ') + ' }; // (harness)\n', 're-export ' + add.join(','));
  }

  // 3. a spy on furnishTile: wrap the import in whichever file imports it
  let furn = false;
  for (const f of files) {
    const s = text.get(f);
    const m = /import\s*\{([^}]*)\}\s*from\s*(['"])([^'"]*furnish\.js)\2\s*;?/.exec(s);
    if (!m || !/\bfurnishTile\b/.test(m[1])) continue;
    const names = m[1].split(',').map((x) => x.trim()).filter(Boolean);
    const rest = names.filter((x) => x !== 'furnishTile');
    const imp = `import { furnishTile as __h_furnishTile${rest.length ? ', ' + rest.join(', ') : ''} } from ${m[2]}${m[3]}${m[2]};\n`
      + 'const furnishTile = (o) => { const r = __h_furnishTile(o); const hk = globalThis.__harness && globalThis.__harness.furn; if (hk) hk(o, r); return r; }; // (harness)';
    edit(f, (t) => t.replace(m[0], imp), 'furnishTile spy');
    furn = true;
    break;
  }
  if (!furn) skipped['furnishSpy'] = 'no `import { furnishTile } from ".../furnish.js"` found; furniture is still hashed inside the tile meshes and props';

  for (const [f, s] of text) fs.writeFileSync(path.join(srcWork, f), s);
  return { work, srcWork, patches, located, skipped };
}
