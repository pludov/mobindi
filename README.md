## Introduction

Monitor and control an astrophotography session from a mobile phone !

![Screenshots of the UI](docs/screenshots.png?raw=true "Screenshots of the UI")

This software is intended to be used for nomade astronomy, where size and power consumption matters.
It will typically run on a Raspberry PI or equivalent, using the Indi drivers, and phd2 for guiding.

It provides a fully responsive user interface to control and monitor various aspects of a astrophotograpy session.

Currently the following features are supported:
  * Interface to indi drivers (display connected, connect/disconnect devices, configure)
  * Take anb display single shot for Indi cameras (tested for Simulator on GPhoto)
  * Control and monitor PHD2 guiding :
    * connect devices to PHD2, start and stop PHD2 guiding
    * Display current RMS/Star Mass
    * show a graph of drift (RA/Dec)
  * Autostart phd2 and indiserver


The UI is designed to be fit a vertical screen and will adapt to the resolution (even below 640x480).

Clickable area are big enough to keep the use easy.

Only events are sent between server to UI (unlike VNC which transfer bitmaps), so the UI will stay responsive even over relatively slow link.
(A wifi hotspot should works at 20/30 meters in a field)

The UI can also be displayed on a dedicated LCD display, using a browser in kiosk mode.

This software is still in early development stage; if it proves useful, lots of features will be added, to cover most aspects of a DSLR setup. (alignment, image sequences, astrometry, manual/auto focus, ...)

## Quick start

Prior to using this software, you must have a working installation of Indi (server and drivers) and phd2 (so that clicking connect then guide actually starts guiding...).

The above instructions are valid for a debian based system (including raspbian for raspberry PI). I use them verbatim on Ubuntu 17.04 (x86/64) and Linaro (Asus Tinker board).

Some packages are required for building. Install them:
```
sudo apt-get install git cmake zlib1g-dev libcurl4-openssl-dev libgsl-dev libraw-dev libcfitsio-dev libjpeg-dev libpng-dev libcgicc-dev
```

You also need nodejs installed, with a recent version (> v8). I use the latest v6 (v8.4.0)
```
curl -sL https://deb.nodesource.com/setup_8.x | sudo -E bash -
sudo apt-get install -y nodejs
npm install
```

Installation and build:
```
git clone https://github.com/pludov/mobindi.git
cd mobindi
npm install
(cd ui && npm install && npm build)
(cd fitsviewer && cmake . && make)
```

Then start the server:
```
npm start
```

Connect to http://localhost:8080


## Starting phd2/indiserver

As an option, the server can start indiserver and phd2. For this to work, you must activate it in two configuration files : local/indi.json and local/phd2.json. (The configuration files are not created until the first run of the server)

Theses files are empty by default; when edited, the server must be restarted to take changes into account. Examples are provided (local/indi.default.json and local/phd2.default.json)

For indi, you must declare all devices that you intend to run in the json file (see the default for an example).


## Internals

There are three parts :
  * A HTTP server in nodejs communicates with PHD and Indi
  * A CGI for image preview (fitsviewer)
  * A react UI (served by the HTTP server) that render the app

Appart from images, communication between server and UI uses exclusively websocket.

## Developpment

For doing dev, a server dedicated to React UI can be used. This provides instant reloading on change (code, css, ...).
To use it, start the server, and the ui : cd ui && npm start
Then connect to port 3000 : http://localhost:3000

The REACT http server on port 3000 will automatically push changes to UI, and relay request to the backed to port 8080


