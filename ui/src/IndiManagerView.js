/**
 * Created by ludovic on 21/07/17.
 */
import React, { Component } from 'react';
import { connect } from 'react-redux';

import { notifier, BackendStatus } from './Store';


class IndiManager extends Component {
    constructor(props) {
        super(props);

        this.state = { value: ''};
    }



    render() {
        var bs = this.props.indiManager;
        if (bs == undefined || bs == null) {
            return null;
        }

        var deviceSelectorOptions;
        if (Object.prototype.hasOwnProperty.call(this.props.indiManager, 'deviceTree')) {
            deviceSelectorOptions = Object.keys(this.props.indiManager.deviceTree).sort().map((item) => <option value={item}>{item}</option>);
        } else {
            deviceSelectorOptions = null;
        }

        var vectors = [];
        var currentDevice = this.props.uiState.selectedDevice;
        if (currentDevice == undefined) currentDevice = "";
        if (currentDevice == "") {
            deviceSelectorOptions.push(<option value=""></option>);
        } else {
            if (Object.prototype.hasOwnProperty.call(this.props.indiManager.deviceTree, currentDevice)) {
                var deviceProps = this.props.indiManager.deviceTree[currentDevice];
                // Parcourir les groupes
                for (var key in deviceProps) {
                    vectors.push(<div>{JSON.stringify(deviceProps[key])}</div>);
                }
            }
        }



        return (
            <div className="Page">
                <div className={'IndiAppState IndiAppState_' + bs.status}>{bs.status}
                </div>

                <div>
                    <select value={currentDevice} onChange={this.switchTo} placeholder="Select device...">
                        {deviceSelectorOptions}
                    </select><br/>
                    {vectors}
                </div>




                <div className="ButtonBar">
                    <input type="button" value="Guide" />
                    <input type="button" value="Stop" />
                </div>
            </div>);
    }
}


const mapStateToProps = function(store) {
    var result = {
        indiManager: store.backend.indiManager,
        uiState:store.indiManager
    };
    return result;
}

export default connect(mapStateToProps)(IndiManager);