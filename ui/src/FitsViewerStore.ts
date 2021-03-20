import { update } from './shared/Obj';
import * as Actions from "./Actions";
import * as Store from "./Store";

export type Content = {
    viewSettings: {[id:string]: any};
}

export const initialState: Content = {
    viewSettings: {}
}

export function onImport(t:Content) {
    t.viewSettings = t.viewSettings || {};
}

// Swallow copy of the store. Do not inplace modify childs
export function onExport(t:Content) {
}

const setViewerState=(state: Store.Content, payload: {context: string, viewSettings: any})=> {
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

export type FitsViewerActions = typeof actions;

Actions.register<FitsViewerActions>(actions);

export function adjusters():Array<(state:Store.Content)=>Store.Content> {
    return [];
}
