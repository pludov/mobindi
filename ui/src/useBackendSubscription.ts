/**
 * useBackendSubscription — React hook for on-demand backend state sync.
 *
 * Call this hook inside a component that needs a specific slice of backend
 * state that is excluded from the initial sync (e.g. camera images or per-
 * sequence image stats).  The hook subscribes on mount and unsubscribes
 * automatically on unmount.
 *
 * Usage:
 *   useBackendSubscription("cameraImages", { camera: { images: { byuuid: true } } },
 *       (backend) => Object.keys(backend.camera?.images?.byuuid ?? {}).length > 0);
 *
 * The third argument is an optional `isReady` predicate.  When provided,
 * `useSubscriptionLoading(key)` returns true until the predicate returns true.
 * This lets UI components render a loading indicator while the data is in
 * transit from the backend.
 */

import { useEffect, useRef, useSyncExternalStore } from 'react';
import { WhiteList } from './shared/JsonProxy';
import stateSubscriptionManager, { IsReadyFn } from './StateSubscriptionManager';
import * as Store from './Store';

let nextId = 1;

export function useBackendSubscription(
    key: string,
    whiteList: WhiteList,
    isReady?: IsReadyFn,
): void {
    // Stable subscriber id for the lifetime of this component instance
    const idRef = useRef<string | null>(null);
    if (idRef.current === null) {
        idRef.current = `sub-${nextId++}`;
    }
    const id = idRef.current;

    useEffect(() => {
        stateSubscriptionManager.subscribe(key, whiteList, id, isReady);
        return () => {
            stateSubscriptionManager.unsubscribe(key, id);
        };
        // whiteList and isReady are intentionally excluded from deps: they are
        // expected to be stable module-level constants.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key, id]);
}

/**
 * Returns true while the given subscription key has not yet received data from
 * the backend.  Suitable for showing a loading indicator.
 *
 * The component re-renders automatically when the loading state changes.
 */
export function useSubscriptionLoading(key: string): boolean {
    // useSyncExternalStore needs a subscribe + getSnapshot pair.
    // We subscribe to the manager's change listeners so React knows when to
    // re-check, and snapshot the generation counter so identity changes on
    // every real loading-state update (React uses === to skip re-renders).
    useSyncExternalStore(
        (cb) => stateSubscriptionManager.subscribeToLoadingChanges(cb),
        () => stateSubscriptionManager.getLoadingGeneration(),
    );
    return stateSubscriptionManager.isLoading(key);
}
