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
    backend: {}
};

const actions = {};

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
        state.backend = {
            phd: action.data.phd
        };
    } else if (type in actions) {
        state = actions[type](state, action);
    } else {
        console.log('invalid action: ' + type);
    }
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

export { store, actions, BackendStatus }
