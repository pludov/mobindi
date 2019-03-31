import * as Store from './Store';
import * as Actions from './Actions';

const actions = ()=>({
    ...Store.actions()
})


export function performDispatch(state:Store.Content, type:string, message:any) {
    const realActions = actions();
    console.log('dispatch registry', type, realActions);
    if (Object.prototype.hasOwnProperty.call(realActions, type)) {
        const performer : Actions.Handler<any, string>=realActions[type];
        return performer.executor(state, message)
    }
    return undefined;
}