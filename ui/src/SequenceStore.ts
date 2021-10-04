import { Sequence } from "@bo/BackOfficeStatus";
import * as Actions from "./Actions";
import * as Store from "./Store";
import * as Utils from "./Utils";
import { BackendAccessorImpl } from "./utils/BackendAccessor";

import * as BackendRequest from "./BackendRequest";
import * as Accessor from './shared/AccessPath';
import CancellationToken from "cancellationtoken";
import JsonProxy, { Diff } from "./shared/JsonProxy";
import StorePatchAccessor from "./utils/StorePatchAccessor";

export type SequenceStoreContent = {
    currentSequence: string|undefined;
    editingSequence: string|undefined;
    currentImage: string|undefined;
    currentImageAutoSelectSerial?: number;
    currentIsLast?: boolean;
    currentMonitoringView?: "activity"|"fwhm"|"background";
    lastMonitoringView?: "activity"|"fwhm"|"background";
}

export type Content = {
    sequence: SequenceStoreContent;
}


class SequenceAccessor extends BackendAccessorImpl<Sequence> {
    private sequenceUid: string;
    constructor(sequenceUid: string) {
        super(Accessor.For((e)=>e.sequence!.sequences.byuuid[sequenceUid!]));
        this.sequenceUid = sequenceUid;
    }

    public apply = async (jsonDiff:Diff):Promise<void>=>{
        if (this.sequenceUid === null) {
            throw new Error("No imaging setup selected");
        }
        await BackendRequest.RootInvoker("sequence")("patchSequence")(
            CancellationToken.CONTINUE,
            {
                sequenceUid: this.sequenceUid,
                patch: jsonDiff
            }
        );
    }
}

export class SequenceStoreContentAccessor extends StorePatchAccessor<SequenceStoreContent>
{
    constructor() {
        super();
    }

    protected async apply(jsonDiff: Diff) {
        Actions.dispatch<SequenceActions>()("patchSequenceStoreContent", {diff: jsonDiff});
    }

    fromStore(store:Store.Content) {
        return store.sequence;
    }
}

export const sequenceAccessor = (sequenceUid: string)=>new SequenceAccessor(sequenceUid);


function adjuster(store:Store.Content):Store.Content {
    if (store.backend.sequence !== undefined) {
        const currentSequence = store.sequence.currentSequence;

        // FIXME: choose the first one ?
        if (currentSequence !== undefined && !Utils.has(store.backend.sequence.sequences.byuuid, currentSequence)) {
            store = {
                ...store,
                sequence: {
                    ...store.sequence,
                    currentSequence: undefined
                }
            }
        }

        const editingSequence = store.sequence.editingSequence;

        if (editingSequence !== undefined && !Utils.has(store.backend.sequence!.sequences.byuuid, editingSequence)) {
            store = {
                ...store,
                sequence: {
                    ...store.sequence,
                    editingSequence: undefined
                }
            }
        }
    }

    if (store.sequence.currentIsLast && store.sequence.currentSequence !== undefined && store.backend.sequence !== undefined) {
        const currentSequence = store.sequence.currentSequence;

        const sequence = Utils.getOwnProp(store.backend.sequence.sequences.byuuid, currentSequence);
        if (sequence !== undefined && sequence.images.length) {
            const lastImage = sequence.images[sequence.images.length - 1];
            if (lastImage !== store.sequence.currentImage) {
                store = {
                    ...store,
                    sequence: {
                        ...store.sequence,
                        currentImage: lastImage,
                        currentImageAutoSelectSerial: (store.sequence.currentImageAutoSelectSerial||0) + 1,
                    }
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
    const currentSequence = state.sequence.currentSequence;

    let currentIsLast = false;
    const sequence = Utils.getOwnProp(state.backend.sequence?.sequences.byuuid, currentSequence);
    if (sequence) {
        if (sequence.images.length && payload.image === sequence.images[sequence.images.length - 1]) {
            currentIsLast = true;
        }
    }

    return {
        ...state,
        sequence: {
            ...state.sequence,
            currentImage: payload.image,
            currentIsLast
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
            currentImage: undefined,
            currentIsLast: true,
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

const patchSequenceStoreContent=(state: Store.Content, payload: {diff: Diff})=>{

    const sequence:SequenceStoreContent = JsonProxy.applyDiff(state.sequence, payload.diff);
    if (sequence === state.sequence) {
        return state;
    }
    if (sequence.currentMonitoringView !== sequence.lastMonitoringView && sequence.currentMonitoringView) {
        sequence.lastMonitoringView = sequence.currentMonitoringView;
    }
    return {
        ...state,
        sequence
    }
}

const actions = {
    setCurrentImage,
    setCurrentSequence,
    setEditingSequence,
    patchSequenceStoreContent,
}

export type SequenceActions = typeof actions;

Actions.register<SequenceActions>(actions);

export const initialState:Content = {
    sequence: {
        currentImage: undefined,
        currentSequence: undefined,
        editingSequence: undefined,
        currentImageAutoSelectSerial: undefined,
        currentIsLast: true,
    }
}

export function onImport(t:Content) {
    t.sequence = t.sequence || {};
    t.sequence.currentImage = t.sequence.currentImage || undefined;
    t.sequence.currentSequence = t.sequence.currentSequence|| undefined;
    t.sequence.editingSequence = t.sequence.editingSequence || undefined;
}

// Swallow copy of the store. Do not inplace modify childs
export function onExport(t:Content) {
}

export function adjusters() {
    return [
        adjuster
    ]
};
