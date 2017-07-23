/**
 * Created by ludovic on 17/07/17.
 */


import { createStore } from 'redux';
import Notifier from './Notifier';
import JsonProxy from './shared/JsonProxy';


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
    console.log('start of cleanupstate:' + JSON.stringify(state, null, 2));
    if (state.currentApp != null &&
        ((!state.backend.apps) || (!(state.currentApp in state.backend.apps) || !state.backend.apps[state.currentApp].enabled))) {
        state = fork(state);
        state.currentApp = null;
    }
    console.log('before pb:' + JSON.stringify(state, null, 2));
    // Assurer qu'on ait une app en cours si possible
    if (state.currentApp == null && state.backend.apps && state.backend.apps.length != 0) {
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
console.log("Reducer called with state: " + JSON.stringify(state, null, 2));
    if (type == "backendStatus") {
        state = Object.assign({}, state);
        state.backendStatus = action.backendStatus;
        if ('backendError' in action) {
            state.backendError = action.backendError;
        }
        switch(state.backendStatus) {
            case BackendStatus.Connected:
                state.backend = action.data;
                break;
            case BackendStatus.Paused:
            case BackendStatus.Reconnecting:
                break;
            default:
                state.backend = {};
        }
    } else if (type == "notification") {
        // Mettre le status du backend
        state = Object.assign({}, state);
        if (state.backendStatus != BackendStatus.Connected || state.backendError != null) {
            state.backendStatus = BackendStatus.Connected;
            state.backendError = null;
            state.backend = {};
        }
        if ('data' in action) {
            state.backend = action.data;
        } else {
            console.log('Apply diff : ' + JSON.stringify(action.diff));
            state.backend = JsonProxy.applyDiff(state.backend, action.diff);
        }
    } else if (type in actions) {
        state = actions[type](state, action);
    } else {
        console.log('invalid action: ' + type);
    }
    console.log("Before cleanup state: " + JSON.stringify(state, null, 2));
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
