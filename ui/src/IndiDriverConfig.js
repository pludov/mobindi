import React, { Component, PureComponent} from 'react';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';
import * as Utils from './Utils';


class IndiDriverConfig extends React.PureComponent {
    constructor(props) {
        super(props);
        this.state = {runningPromise: 0};
    }

    static supportAutoGphotoSensorSize(driver) {
        return driver === 'indi_gphoto_ccd' || driver === 'indi_canon_ccd' || driver === 'indi_nikon_ccd';
    }

    render() {
        return <div>
            <div>{this.props.driverId}</div>
        
            <div className="IndiProperty">
                Auto connect:
                <input
                        type="checkbox"
                        checked={this.props.details.autoConnect ? true : false}
                        onChange={(e) =>
                            {Utils.promiseToState(this.props.app.updateDriverParam(this.props.driverId,
                                            'autoConnect',
                                            e.target.checked
                                    ), this)}}
                                />
            </div>
            {IndiDriverConfig.supportAutoGphotoSensorSize(this.props.driver) ?
                <div>
                    Auto sensor size (gphoto):
                    <input
                            type="checkbox"
                            checked={this.props.details.autoGphotoSensorSize ? true : false}
                            onChange={(e) =>
                                {Utils.promiseToState(this.props.app.updateDriverParam(this.props.driverId,
                                                'autoGphotoSensorSize',
                                                e.target.checked
                                        ), this)}}
                                    />
                </div>
            : null }
        </div>
    }
    static mapStateToProps (store, ownProps) {

        var result = {
            driver: Utils.noErr(()=>store.backend.indiManager.configuration.indiServer.devices[ownProps.driverId].driver || {}, {}),
            details: Utils.noErr(()=>store.backend.indiManager.configuration.indiServer.devices[ownProps.driverId].options || {}, {})
        };
        return result;
    }
}


IndiDriverConfig = connect(IndiDriverConfig.mapStateToProps)(IndiDriverConfig);


export default IndiDriverConfig;