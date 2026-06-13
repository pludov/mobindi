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





