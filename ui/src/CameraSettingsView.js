import React, { Component, PureComponent} from 'react';
import { connect } from 'react-redux';
import { atPath } from './shared/JsonPath';
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
        return <div>
            <StatePropCond device={this.props.current} property="CCD_BINNING">
                    <span className='cameraSetting'>
                        <CameraBinEditor
                            device={this.props.current}
                            valuePath={this.props.settingsPath + '.bin'}
                            setValue={this.props.setValue('bin')}/>
                    </span>
            </StatePropCond>

            <StatePropCond device={this.props.current} property="CCD_ISO">
                    <span className='cameraSetting'>
                        <CameraIsoEditor
                            device={this.props.current}
                            valuePath={this.props.settingsPath + '.iso'}
                            setValue={this.props.setValue('iso')} />
                    </span>
            </StatePropCond>

            <StatePropCond device={this.props.current} property="CCD_EXPOSURE">
                    <span className='cameraSetting'>Exp:
                        <CameraExpEditor
                            device={this.props.current}
                            valuePath={this.props.settingsPath + '.exposure'}
                            setValue={this.props.setValue('exposure')}/>
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