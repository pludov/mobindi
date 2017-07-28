## Introduction

Monitor and control an astrophotography session from a fully responsive UI !

This software is intended to be used for nomade astronomy, where size and power consumption matters.
It will typically run on a Raspberry PI or equivalent.

It provides a user interface to control and monitor various aspects of a astrophotograpy session. 

Currently the following features are supported:
  * monitor Open PHD2 guiding :
    * Display current RMS/Star Mass
    * show a graph of drift (RA/Dec)
  * connect devices to PHD2, start and stop PHD2 guiding
  * interface to indi drivers (display connected, connect/disconnect devices, configure)

The UI is designed to be fit a vertical screen and will adapt to the resolution (even below 640x480).

Clickable area are big enough to keep the use easy.

Only events are sent between server to UI (unlike VNC which transfer bitmaps), so the UI will stay responsive even over relatively slow link.
(A wifi hotspot should works at 20/30 meters in a field)

The UI can also be displayed on a dedicated LCD display, using a browser in kiosk mode.

This software is still in early development stage; if it proves useful, lots of features will be added, to cover most
aspects of a DSLR setup. (alignment, image sequences, astrometry, manual/auto focus, ...)

## Quick start

You need node (from the nodejs package) installed with a recent version (> v6). I use the latest v6 (v6.11.1)

Installation and build:
```
git clone https://github.com/pludov/iphd.git
cd iphd
npm install
(cd ui && npm install && npm build)
```

Then start the server:
```
npm start
```

Connect to http://localhost:8080


## Internals

There are two parts :
  * A HTTP server in nodejs communicates with PHD and indi
  * A react UI (served by the HTTP server) that render the app

Communication between server and UI uses exclusively websocket.

For doing dev, a server dedicated to React UI can be used. This provideds instant reload on change.
To use it, start the server, and the ui : cd ui && npm start
Then connect to port 3000 : http://localhost:3000

The REACT http server on port 3000 will automatically push changes to UI, and relay request to the backed to port 8080


