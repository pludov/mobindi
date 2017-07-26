/**
 * Created by ludovic on 17/07/17.
 */


import { compose, createStore } from 'redux';
import persistState from 'redux-localstorage'
import Notifier from './Notifier';
import JsonProxy from './shared/JsonProxy';
import { update } from './shared/Obj'


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
    indiManager: {},
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

actions.SwitchToApp = function(state, action)
{
    var appid = action.value;
    if (state.currentApp == appid) return state;
    state = fork(state);
    state.currentApp = appid;
    return state;
}


var {reducer, storeManager } = function() {
    var adjusters = [];

    var actionsByApp = {};

    var reducer = function (state = initialState, action) {
        var prevJson = JSON.stringify(state);
        var prevState = state;

        var type = action.type;
        if (type == "update") {
            state = update(state, action.op);
        } else if (type == "backendStatus") {
            state = Object.assign({}, state);
            state.backendStatus = action.backendStatus;
            if ('backendError' in action) {
                state.backendError = action.backendError;
            }
            switch (state.backendStatus) {
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
                state.backend = JsonProxy.applyDiff(state.backend, action.diff);
            }
        } else if (type == "appAction") {
            var nvArgs = action.args.slice();
            nvArgs.unshift(state);
            state = actionsByApp[action.app][action.method].apply(null, nvArgs);
        } else if (type in actions) {
            state = actions[type](state, action);
        } else {
            console.log('invalid action: ' + type);
        }
        state = adjusters.reduce((state, func) => (func(state)), state);

        return state;
    }

    return {reducer, storeManager: {
        addAdjuster: (func) => {adjusters.push(func);},

        addActions: (id, obj) => {
            if (!Object.prototype.hasOwnProperty.call(actionsByApp, id)) {
                actionsByApp[id] = {};
            }
            Object.assign(actionsByApp[id], obj);
        }
    }};
}();

const enhancer = compose(
    persistState(undefined, {
            slicer: (paths)=> (state) => {
                console.log('WTF slicing');
                var rslt = Object.assign({}, state);
                delete rslt.backend;
                delete rslt.backendStatus;
                delete rslt.backendError;
                console.log("WTF slicing result is " + JSON.stringify(rslt));
                return rslt;
            }
        })
);

const store = createStore(reducer, initialState, enhancer);

storeManager.dispatch = function(e) {
    store.dispatch(e);
}

storeManager.dispatchUpdate = function(e) {
    store.dispatch({
        type: 'update',
        op: e});
}

const notifier = new Notifier();

notifier.attachToStore(store);

storeManager.sendMessage = (e) => notifier.sendMessage(e);

// Connect notifier to websocket
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

notifier.connect(apiRoot);


export { store, notifier, BackendStatus, storeManager, fork }
