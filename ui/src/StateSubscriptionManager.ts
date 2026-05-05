/**
 * StateSubscriptionManager — ref-counted dynamic whitelist subscriptions
 * with loading-state tracking.
 *
 * Components call subscribe() on mount to request that specific backend state
 * paths be synced, and unsubscribe() on unmount to release that request.
 * When the set of active subscriptions changes, the merged dynamic whitelist
 * is recomputed and pushed to the backend via the Notifier.
 *
 * An optional `isReady` predicate can be supplied with each subscription key.
 * The manager watches the Redux store after the subscription is registered;
 * once the predicate returns true the key is removed from the loading set and
 * UI components rendering a loading indicator will hide it.
 */

import { WhiteList, mergeWhiteList } from './shared/JsonProxy';
import * as Store from './Store';

/** Predicate called after each Redux state change to detect when data arrived. */
export type IsReadyFn = (backend: Store.Content["backend"]) => boolean;

type SubscriptionEntry = {
    whiteList: WhiteList;
    isReady?: IsReadyFn;
    subscribers: Set<string>;
};

type ChangeListener = () => void;

class StateSubscriptionManager {
    private subscriptions: Map<string, SubscriptionEntry> = new Map();
    /** Keys whose data has not yet arrived from the backend. */
    private loadingKeys: Set<string> = new Set();
    /** Monotonically increasing counter — bumped whenever loadingKeys changes. */
    private loadingGeneration: number = 0;
    private changeListeners: Set<ChangeListener> = new Set();
    private storeUnsubscribe: (() => void) | undefined;

    /**
     * Register interest in the given whitelist fragment under a logical key.
     *
     * @param key        Logical name for this subscription (e.g. "cameraImages").
     * @param whiteList  The whitelist fragment to merge into the dynamic whitelist.
     * @param id         Unique subscriber id (e.g. a component instance id).
     * @param isReady    Optional predicate: returns true once data for this key
     *                   is present in the Redux store backend slice.
     */
    subscribe(key: string, whiteList: WhiteList, id: string, isReady?: IsReadyFn): void {
        let entry = this.subscriptions.get(key);
        if (!entry) {
            entry = { whiteList, isReady, subscribers: new Set() };
            this.subscriptions.set(key, entry);
            if (isReady) {
                this.loadingKeys.add(key);
                this.loadingGeneration++;
                this.ensureStoreSubscription();
                this.notifyChangeListeners();
            }
        }
        entry.subscribers.add(id);
        this.flush();
    }

    /**
     * Release a previously registered subscription.
     * When no subscribers remain for a key, the whitelist fragment is removed.
     */
    unsubscribe(key: string, id: string): void {
        const entry = this.subscriptions.get(key);
        if (!entry) return;
        entry.subscribers.delete(id);
        if (entry.subscribers.size === 0) {
            this.subscriptions.delete(key);
            if (this.loadingKeys.delete(key)) {
                this.loadingGeneration++;
                this.notifyChangeListeners();
            }
        }
        this.flush();
    }

    /** Returns true while the backend has not yet sent data for this key. */
    isLoading(key: string): boolean {
        return this.loadingKeys.has(key);
    }

    /**
     * Subscribe to loading-state changes for use with `useSyncExternalStore`.
     * Returns an unsubscribe function.
     */
    subscribeToLoadingChanges(listener: ChangeListener): () => void {
        this.changeListeners.add(listener);
        return () => this.changeListeners.delete(listener);
    }

    /**
     * Returns a stable snapshot value for `useSyncExternalStore`.
     * React uses referential equality; returning the generation counter as a
     * number means React re-renders only when loading state actually changes.
     */
    getLoadingGeneration(): number {
        return this.loadingGeneration;
    }

    /** Returns the merged dynamic whitelist from all active subscriptions. */
    getDynamicWhiteList(): WhiteList {
        let merged: WhiteList = {};
        for (const entry of this.subscriptions.values()) {
            merged = mergeWhiteList(merged, entry.whiteList);
            if (merged === undefined) return undefined; // include-all: can't get more permissive
        }
        return merged;
    }

    /** Push the current merged whitelist to the backend. */
    private flush(): void {
        try {
            const notifier = Store.getNotifier();
            notifier.setDynamicWhiteList(this.getDynamicWhiteList());
        } catch {
            // Store not yet initialised (e.g. during tests) — ignore
        }
    }

    private notifyChangeListeners(): void {
        for (const listener of this.changeListeners) {
            listener();
        }
    }

    /** Set up a one-time Redux store subscription to detect when data arrives. */
    private ensureStoreSubscription(): void {
        if (this.storeUnsubscribe) return;
        try {
            const store = Store.getStore();
            this.storeUnsubscribe = store.subscribe(() => {
                this.checkLoadingKeys(store.getState());
            });
        } catch {
            // Store not yet ready — will retry next time subscribe() is called
        }
    }

    private checkLoadingKeys(state: Store.Content): void {
        let changed = false;
        for (const [key, entry] of this.subscriptions.entries()) {
            if (!entry.isReady) continue;
            const ready = entry.isReady(state.backend);
            const wasLoading = this.loadingKeys.has(key);
            if (ready && wasLoading) {
                // Data arrived
                this.loadingKeys.delete(key);
                changed = true;
            } else if (!ready && !wasLoading) {
                // Data disappeared (e.g. reconnect reset the store)
                this.loadingKeys.add(key);
                changed = true;
            }
        }
        if (changed) {
            this.loadingGeneration++;
            this.notifyChangeListeners();
        }
    }
}

const stateSubscriptionManager = new StateSubscriptionManager();
export default stateSubscriptionManager;

