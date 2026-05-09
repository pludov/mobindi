/**
 * StateSubscriptionManager — ref-counted dynamic whitelist subscriptions
 * with loading-state tracking.
 *
 * Components call subscribe() on mount to request that specific backend state
 * paths be synced, and unsubscribe() on unmount to release that request.
 * When the set of active subscriptions changes, the merged dynamic whitelist
 * is recomputed and pushed to the backend via the Notifier.
 *
 * Loading is driven by dataTag acknowledgements from the backend.
 * Each dynamic whitelist flush sends a monotonically increasing tag; once the
 * backend replies with the same (or newer) tag in welcome/update messages,
 * all keys waiting on that tag are marked as loaded.
 */

import { WhiteList, mergeWhiteList } from './shared/JsonProxy';
import * as Store from './Store';

type SubscriptionEntry = {
    whiteList: WhiteList;
    subscribers: Set<string>;
    loading: boolean;
    waitingTag?: number;
};

type ChangeListener = () => void;

class StateSubscriptionManager {
    private subscriptions: Map<string, SubscriptionEntry> = new Map();
    private nextPendingTag = 0;
    private flushTimer: NodeJS.Timeout | undefined;
    private lastSentWhiteListJson: string | undefined;
    private notifierDataTagUnsubscribe: (() => void) | undefined;
    /** Monotonically increasing counter — bumped whenever loadingKeys changes. */
    private loadingGeneration: number = 0;
    private changeListeners: Set<ChangeListener> = new Set();

    /**
     * Register interest in the given whitelist fragment under a logical key.
     *
     * @param key        Logical name for this subscription (e.g. "cameraImages").
     * @param whiteList  The whitelist fragment to merge into the dynamic whitelist.
     * @param id         Unique subscriber id (e.g. a component instance id).
     */
    subscribe(key: string, whiteList: WhiteList, id: string): void {
        let entry = this.subscriptions.get(key);
        if (!entry) {
            entry = { whiteList, subscribers: new Set(), loading: true, waitingTag: this.nextPendingTag };
            this.subscriptions.set(key, entry);
            this.loadingGeneration++;
            this.notifyChangeListeners();
        }
        entry.subscribers.add(id);
        this.scheduleFlush();
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
            if (entry.loading) {
                this.loadingGeneration++;
                this.notifyChangeListeners();
            }
        }
        this.scheduleFlush();
    }

    /** Returns true while the backend has not yet sent data for this key. */
    isLoading(key: string): boolean {
        const entry = this.subscriptions.get(key);
        return entry !== undefined && entry.loading;
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

    private scheduleFlush(): void {
        if (this.flushTimer !== undefined) return;
        this.flushTimer = setTimeout(() => {
            this.flushTimer = undefined;
            this.flush();
        }, 0);
    }

    /** Push the current merged whitelist to the backend. */
    private flush(): void {
        try {
            const notifier = Store.getNotifier();
            this.ensureNotifierDataTagSubscription(notifier);
            const merged = this.getDynamicWhiteList();
            const mergedJson = JSON.stringify(merged);
            
            // Check if we have entries waiting for the next tag to be acknowledged
            const hasPendingTags = Array.from(this.subscriptions.values()).some(
                entry => entry.waitingTag === this.nextPendingTag
            );
            
            // Skip only if content hasn't changed AND there are no pending tags waiting
            if (mergedJson === this.lastSentWhiteListJson && !hasPendingTags) {
                return;
            }
            this.lastSentWhiteListJson = mergedJson;

            const dataTag = `wl-${this.nextPendingTag}`;
            this.nextPendingTag++;
            notifier.setDynamicWhiteList(merged, dataTag);
        } catch {
            // Store not yet initialised (e.g. during tests) — ignore
        }
    }

    private notifyChangeListeners(): void {
        for (const listener of this.changeListeners) {
            listener();
        }
    }

    private ensureNotifierDataTagSubscription(notifier: { subscribeToDataTag: (listener: (tag: string)=>void)=>()=>void }): void {
        if (this.notifierDataTagUnsubscribe) return;
        this.notifierDataTagUnsubscribe = notifier.subscribeToDataTag((tag: string) => {
            this.onDataTagReceived(tag);
        });
    }

    private onDataTagReceived(tag: string): void {
        const m = /^wl-(\d+)$/.exec(tag);
        if (!m) return;
        const acked = parseInt(m[1], 10);
        let changed = false;
        for (const entry of this.subscriptions.values()) {
            const waitingTag = entry.waitingTag;
            if (entry.loading && waitingTag !== undefined && waitingTag <= acked) {
                entry.loading = false;
                delete entry.waitingTag;
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

