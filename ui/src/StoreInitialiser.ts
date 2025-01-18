import Log from './shared/Log';
import { update } from './shared/Obj'
import * as Store from './Store';
import * as Actions from './Actions';
import { compose, createStore } from 'redux';
import persistState from 'redux-localstorage'
import ReduxNotifier from './ReduxNotifier';

import * as AppStore from './AppStore';
import * as BackendStore from './BackendStore';
import * as FitsViewerStore from './FitsViewerStore';
import * as IndiManagerStore from './IndiManagerStore';
import * as MessageStore from './MessageStore';
import * as NotificationStore from './NotificationStore';
import * as SequenceStore from './SequenceStore';
import * as GeolocStore from './GeolocStore';
import * as GenericUiStore from './GenericUiStore';

const logger = Log.logger(__filename);

export function start() {
    const initialState:Store.Content =  {
        ...AppStore.initialState,
        ...BackendStore.initialState,
        ...FitsViewerStore.initialState,
        ...IndiManagerStore.initialState,
        ...MessageStore.initialState,
        ...NotificationStore.initialState,
        ...SequenceStore.initialState,
        ...GeolocStore.initialState,
        ...GenericUiStore.initialState,
        currentApp: null,
    };

    const onImport:Array<(store:Store.Content)=>(void)> = [
        AppStore.onImport,
        BackendStore.onImport,
        FitsViewerStore.onImport,
        IndiManagerStore.onImport,
        MessageStore.onImport,
        NotificationStore.onImport,
        SequenceStore.onImport,
        GeolocStore.onImport,
        GenericUiStore.onImport,
    ];

    const onExport:Array<(store:Store.Content)=>(void)> = [
        AppStore.onExport,
        BackendStore.onExport,
        FitsViewerStore.onExport,
        IndiManagerStore.onExport,
        MessageStore.onExport,
        NotificationStore.onExport,
        SequenceStore.onExport,
        GeolocStore.onExport,
        GenericUiStore.onExport,
    ];

    var reducer = function() {
        var adjusters:Array<(state:Store.Content)=>Store.Content> = [
            ...AppStore.adjusters(),
            ...BackendStore.adjusters(),
            ...FitsViewerStore.adjusters(),
            ...IndiManagerStore.adjusters(),
            ...MessageStore.adjusters(),
            ...NotificationStore.adjusters(),
            ...SequenceStore.adjusters(),
            ...GeolocStore.adjusters(),
            ...GenericUiStore.adjusters(),
        ];

        var actionsByApp = {};

        var reducer = function (state:Store.Content = initialState, action:any) {
            const type = action.type;
            if (('' + type).startsWith('@@redux/INIT')) {
                return state;
            }
            if (type == "update") {
                state = update(state, action.op);
            } else  if (type == "appAction") {
                var nvArgs = action.args.slice();
                nvArgs.unshift(state);
                try {
                    state = actionsByApp[action.app][action.method].apply(null, nvArgs);
                } catch(e) {
                    logger.error('Error in apply reducer', {app: action.app, method: action.method, type}, e);
                }
            } else {
                if (!Object.prototype.hasOwnProperty.call(Actions.registry, type)) {
                    logger.error('invalid action in reducer', {app: action.app, method: action.method, type});
                } else {
                    const newState = Actions.registry[type](state, action);
                    state = newState;
                }
            }
            state = adjusters.reduce((state, func) => (func(state)), state);

            return state;
        }

        return reducer;
    }();

    const enhancer = compose(
        (persistState as any)(undefined, {
                slicer: (paths:any)=> (state:any) => {
                    var rslt = Object.assign({}, state);

                    // do not save useless data
                    for(const childOnExport of onExport) {
                        childOnExport(rslt);
                    }
                    return rslt;
                },
                deserialize: (data:string)=>{
                    const ret = JSON.parse(data) || {};
                    // ensure no missing property / no unsaved properties
                    for(const childOnImport of onImport) {
                        childOnImport(ret);
                    }

                    return ret;
                }
            })
    );

    const store = createStore(reducer, initialState, enhancer);

    const notifier = new ReduxNotifier();

    notifier.attachToStore(store);

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
    logger.info('API root found', {apiRoot});

    notifier.connect(apiRoot);

    Store.init(store, notifier);
}