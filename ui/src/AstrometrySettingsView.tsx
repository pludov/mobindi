import { connect } from 'react-redux';

import React, { Component, PureComponent} from 'react';
import Bool from './primitives/Bool';
import Int from './primitives/Int';
import Conditional from './primitives/Conditional';
import BackendAccessor from './utils/BackendAccessor';

type Props = {
    accessor: BackendAccessor;
};


export default class AstrometrySettingsView extends PureComponent<Props> {
    constructor(props:Props) {
        super(props);
    }

    public render() {
        return <div>
                <div>
                    Initial field range (°):
                    <Int accessor={this.props.accessor.child('$.initialFieldMin')}>
                    </Int>
                    to
                    <Int accessor={this.props.accessor.child('$.initialFieldMax')}>
                    </Int>
                </div>

                <Int accessor={this.props.accessor.child('$.narrowedFieldPercent')}>
                    Max field variation (%)
                </Int>

                <div>
                    <div>
                        <Bool accessor={this.props.accessor.child('$.useMountPosition')}>Use mount position</Bool>
                    </div>
                    <Conditional accessor={this.props.accessor.child("$.useMountPosition")} condition={(e:boolean)=>(!e)}>
                    <div>
                        <Int accessor={this.props.accessor.child('$.initialSearchRadius')}>
                            Initial search radius (°)
                        </Int>
                    </div>
                    <div>
                        <Int accessor={this.props.accessor.child('$.narrowedSearchRadius')}>
                            Synced search radius (°)
                        </Int>
                    </div>
                    </Conditional>
                </div>
            </div>;
    }
}