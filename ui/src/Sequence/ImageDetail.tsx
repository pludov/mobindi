import * as React from 'react';

import * as Utils from '../Utils';
import * as Store from '../Store';
import * as BackendRequest from '../BackendRequest';
import { atPath } from '../shared/JsonPath';
import FitsViewerWithAstrometry from '../FitsViewerWithAstrometry';

type InputProps = {
    currentPath: string;
    detailPath: string;
}

type MappedProps = {
    path: string|null;
}

type Props = InputProps & MappedProps

class ImageDetail extends React.PureComponent<Props> {

    render() {
        return <FitsViewerWithAstrometry
                            contextKey="sequence"
                            path={this.props.path}
                            streamId={null}
                            streamSerial={null}
                            streamDetails={null}
                            subframe={null}
                        />;
    }

    static mapStateToProps(store:any, ownProps: InputProps):MappedProps {
        var selected = atPath(store, ownProps.currentPath);

        if (!selected) {
            return {
                path: null
            };
        }
        var details = atPath(store, ownProps.detailPath + '[' + JSON.stringify(selected) + ']');
        if (details === undefined) {
            return {path: null};
        }
        return {
            path: details.path
        };
    }
}

export default Store.Connect(ImageDetail);
