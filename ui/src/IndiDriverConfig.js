import React, { Component, PureComponent} from 'react';
import PropTypes from 'prop-types';
import { notifier, BackendStatus } from './Store';
import { connect } from 'react-redux';
import * as Utils from './Utils';


class IndiDriverConfig extends React.PureComponent {
    constructor(props) {
        super(props);
        this.state = {runningPromise: 0};
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
        </div>
    }
    static mapStateToProps (store, ownProps) {
        var result = {
            details: Utils.noErr(()=>store.backend.indiManager.configuration.indiServer.devices[ownProps.driverId].options || {}, {})
        };
        return result;
    }
}


IndiDriverConfig = connect(IndiDriverConfig.mapStateToProps)(IndiDriverConfig);


export default IndiDriverConfig;