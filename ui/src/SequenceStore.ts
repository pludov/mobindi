import * as Actions from "./Actions";
import * as Store from "./Store";
import * as Utils from "./Utils";

export type SequenceStoreContent = {
    currentSequence: string|undefined;
    editingSequence: string|undefined;
    currentImage: string|undefined;
}

export type Content = {
    sequence: SequenceStoreContent;
}


function adjuster(store:Store.Content):Store.Content {
    if (store.backend.camera !== undefined) {
        const currentSequence = store.sequence.currentSequence;

        // FIXME: choose the first one ?
        if (currentSequence !== undefined && !Utils.has(store.backend.camera.sequences.byuuid, currentSequence)) {
            store = {
                ...store,
                sequence: {
                    ...store.sequence,
                    currentSequence: undefined
                }
            }
        }

        const editingSequence = store.sequence.editingSequence;

        if (editingSequence !== undefined && !Utils.has(store.backend.camera!.sequences.byuuid, editingSequence)) {
            store = {
                ...store,
                sequence: {
                    ...store.sequence,
                    editingSequence: undefined
                }
            }
        }
    }
    return store;
}

const setCurrentImage=(state: Store.Content, payload: {image: string})=>{
    if (state.sequence.currentImage === payload.image) {
        return state;
    }
    
    return {
        ...state,
        sequence: {
            ...state.sequence,
            currentImage: payload.image,
        }
    }
}

const setCurrentSequence=(state: Store.Content, payload: {sequence: string})=>{
    if (state.sequence.currentSequence === payload.sequence) {
        return state;
    }
    
    return {
        ...state,
        sequence: {
            ...state.sequence,
            currentSequence: payload.sequence,
        }
    }
}

const setEditingSequence=(state: Store.Content, payload: {sequence: string|undefined})=>{
    if (state.sequence.editingSequence === payload.sequence) {
        return state;
    }
    
    return {
        ...state,
        sequence: {
            ...state.sequence,
            editingSequence: payload.sequence,
        }
    }
}

const actions = {
    setCurrentImage,
    setCurrentSequence,
    setEditingSequence,
}

export type Actions = typeof actions;

Actions.register<Actions>(actions);

export const initialState:Content = {
    sequence: {
        currentImage: undefined,
        currentSequence: undefined,
        editingSequence: undefined,
    }
}

export function adjusters() {
    return [
        adjuster
    ]
};
