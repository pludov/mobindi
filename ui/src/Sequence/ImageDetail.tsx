import * as React from 'react';

import * as Utils from '../Utils';
import * as Store from '../Store';
import * as BackendRequest from '../BackendRequest';
import { atPath } from '../shared/JsonPath';
import FitsViewerWithAstrometry from '../FitsViewerWithAstrometry';
import { AstrometryResult } from '@bo/ProcessorTypes';

type InputProps = {
    currentPath: string;
    detailPath: string;
    // Return undefined to use main astrometry status, null or AstrometryResult to override
    astrometryStatusProvider?: (store: Store.Content, uid:string)=> AstrometryResult|undefined|null;
}

type MappedProps = {
    path: string|null;
    astrometryResult?: AstrometryResult|null|undefined;
}

type Props = InputProps & MappedProps

class ImageDetail extends React.PureComponent<Props> {

    render() {
        return <FitsViewerWithAstrometry
                            contextKey="sequence"
                            path={this.props.path}
                            astrometryResult={this.props.astrometryResult}
                            streamId={null}
                            streamSerial={null}
                            streamDetails={null}
                            subframe={null}
                        />;
    }

    static mapStateToProps(store:Store.Content, ownProps: InputProps):MappedProps {
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
            path: details.path,
            astrometryResult: ownProps.astrometryStatusProvider ? ownProps.astrometryStatusProvider(store, selected) : undefined
        };
    }
}

export default Store.Connect(ImageDetail);
