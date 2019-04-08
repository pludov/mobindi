/**
 * Created by ludovic on 17/07/17.
 */


import * as BackendStore from './BackendStore';
import * as FitsViewerStore from './FitsViewerStore';
import { Store } from 'redux';
import * as ReactRedux from "react-redux";
import Notifier from './Notifier';
import * as Promises from './shared/Promises';

export type Content = BackendStore.Content & FitsViewerStore.Content & {
    currentApp: string|null;
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

export type StoreManager = {
    dispatch:(e: Object)=>(void);
    dispatchUpdate: (e:Object)=>(void);
    sendRequest: (e:Object)=>Promises.Cancelable<any, any>;
    addAdjuster: (adjuster: (state:Content)=>Content) => (void);
    addActions: (id: string, arg: {[id:string]:((state:Content, payload:any)=>Content)})=>(void);
}

let store:Store;
let notifier:Notifier;
let storeManager: StoreManager;

export function init(newStore:Store, newNotifier: Notifier, newStoreManager: StoreManager) {
    store = newStore;
    notifier = newNotifier;
    storeManager = newStoreManager;
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

export function getStoreManager() {
    if( storeManager === undefined) {
        throw new Error("Notifier not initialized");
    }
    return storeManager;
}

type mapStateToPropsDirectFunc<TOwnProps, State, TStateProps> = (state: State, ownProps: TOwnProps)=>TStateProps;

interface IMapStateToProps<TOwnProps, State, TStateProps> {
    mapStateToProps : mapStateToPropsDirectFunc<TOwnProps, State, TStateProps> | (()=>(mapStateToPropsDirectFunc<TOwnProps, State, TStateProps>));
}

export function Connect<Class, TOwnProps, State, TStateProps >(
            ctor : (new (props:TOwnProps)=>(React.PureComponent<TOwnProps,State>))&IMapStateToProps<TOwnProps,State, TStateProps>
        )
            : new (props:TOwnProps)=>(React.PureComponent<TOwnProps,State>)
{
    return ReactRedux.connect(ctor.mapStateToProps, null, null, {forwardRef: true} as any)(ctor as any) as any;
}


export { fork }
