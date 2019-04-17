import { update } from './shared/Obj';
import * as Actions from "./Actions";
import * as Store from "./Store";

export type Content = {
    viewSettings: {[id:string]: any};
}

export const initialState: Content = {
    viewSettings: {}
}

const setViewerState=(state: Store.Content, payload: {context: string, viewSettings: any})=> {

    console.log('WTF: save context ' , payload.context, ' parameters to ', payload.viewSettings);
    return update(state, {
        $mergedeep: {
            viewSettings: {
                [payload.context]: payload.viewSettings
            }
        }
    } as any);
};


export function getViewerState(store:Store.Content, context: string)
{
    try {
        return store.viewSettings[context];
    }catch(error) {
        return undefined;
    }
}

const actions = {
    setViewerState,
}

export type Actions = typeof actions;

Actions.register<Actions>(actions);

export function adjusters():Array<(state:Store.Content)=>Store.Content> {
    return [];
}
