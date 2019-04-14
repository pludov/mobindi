import * as Redux from 'redux';
import * as Store from './Store';


export type Handler<Payload>=(store:Store.Content, payload:Payload)=>(Store.Content);
export type DictionaryDispatcher<Dictionary>
        = <ID extends keyof Dictionary>(id: ID, payload: Dictionary[ID] extends Handler<infer Payload> ? Payload : never)=>(void);

function privateDispatch(id:string, store:Redux.Store<Store.Content>, payload:any) {
    return store.dispatch({type: id, ...payload})

}

export function dispatch<Dictionary>(store?:Redux.Store<Store.Content>):DictionaryDispatcher<Dictionary> {
    if (store === undefined) {
        store = Store.getStore();
    }
    return (id, payload)=>privateDispatch(id as string, store!, payload);
}


export let registry : {[id:string]: Handler<any>} = {};

export function register<TYPE extends {[id: string] : Handler<any>}>(actions: TYPE)
{
    if (registry === undefined) {
        registry = {};
    }
    for(const id of Object.keys(actions)) {
        registry[id] = actions[id];
    }
}

// // Usage example:
// export type MesDispatchers = {
//     plante: ActionDispatcher<{id: string}>;
// }
//
// register<MesDispatchers>({
//     plante: (state, payload)=>{console.log(payload.id); return state},
// })
//
// // In action:
// dispatch<MesDispatchers>("plante")({id:"plop"});

