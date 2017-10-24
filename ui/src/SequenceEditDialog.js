import React, { Component, PureComponent} from 'react';
import PropTypes from 'prop-types';
import { notifier, BackendStatus } from './Store';
import { connect } from 'react-redux';

import * as Utils from './Utils';
import PromiseSelector from './PromiseSelector';
import * as Promises from './shared/Promises';
import Table from './Table';
import { atPath } from './shared/JsonPath';
import './SequenceView.css';
import './Modal.css';
import TextEdit from "./TextEdit.js";
import CameraBinEditor from './CameraBinEditor';
import CameraIsoEditor from './CameraIsoEditor';
import CameraExpEditor from './CameraExpEditor';


// TODO : create a "new" item list in sequence (in PromiseSeletor)
// TODO : create a full screen sequence editor (a component that can be added as top level of the view)
//   Field: Name
//   Global settings:
//          (mandatory) device
//          (mandatory) exp
//          (optional) bin
//          (optional) iso
//          (mandatory) dithering
//   Sequence (array)
//       (mandatory) type
//       (mandatory) repeat
//       (optional) bin
//       (optional) exp
//       (optional) iso


const CameraSelector = connect((store, ownProps)=> {
    var active = ownProps.getValue(store, ownProps);
    return ({
        active: active,
        availables: store.backend.camera.availableDevices
    })
})(PromiseSelector);

CameraSelector.propTypes = {
    getValue: PropTypes.func.isRequired
}

class KeepValue extends PureComponent {
    constructor(props) {
        super(props);
        this.state = { forceVisibility : false};
    }
    render() {
        return (<span>
            <input
                    type='checkbox'
                    checked={this.props.visible || this.state.forceVisibility}
                    onChange={(e)=>this.changeState(e.target.checked)}/>
            {this.props.visible || this.state.forceVisibility ? this.props.children: null}
        </span>)
    }

    changeState(to) {
        var self = this;
        if (to) {
            this.setState({forceVisibility: true});
        } else {
            this.setState({forceVisibility: false});
            this.props.setValue(null).start();
        }
    }

    static mapStateToProps(store, ownProps) {
        var selected = atPath(store, ownProps.valuePath);
        return {
            visible: (selected !== undefined && selected !== null)
        };
    }
}

KeepValue = connect(KeepValue.mapStateToProps)(KeepValue);

KeepValue.propTypes = {
    valuePath: PropTypes.string.isRequired
}

class SequenceEditDialog extends PureComponent {
    constructor(props) {
        super(props);
    }

    render() {
        if (!this.props.visible) {
            return null;
        }
        var self =this;
        var devTreeRoot = 'backend.indiManager.deviceTree[' + (!this.props.details.camera? '?(false)' : JSON.stringify(this.props.details.camera)) + ']';
        var settingsPath = 'backend.camera.sequences.byuuid[' + JSON.stringify(this.props.uid) + ']';

        var exposureParam = {
            valuePath: settingsPath + '.exposure',
            set: (e)=>self.props.app.updateSequenceParam(self.props.uid, {param: 'exposure', value: e})
        };

        var binningParam = {
            valuePath: settingsPath + '.binning',
            set: (e)=>self.props.app.updateSequenceParam(self.props.uid, {param: 'binning', value: e})
        };

        var isoParam = {
            valuePath: settingsPath + '.iso',
            set: (e)=>self.props.app.updateSequenceParam(self.props.uid, {param: 'iso', value: e})
        };

        return <div className="Modal">
            <div className="ModalContent">
                <div className="IndiProperty">
                        Title:
                        <TextEdit 
                            value={this.props.details.title}
                            onChange={(e)=> {Utils.promiseToState(this.props.app.updateSequenceParam(this.props.uid, {param: 'title', value: e}), this)}}/>
                </div>
                <div className="IndiProperty">
                        Camera:
                        <CameraSelector
                            getValue={(store)=>Utils.noErr(()=>store.backend.camera.sequences.byuuid[this.props.uid].camera)}
                            setValue={(e)=>this.props.app.updateSequenceParam(this.props.uid, {param: 'camera', value: e})}
                        />
                </div>
                <div className="IndiProperty">
                        Exp:
                        <KeepValue app={this.props.app}
                                valuePath={exposureParam.valuePath}
                                setValue={exposureParam.set}>
                            <CameraExpEditor
                                descPath={devTreeRoot+ '.CCD_EXPOSURE'}
                                valuePath={exposureParam.valuePath}
                                setValue={exposureParam.set}
                            />
                        </KeepValue>
                </div>
                <div className="IndiProperty">
                        Bin:
                        <KeepValue app={this.props.app}
                                valuePath={binningParam.valuePath}
                                setValue={binningParam.set}>
                            <CameraBinEditor
                                descPath={devTreeRoot+ '.CCD_BINNING'}
                                valuePath={binningParam.valuePath}
                                setValue={binningParam.set}
                            />
                        </KeepValue>
                </div>
                <div className="IndiProperty">
                        Iso:
                        <KeepValue app={this.props.app} 
                                valuePath={isoParam.valuePath}
                                setValue={isoParam.set}>
                            <CameraIsoEditor
                                descPath={devTreeRoot+ '.CCD_ISO'}
                                valuePath={isoParam.valuePath}
                                setValue={isoParam.set}
                            />
                        </KeepValue>
                </div>

                <input type='button' value='Fermer' onClick={e=>this.props.app.closeSequenceEditor()}/>
            </div>
        </div>;
    }

    static mapStateToProps(store, ownProps) {
        var selected = atPath(store, ownProps.currentPath);
        if (!selected) {
            return {
                visible: false,
                uid:undefined
            };
        }
        console.log('WTF selected is ' + selected);
        var details = Utils.noErr(()=>store.backend.camera.sequences.byuuid[selected], undefined);
        if (details == undefined) {
            throw "C'est ici qu'on devrait pas arriver"
            return {
                visible: false,
                uid: undefined
            };
        }
        return {
            visible:true,
            uid: selected,
            details: details
        };
    }
}

SequenceEditDialog = connect(SequenceEditDialog.mapStateToProps)(SequenceEditDialog);

SequenceEditDialog.propTypes = {
    currentPath: PropTypes.string.isRequired,
    app: PropTypes.object.isRequired
}


export default SequenceEditDialog;