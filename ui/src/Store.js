/**
 * Created by ludovic on 17/07/17.
 */


import { createStore } from 'redux';
import Notifier from './Notifier'


const BackendStatus = {
    Idle: 0,
    Connecting: 1,
    Connected: 2,
    Paused: 3,
    Reconnecting: 4,        // Après la pause
    Failed: 5
}

const initialState =  {
    backendStatus: BackendStatus.Idle,
    backendError: null,
    backend: {
        apps: {}
    },
    currentApp: null
};

const actions = {};


// Fork un état et des sous-objet (forcement des objets)
function fork(state, path)
{
    state = Object.assign({}, state);
    if (path != undefined) {
        var current = state;
        for(var i = 0; i < path.length; ++i)
        {
            var key = path[i];

            if (current[key] == null || current[key] == undefined)
            {
                current[key] = {};
            } else {
                current[key] = Object.assign({}, current[key]);
            }
        }
    }
    return state;
}

function cleanupState(state)
{
    // Assurer que l'app en cours est toujours autorisée
    if (state.currentApp != null && (!(state.currentApp in state.backend.apps) || !state.backend.apps[state.currentApp].enabled)) {
        state = fork(state);
        state.currentApp = null;
    }

    // Assurer qu'on ait une app en cours si possible
    if (state.currentApp == null && state.backend.apps.length != 0) {
        state = fork(state);
        // On prend la premiere... (FIXME: historique & co...)
        var bestApp = null;
        var bestKey = null;
        for(var key in state.backend.apps)
        {
            var app = state.backend.apps[key];
            if (bestApp == null
                || (bestApp.position > app.position)
                || (bestApp.position == app.position && bestKey < key))
            {
                bestApp = app;
                bestKey = key;
            }
        }
        state.currentApp = bestKey;
    }

    return state;
}

actions.SwitchToApp = function(state, action)
{
    var appid = action.value;
    if (state.currentApp == appid) return state;
    state = fork(state);
    state.currentApp = appid;
    return state;
}


var reducer = function(state = initialState, action)
{
    var type = action.type;

    if (type == "backendStatus") {
        state = Object.assign({}, state);
        state.backendStatus = action.backendStatus;
        if ('backendError' in action) {
            state.backendError = action.backendError;
        }

    } else if (type == "notification") {
        // Mettre le status du backend
        state = Object.assign({}, state);
        state.backendStatus = BackendStatus.Connected;
        state.backendError = null;
        // FIXME: remove that
        state.backend = {
            phd: action.data.phd,
            indiManager: action.data.indiManager,
            apps: action.data.apps
        };
    } else if (type in actions) {
        state = actions[type](state, action);
    } else {
        console.log('invalid action: ' + type);
    }

    state = cleanupState(state);

    return state;
}


function stripLastPart(url)
{
    var str = "" + url;
    var lastSlash = str.lastIndexOf('/');
    if (lastSlash == -1) return str;
    return str.substring(0, lastSlash + 1);
}

const apiRoot = //((window.location+'').indexOf('pludov') == -1) ?
    (window.location.protocol + '//' + window.location.hostname  + ':' + window.location.port + '/');
    //:*/ (stripLastPart(window.location) + 'api/');
console.log('api root is at: ' + apiRoot);

const notifier = new Notifier();

const store = createStore(reducer);

notifier.attachToStore(store);
notifier.connect(apiRoot);

export { store, actions, notifier, BackendStatus }
