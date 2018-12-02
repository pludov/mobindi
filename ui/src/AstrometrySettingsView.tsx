import { connect } from 'react-redux';

import React, { Component, PureComponent} from 'react';
import AstrometryApp from './AstrometryApp';
import PromiseSelector from './PromiseSelector';
import DeviceConnectBton from './DeviceConnectBton';
import PropertyEditor from './PropertyEditor';
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
                    <PropertyEditor.Int accessor={this.props.accessor.child('$.initialFieldMin')}>
                    </PropertyEditor.Int>
                    to
                    <PropertyEditor.Int accessor={this.props.accessor.child('$.initialFieldMax')}>
                    </PropertyEditor.Int>
                </div>

                <PropertyEditor.Int accessor={this.props.accessor.child('$.narrowedFieldPercent')}>
                    Max field variation (%)
                </PropertyEditor.Int>

                <div>
                    <div>
                        <PropertyEditor.Bool accessor={this.props.accessor.child('$.useMountPosition')}>Use mount position</PropertyEditor.Bool>
                    </div>
                    <PropertyEditor.Conditional accessor={this.props.accessor.child("$.useMountPosition")} condition={(e:boolean)=>(!e)}>
                    <div>
                        <PropertyEditor.Int accessor={this.props.accessor.child('$.initialSearchRadius')}>
                            Initial search radius (°)
                        </PropertyEditor.Int>
                    </div>
                    <div>
                        <PropertyEditor.Int accessor={this.props.accessor.child('$.narrowedSearchRadius')}>
                            Synced search radius (°)
                        </PropertyEditor.Int>
                    </div>
                    </PropertyEditor.Conditional>
                </div>
            </div>;
    }
}