# Geometry snapshot

This tool compares the geometry that `src/` generates before and after a change. It runs the real drawing code on the committed city data, reduces every result to a short hash, and writes all hashes to one JSON file. Two such files can then be compared: if they are identical, nothing the viewer sees through those code paths has changed.

## Running it

```
node scripts/snapshot/snapshot.mjs src before.json
# change the code, then:
node scripts/snapshot/snapshot.mjs src after.json
node scripts/snapshot/diff.mjs before.json after.json
```

`diff.mjs` prints `IDENTICAL` and exits with 0, or lists the differing keys and exits with 1. To compare a copy of `src/` taken earlier (for example from `git worktree`), pass that directory as the first argument instead of `src`.

Options of `snapshot.mjs`: `--tiles N` samples fewer tiles, `--only key,key` takes exactly these tiles, `--parts tile,fronts,brands,statues,actors,pure` runs only some parts, `--repo DIR` uses another repository's `public/data` and `node_modules` (the default is the repository the script lives in), and `--keep` leaves the work directory in place. `diff.mjs` accepts `--max N` to show more differing keys.

The source directory is only read. The tool copies it to a fresh directory under the system temp directory, patches the copy so it loads under Node (stubs for `document`, `Image`, `fetch` and `performance`, and a few internal functions exported under extra names), and deletes that directory when it ends, also after an error or Ctrl-C.

## How long it takes

A full run takes about one to three minutes on a recent laptop and samples 204 tiles. It uses the CPU heavily for that time.

## What it covers

- 204 sampled tiles (the busiest in points of interest and buildings, the hand-made special tiles, tiles around the named places, and some with water or sea), each built at every level of detail, by day and by night: meshes, house fronts, street furniture and its anchors, lamps, trees and the ground grid. The phone ("lite") tiles are built at night only at the middle level of detail.
- Every statue recipe, and the output of `scripts/check-statues.mjs`.
- Actors, items and vehicles.
- The shop sign of every distinct (name, category, flags) triple in the tiles: the parody name, the sign, the chain lookup and the text fitting.
- Pure functions such as the sky, the colour mixing, the scene cast, spot placement and the geometry helpers.

## What it does not cover

Crowd behaviour, the staging of scenes, the camera, the scene scripts, `buildWorld` (the per-street part of `world.js`), shaders as a GPU compiles them, and CSS. A change only in those places gives identical snapshots, so check them another way.

## Which snapshots can be compared

Two snapshots are only comparable when they were made from the same data: the tiles, the index, the rasters and the districts under `public/data`. Each file records a hash of that data in `meta.dataHash`; `diff.mjs` warns when it differs, and then both snapshots must be regenerated on the same data before the result means anything.

## How to read a difference

`diff.mjs` groups the differing keys by part (`tiles`, `brands`, `statues`, `actors`, `pure`) and, for tiles, by tile, and prints each key as a dotted path ending in a hash, with a note when a key exists in only one file. Path elements whose name contains `night` are night-only outputs, so a difference only under those means the change shows only after dark and the day outputs are unchanged. A difference at one level of detail only points at the code for that level. A difference under `brands` names the shop name or category whose sign changed. The `meta` section (paths, timings, file hashes) is not compared, but the tool prints whether the source trees differ, and warns when the data hash or the tool version differs between the two files.

## Other files

`covmark.cjs` inserts execution counters before chosen lines of a source copy, to check whether a snapshot run reaches them: `node covmark.cjs <srcCopy> <file> <marks.json>`. The code that hashes, stubs and patches lives in `lib/`.
