# Development Container

The dev container includes indi and node js, suitable for immediate development of the application. It is not a full indi installation, so you'll have to work with the indi simulator devices.

The dev container is meant to be used in **rootless** mode. This is easily achieved by using podman in vscode. Open user settings and set the following:

```
"dev.containers.dockerPath": "podman"
```

# Choosing the indi version

Two Dockerfile are provided:
  * `Dockerfile-distro` uses the indi version that ships with ubuntu 24.04.
  * `Dockerfile` uses a recent indi version from the official docker hub. It'll perform recompilation of the version specified in the devcontainer.json file.






# UI visual regression tests

`ui-e2e/` contains Playwright tests that start the real backend (on dedicated ports, with a throw-away config dir and INDI simulators), click every application tab (Camera, Sequence, PHD, Focuser, Astrometry, INDI, Tools, Messages) and compare a screenshot of each with a committed baseline (desktop and mobile viewports).

```
# build backend and ui first
npm run build && (cd ui && npm run build)
cd ui-e2e
npm install && npx playwright install --with-deps chromium
npm test                # compare with baselines
npm run test:update     # refresh baselines (review the diff of the png files!)
```

Notes:
  * Baselines must be generated in the dev container (same fonts/chromium) to be repeatable.
  * Content that varies between runs (times, notifications, charts, ...) must be flagged with the `e2e-ignore` CSS class (no style attached). Those elements are masked in screenshots. Add the class to any new volatile element.
  * The backend honors `MOBINDI_CONFIG_DIR` (config directory, default `local`) and `MOBINDI_INDI_PORT` (indiserver port, default 7624), so tests do not interfere with a running dev instance.
