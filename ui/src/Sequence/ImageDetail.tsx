import * as React from 'react';

import * as Utils from '../Utils';
import * as Store from '../Store';
import * as BackendRequest from '../BackendRequest';
import { atPath } from '../shared/JsonPath';
import FitsViewerWithAstrometry from '../FitsViewerWithAstrometry';
import stateSubscriptionManager, { SubscriptionHandle } from '../StateSubscriptionManager';
import { WhiteList } from '../shared/JsonProxy';

const CAMERA_IMAGES_WL: WhiteList = { props: { camera: { props: { images: { props: { byuuid: true } } } } } };

type InputProps = {
    currentPath: string;
    detailPath: string;
}

type MappedProps = {
    imageUuid: string|null;
    path: string|null;
}

type Props = InputProps & MappedProps

class ImageDetail extends React.PureComponent<Props> {
    private cameraSubscription: SubscriptionHandle | null = null;

    componentDidMount() {
        this.cameraSubscription = stateSubscriptionManager.subscribe(CAMERA_IMAGES_WL);
    }

    componentWillUnmount() {
        if (this.cameraSubscription !== null) {
            stateSubscriptionManager.unsubscribe(this.cameraSubscription);
            this.cameraSubscription = null;
        }
    }

    render() {
        return <FitsViewerWithAstrometry
                            contextKey="sequence"
                            imageUuid={this.props.imageUuid}
                            path={this.props.path}
                            streamId={null}
                            streamSerial={null}
                            streamDetails={null}
                            subframe={null}
                        />;
    }

    static mapStateToProps(store:Store.Content, ownProps: InputProps):MappedProps {
        const selected = atPath(store, ownProps.currentPath);

        if (!selected) {
            return {
                path: null,
                imageUuid: null
            };
        }
        const details = atPath(store, ownProps.detailPath + '[' + JSON.stringify(selected) + ']');
        if (details === undefined) {
            return {path: null, imageUuid: null};
        }
        return {
            imageUuid: selected,
            path: details.path,
        };
    }
}

export default Store.Connect(ImageDetail);
