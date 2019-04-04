import * as Store from './Store';


export type Handler<Payload>=(store:Store.Content, payload:Payload)=>(Store.Content);
export type DictionaryDispatcher<Dictionary, id extends keyof Dictionary>
        = (payload: Dictionary[id] extends Handler<infer Payload> ? Payload : never)=>(void);

function privateDispatch(id:string, payload:any) {
    return Store.getStore().dispatch({type: id, ...payload})

}
export function dispatch<Dictionary>(id:keyof Dictionary):DictionaryDispatcher<Dictionary, typeof id> {
    return (payload)=>privateDispatch(id as string, payload);
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

