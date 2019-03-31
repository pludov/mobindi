/**
 * Created by ludovic on 17/07/17.
 */


import { compose, createStore } from 'redux';
import persistState from 'redux-localstorage'
import Notifier from './Notifier';
import JsonProxy from './shared/JsonProxy';
import { update } from './shared/Obj'
import { atPath } from './shared/JsonPath'
import * as Actions from './Actions';
import * as ActionsRegistry from './ActionsRegistry';
import { BackofficeStatus } from '@bo/BackOfficeStatus';

const BackendStatus = {
    Idle: 0,
    Connecting: 1,
    Connected: 2,
    Paused: 3,
    Reconnecting: 4,        // Après la pause
    Failed: 5
}

const initialState:Content =  {
    backendStatus: BackendStatus.Idle,
    backendError: null,
    backend: {
        apps: {}
    },
    indiManager: {},
    currentApp: null,
    appNotifications: {}
};

export type Content = {
    currentApp: string|null;
    backendStatus: number;
    backendError: string|null;
    backend: Partial<BackofficeStatus>;
    indiManager: {};
    appNotifications: {};
};

// Fork un état et des sous-objet (forcement des objets)
// Keep the state if no modif is implied
function fork(state:Content, path?:string[], fn?:(t:any)=>any)
{
    var orgState = state;
    state = Object.assign({}, state);
    if (path != undefined) {
        var current = state;
        for(var i = 0; i < path.length; ++i)
        {
            var key = path[i];

            if (i == path.length - 1 && fn !== undefined) {
                var prev = current[key];
                var nv = fn(prev);
                if (prev === nv) {
                    return orgState;
                }
                current[key] = nv;
            } else {
                if (current[key] === null || current[key] === undefined)
                {
                    current[key] = {};
                } else {
                    current[key] = Object.assign({}, current[key]);
                }
            }
            current = current[key];
        }
    }
    return state;
}

function transform(state:Content, path?:string[], fn?:(t:any)=>any)
{
    return fork(state, path, fn);
}


export const SwitchToApp = new Actions.Handler<{value: string},'SwitchToApp'>("SwitchToApp", (state, action)=>{
    console.log('SwitchToApp', action);
    var appid = action.value;
    if (state.currentApp == appid) return state;
    return {
        ...state,
        currentApp: appid
    };
});

export const backendStatus = new Actions.Handler<{backendStatus: number, backendError?:string, data?:BackofficeStatus}, "backendStatus">("backendStatus",(state, action)=> {
    state  = Object.assign({}, state);
    state.backendStatus = action.backendStatus;
    if (Object.prototype.hasOwnProperty.call(action, "backendError")) {
        state.backendError = action.backendError || null;
    }
    switch (state.backendStatus) {
        case BackendStatus.Connected:
            state.backend = action.data!;
            break;
        case BackendStatus.Paused:
        case BackendStatus.Reconnecting:
            break;
        default:
            state.backend = {};
    }
    return state;
});


export const actions = ()=>({
    SwitchToApp,
    backendStatus,
});


var {reducer, storeManager } = function() {
    var adjusters:Array<(state:Content)=>Content> = [];

    var actionsByApp = {};

    var reducer = function (state:Content = initialState, action:any) {
        var prevJson = JSON.stringify(state);
        var prevState = state;

        var type = action.type;
        if (type == "update") {
            state = update(state, action.op);
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
            } else if ('diff' in action) {
                state.backend = JsonProxy.applyDiff(state.backend, action.diff);
            } else if ('batch' in action) {
                for(const diff of action.batch) {
                    state.backend = JsonProxy.applyDiff(state.backend, diff);
                }
            }
        } else if (type == "appAction") {
            var nvArgs = action.args.slice();
            nvArgs.unshift(state);
            try {
                state = actionsByApp[action.app][action.method].apply(null, nvArgs);
            } catch(e) {
                console.error('Error in ' + action.app + '.' + action.method, e);
            }
        } else {
            const newState = ActionsRegistry.performDispatch(state, type, action);
            if (newState === null || newState === undefined) {
                console.log('invalid action: ' + type);
            } else {
                state = newState;
            }
        }
        state = adjusters.reduce((state, func) => (func(state)), state);

        return state;
    }

    return {reducer, storeManager: {
        addAdjuster: (func:(s:Content)=>Content) => {adjusters.push(func);},

        addActions: (id:string, obj:any) => {
            if (!Object.prototype.hasOwnProperty.call(actionsByApp, id)) {
                actionsByApp[id] = {};
            }
            Object.assign(actionsByApp[id], obj);
        },
        dispatch: (e:any):void=>{},
        dispatchUpdate: (e:any):void=>{},
        // FIXME: ça retourne une Promises.
        sendRequest: (e:any):null=>null,

    }};
}();

const enhancer = compose(
    (persistState as any)(undefined, {
            slicer: (paths:any)=> (state:any) => {
                var rslt = Object.assign({}, state);
                delete rslt.backend;
                delete rslt.backendStatus;
                delete rslt.backendError;
                // console.log("WTF slicing result is " + JSON.stringify(rslt));
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

storeManager.sendRequest = notifier.sendRequest.bind(notifier);

// Connect notifier to websocket
function stripLastPart(url:string)
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
