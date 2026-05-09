/**
 * DataLoader — renders a loading indicator while backend data is in transit.
 *
 * Usage:
 *   <DataLoader loadingHandle={cameraHandle}>
 *     <MyComponent />
 *   </DataLoader>
 *
 * While `useSubscriptionLoading(cameraHandle)` returns true the fallback is
 * rendered instead of children.  The default fallback is a small CSS spinner;
 * override it with the `fallback` prop.
 */

import * as React from 'react';
import { useSubscriptionLoading } from '../useBackendSubscription';
import { SubscriptionHandle } from '../StateSubscriptionManager';

type Props = {
    loadingHandle: SubscriptionHandle | null;
    /** Content to show while data is being loaded. Defaults to a spinner div. */
    fallback?: React.ReactNode;
    children: React.ReactNode;
};

export default function DataLoader({ loadingHandle, fallback, children }: Props): React.ReactElement {
    const loading = useSubscriptionLoading(loadingHandle);

    if (loading) {
        if (fallback !== undefined) {
            return <>{fallback}</>;
        }
        return (
            <div className="DataLoader-spinner" aria-busy="true" aria-label="Loading…">
                <div className="DataLoader-spinner-inner" />
            </div>
        );
    }

    return <>{children}</>;
}
