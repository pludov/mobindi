# Minimap sky data

The mount and polar-alignment minimaps show an offline, unlabeled sky guide.
The map uses the selected mount's INDI `GEOGRAPHIC_COORD` and the browser's
clock. It uses a geometric horizon, not the local terrain, and does not model
refraction, extinction or stellar proper motion. If the mount does not provide
a valid location, the sky layer is hidden.

The map is zenith-centered with north at the top and east at the right. It
refreshes once per minute while the page is visible, immediately when a
location change shifts the local sky frame by more than one sidereal minute
(about 0.25 degrees), and on returning to the foreground. Smaller location
changes accumulate relative to the last rendering.

## Data attribution and license

`skyData.ts` is an adapted subset of:

* The [HYG Database v4.0](https://github.com/astronexus/HYG-Database/tree/c7f7f883fe678cc7680169a50ccd7dcc49b060ce/hyg/CURRENT), by the HYG Database contributors, [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).
* The [Stellarium modern sky culture](https://github.com/Stellarium/stellarium/tree/50a03dad8710bb24bd8c5911f681171097d33fd1/skycultures/modern), by the Stellarium team, whose text and data are [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) (see its `description.md`).

The derived sky data is distributed under CC BY-SA 4.0. It has been changed
by selecting Hipparcos stars of visual magnitude at most 4 and all stars
referenced by modern constellation lines, converting RA hours to degrees,
rounding positions and magnitudes, and replacing line IDs with array indices.
All 88 constellations' lines are included; Stellarium's separate asterisms,
labels, illustrations and boundaries are omitted. Only stars with Hipparcos
IDs are used. The result contains 799 stars and 695 segments.

## Reprocessing

The Python 3 standard-library script checks the exact SHA-256 of both inputs,
checks line references and data bounds, and produces deterministic output.
From the repository root, download the pinned inputs and regenerate:

```sh
curl -fL https://raw.githubusercontent.com/astronexus/HYG-Database/c7f7f883fe678cc7680169a50ccd7dcc49b060ce/hyg/CURRENT/hygdata_v40.csv.gz -o /tmp/hygdata_v40.csv.gz
curl -fL https://raw.githubusercontent.com/Stellarium/stellarium/50a03dad8710bb24bd8c5911f681171097d33fd1/skycultures/modern/index.json -o /tmp/stellarium-modern-index.json
python3 ui/scripts/generate-minimap-sky.py /tmp/hygdata_v40.csv.gz /tmp/stellarium-modern-index.json
python3 ui/scripts/generate-minimap-sky.py /tmp/hygdata_v40.csv.gz /tmp/stellarium-modern-index.json --check
```

Changing the input revisions requires reviewing their licenses and updating the
script's expected hashes and the links above. The application never downloads
these inputs at runtime.
