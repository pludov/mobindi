import { StoreEnhancer } from 'redux';

export type PersistOptions<S> = {
    key?: string;
    // Extract the persistable part of the state
    slicer: (state: S) => any;
    // Parse a stored string into a (partial) state
    deserialize: (data: string) => any;
};

// Replacement for the unmaintained redux-localstorage: restores state at store creation
// (shallow merge over the initial state) and saves it after every dispatch.
export function persistState<S>(options: PersistOptions<S>): StoreEnhancer {
    const key = options.key || 'redux';

    return (createStore: any) => (reducer: any, initialState: any) => {
        let persisted: any;
        try {
            const raw = localStorage.getItem(key);
            if (raw) {
                persisted = options.deserialize(raw);
            }
        } catch(e) {
            console.warn('Unable to restore persisted state', e);
        }
        const defaultState = initialState === undefined
            ? reducer(undefined, {type: '@@redux/INIT'})
            : initialState;
        const preloadedState = persisted ? {...defaultState, ...persisted} : initialState;
        const store = createStore(reducer, preloadedState);

        store.subscribe(() => {
            try {
                localStorage.setItem(key, JSON.stringify(options.slicer(store.getState())));
            } catch(e) {
                console.warn('Unable to persist state', e);
            }
        });
        return store;
    };
}
