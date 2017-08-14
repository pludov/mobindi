import React, { Component, PureComponent} from 'react';
import { notifier, BackendStatus } from './Store';
import { connect } from 'react-redux';
import { atPath } from './shared/JsonPath';
import FitsViewer from './FitsViewer';
import StatePropCond from './StatePropCond';
import CameraBinEditor from './CameraBinEditor';
import CameraIsoEditor from './CameraIsoEditor';
import CameraExpEditor from './CameraExpEditor';
import './CameraView.css'




class CameraSettingsView extends PureComponent {
    // props:
    //      settingsPath: path to currentSettings,
    //      activePath: path to the property that hold the camera id
    //      setValue: (key)=>(value)=>promise
    constructor(props) {
        super(props);
    }

    render() {
        var devTreeRoot = 'backend.indiManager.deviceTree[' + (this.props.current === null ? '?(false)' : JSON.stringify(this.props.current)) + ']';
        return <div>
            <StatePropCond path={devTreeRoot + '.CCD_BINNING'}>
                    <span className='cameraSetting'>
                        <CameraBinEditor
                            descPath={devTreeRoot + '.CCD_BINNING'}
                            valuePath={this.props.settingsPath + '.bin'}
                            setValue={this.props.setValue('bin')}/>
                    </span>
            </StatePropCond>
            <StatePropCond path={devTreeRoot + '.CCD_ISO'}>
                    <span className='cameraSetting'>
                        <CameraIsoEditor
                            descPath={devTreeRoot+ '.CCD_ISO'}
                            valuePath={this.props.settingsPath + '.iso'}
                            setValue={this.props.setValue('iso')} />
                    </span>

            </StatePropCond>


            <StatePropCond path={devTreeRoot + '.CCD_EXPOSURE'}>
                    <span className='cameraSetting'>Exp:
                        <CameraExpEditor
                            descPath={devTreeRoot+ '.CCD_EXPOSURE'}
                            valuePath={this.props.settingsPath + '.exp'}
                            setValue={this.props.setValue('exp')}/>
                    </span>
            </StatePropCond>
        </div>;
    }

    static mapStateToProps = function(store, ownProps) {
        return ({
            current: atPath(store, ownProps.activePath)
        });
    }
}


export default connect(CameraSettingsView.mapStateToProps)(CameraSettingsView);