/**
 * useBackendSubscription — React hook for on-demand backend state sync.
 *
 * Call this hook inside a component that needs a specific slice of backend
 * state that is excluded from the initial sync (e.g. camera images or per-
 * sequence image stats).  The hook subscribes on mount and unsubscribes
 * automatically on unmount.
 *
 * Loading completion is driven by backend `dataTag` acknowledgements produced
 * by dynamic whitelist updates.
 */

import { useEffect, useRef, useState } from 'react';
import { WhiteList } from './shared/JsonProxy';
import stateSubscriptionManager, { SubscriptionHandle } from './StateSubscriptionManager';

export function useBackendSubscription(
    whiteList: WhiteList,
): SubscriptionHandle | null {
    const handleRef = useRef<SubscriptionHandle | null>(null);
    const [, setGeneration] = useState(0);

    useEffect(() => {
        handleRef.current = stateSubscriptionManager.subscribe(whiteList);
        setGeneration((x) => x + 1);
        return () => {
            if (handleRef.current !== null) {
                stateSubscriptionManager.unsubscribe(handleRef.current);
                handleRef.current = null;
            }
        };
        // whiteList is intentionally excluded from deps: it is expected to be
        // stable module-level constants.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return handleRef.current;
}

/**
 * Returns true while the given subscription handle has not yet received data
 * from the backend. Suitable for showing a loading indicator.
 *
 * The component re-renders automatically when the loading state changes.
 */
export function useSubscriptionLoading(handle: SubscriptionHandle | null | undefined): boolean {
    // React 16 doesn't have useSyncExternalStore, so we use useState + useEffect.
    // Subscribe to the manager's generation counter to trigger re-renders when
    // loading state changes.
    const [, setGeneration] = useState(stateSubscriptionManager.getLoadingGeneration());

    useEffect(() => {
        const unsubscribe = stateSubscriptionManager.subscribeToLoadingChanges(() => {
            setGeneration(stateSubscriptionManager.getLoadingGeneration());
        });
        return unsubscribe;
    }, []);

    return stateSubscriptionManager.isLoading(handle);
}
