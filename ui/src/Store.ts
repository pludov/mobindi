/**
 * Created by ludovic on 17/07/17.
 */


import * as AppStore from './AppStore';
import * as BackendStore from './BackendStore';
import * as FitsViewerStore from './FitsViewerStore';
import * as MessageStore from './MessageStore';
import * as NotificationStore from './NotificationStore';
import * as IndiManagerStore from './IndiManagerStore';
import * as SequenceStore from './SequenceStore';
import * as GeolocStore from './GeolocStore';
import * as GenericUiStore from './GenericUiStore';
import { Store } from 'redux';
import * as ReactRedux from "react-redux";
import Notifier from './Notifier';
import * as Promises from './shared/Promises';

export type Content =
            AppStore.Content &
            BackendStore.Content &
            FitsViewerStore.Content &
            MessageStore.Content &
            NotificationStore.Content &
            IndiManagerStore.Content &
            SequenceStore.Content &
            GeolocStore.Content &
            GenericUiStore.Content &
{
    currentApp: string|null;
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

let store:Store;
let notifier:Notifier;

export function init(newStore:Store, newNotifier: Notifier) {
    store = newStore;
    notifier = newNotifier;
}

export function getStore() {
    if (store === undefined) {
        throw new Error("Store not initialized");
    }
    return store;
}

export function getNotifier(): Notifier {
    if (notifier === undefined) {
        throw new Error("Notifier not initialized");
    }
    return notifier;
}

type mapStateToPropsDirectFunc<TOwnProps, TStateProps> = (state: Content, ownProps: TOwnProps)=>TStateProps;

interface IMapStateToProps<TOwnProps, TStateProps> {
    mapStateToProps : mapStateToPropsDirectFunc<TOwnProps, TStateProps> | (()=>(mapStateToPropsDirectFunc<TOwnProps, TStateProps>));
}

export function Connect<Class, TOwnProps, State, TStateProps >(
            ctor : (new (props:TOwnProps)=>(React.PureComponent<TOwnProps,State>))&IMapStateToProps<TOwnProps, TStateProps>
        )
            : new (props:TOwnProps)=>(React.PureComponent<TOwnProps,State>)
{
    return ReactRedux.connect(ctor.mapStateToProps, null, null, {forwardRef: true} as any)(ctor as any) as any;
}

export type Accessor<TYPE>={
    fromStore: (s:Content)=>TYPE;
    send: (t:TYPE)=>Promise<void>;
}

export { fork }
