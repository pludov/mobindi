import * as React from 'react';
import stateSubscriptionManager, { SubscriptionHandle } from './StateSubscriptionManager';
import { WhiteList } from '@bo/JsonProxy';

/**
 * Export a new component that receives the same props, but that derive a backend whitelist and add a fields "subscriptionReady" to the props
 */
export function withBackendSubscriptionToProp<P, PROP extends string>(
                        WrappedComponent: React.ComponentType<P>, 
                        whitelistProvider: () => (props: Omit<P, PROP>) => WhiteList|undefined, 
                        propName: PROP): React.ComponentType<Omit<P, PROP>> {
    type Props = Omit<P, PROP>;
    type State = {
        whitelist: WhiteList|undefined;
        ready: boolean;
    };
    return class extends React.Component<Props, State> {
        private subscription: SubscriptionHandle | null = null;
        private subscriptionListener: (() => void) | null = null;
        private whitelistProvider: (props: Omit<P, PROP>) => WhiteList|undefined = whitelistProvider();

        constructor(props: Props) {
            super(props);
            this.state = {
                whitelist: undefined,
                ready: true
            };
        }

        unsubscribe() {
            if (this.subscription) {
                stateSubscriptionManager.unsubscribe(this.subscription);
                this.subscription = null;
            }
        }

        subscribe() {
            const whitelist = this.whitelistProvider(this.props);
            if (whitelist) {
                this.subscription = stateSubscriptionManager.subscribe(whitelist);
            }
        }

        stateSync() {
            const ready = this.subscription ? !stateSubscriptionManager.isLoading(this.subscription) : true;
            if (ready !== this.state.ready) {
                console.log(`Ready state changed to ${ready}, updating`);
                this.setState({ ready });
            } else {
                console.log(`Ready state unchanged: ${ready}`);
            }
        }

        onLoading() {
            this.stateSync();
        }

        componentDidMount() {
            this.subscriptionListener = stateSubscriptionManager.subscribeToLoadingChanges(this.onLoading.bind(this));
            this.subscribe();
            this.stateSync();
        }

        componentDidUpdate(prevProps: Props) {
            const whitelist = this.whitelistProvider(this.props);
            if (whitelist !== this.state.whitelist) {
                console.log('Subscription whitelist changed, resubscribing');
                this.unsubscribe();
                this.subscribe();
                this.stateSync();
            }
        }

        componentWillUnmount() {
            if (this.subscriptionListener) {
                this.subscriptionListener();
                this.subscriptionListener = null;
            }
            this.unsubscribe();
            this.stateSync();
        }

        render() {
            const subscriptionStatus = this.state.ready;
            const props : React.PropsWithChildren<P> ={
                ...this.props,
                [propName]: subscriptionStatus,
            } as any;
            return <WrappedComponent {...props} />;
        }
     }
}

export default withBackendSubscriptionToProp;

