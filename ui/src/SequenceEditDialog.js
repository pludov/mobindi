import React, { Component, PureComponent} from 'react';
import PropTypes from 'prop-types';
import { notifier, BackendStatus } from './Store';
import { connect } from 'react-redux';
import {SortableContainer, SortableElement, arrayMove} from 'react-sortable-hoc';

import * as Utils from './Utils';
import PromiseSelector from './PromiseSelector';
import * as Promises from './shared/Promises';
import Table from './Table';
import { atPath } from './shared/JsonPath';
import './SequenceView.css';
import './Modal.css';
import StatePropCond from './StatePropCond';
import TextEdit from "./TextEdit.js";
import DeviceConnectBton from './DeviceConnectBton';
import CameraBinEditor from './CameraBinEditor';
import CameraIsoEditor from './CameraIsoEditor';
import CameraExpEditor from './CameraExpEditor';
import CameraFrameTypeEditor from './CameraFrameTypeEditor';

// TODO : create a "new" item list in sequence (in PromiseSeletor)
// TODO : create a full screen sequence editor (a component that can be added as top level of the view)
//   Field: Name
//   Global settings:
//          (mandatory) device
//          (mandatory) exposure
//          (optional) bin
//          (optional) iso
//          (mandatory) dithering
//   Sequence (array)
//       (mandatory) type
//       (mandatory) repeat
//       (optional) bin
//       (optional) exposure
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

class SequenceStepEdit extends PureComponent {
    constructor(props) {
        super(props);
        this.state = {};
    }

    // Juste afficher le count
    render() {
        var settingsPath = 'backend.camera.sequences.byuuid[' + JSON.stringify(this.props.sequenceUid) + '].steps.byuuid[' + JSON.stringify(this.props.sequenceStepUid) + ']';
        if (this.props.details === undefined) {
            return null;
        }
        return <div>
            <div className="IndiProperty">
                Type:
                <CameraFrameTypeEditor
                        device={this.props.camera}
                        valuePath={settingsPath + '.type'}
                        setValue={(e)=>this.props.app.updateSequenceParam(this.props.sequenceUid, {sequenceStepUid: this.props.sequenceStepUid, param: 'type', value: e})}
                        />
            </div>
            <div className="IndiProperty">
                Count:
                <TextEdit
                    value={this.props.details.count == null ? "" : this.props.details.count}
                    onChange={(e)=> {Utils.promiseToState(this.props.app.updateSequenceParam(this.props.sequenceUid, {sequenceStepUid: this.props.sequenceStepUid, param: 'count', value: parseInt(e)}), this)}}/>
            </div>
            <div className="IndiProperty">
                Dither:
                <input
                        type="checkbox"
                        checked={this.props.details.dither? true : false}
                        onChange={(e) =>
                            {Utils.promiseToState(this.props.app.updateSequenceParam(this.props.sequenceUid,
                                            {sequenceStepUid: this.props.sequenceStepUid, param: 'dither', value: e.target.checked? 1 : 0}), this)}}
                                />
            </div>
            {!this.props.allowRemove ? null :
                <input 
                    type="button" 
                    value="remove" 
                    onClick={e=>Utils.promiseToState(this.props.app.deleteSequenceStep(this.props.sequenceUid, this.props.sequenceStepUid), this, "dropButtonBusy")}
                    disabled={!!this.state.dropButtonBusy}
                    />
            }
        </div>
    }

    static mapStateToProps(store, ownProps) {
        var details = Utils.noErr(()=>store.backend.camera.sequences.byuuid[ownProps.sequenceUid].steps.byuuid[ownProps.sequenceStepUid], undefined);
        if (details == undefined) {
            return {
                details: undefined
            };
        }
        return {
            details: details
        };
    }

}
SequenceStepEdit = connect(SequenceStepEdit.mapStateToProps)(SequenceStepEdit);

SequenceStepEdit.propTypes = {
    camera: PropTypes.string.isRequired,
    sequenceUid: PropTypes.string.isRequired,
    sequenceStepUid: PropTypes.string.isRequired,
    allowRemove: PropTypes.bool.isRequired,
    app: PropTypes.object.isRequired
}

const SortableItem = SortableElement(({camera, app, sequenceUid, sequenceStepUid, allowRemove})=> {
    return (<li className="SequenceStepMovableBlock"><SequenceStepEdit camera={camera} app={app} sequenceUid={sequenceUid} sequenceStepUid={sequenceStepUid} allowRemove={allowRemove}/></li>);
})

const SortableList = SortableContainer(({items, camera, app, sequenceUid}) => {
    return (
      <ul className="SequenceStepContainer">
        {items.map((sequenceStepUid, index) => (
          <SortableItem
                    key={`item-${index}`}
                    index={index}
                    camera={camera}
                    app={app}
                    sequenceUid={sequenceUid}
                    sequenceStepUid={sequenceStepUid}
                    allowRemove={items.length > 1} />
        ))}
      </ul>
    );
  });

class SequenceEditDialog extends PureComponent {
    constructor(props) {
        super(props);
        this.state = {
            runningMoves: 0,
            overridenList: null,
            overridenListSource: null
        };
        this.moveSteps = this.moveSteps.bind(this);
        this.moveStepsEnd = this.moveStepsEnd.bind(this);
    }

    getCurrentStepList(state, props) {
        if (state.overridenList !== null && state.overridenListSource == props.details.steps.list) {
            return state.overridenList;
        }
        return props.details.steps.list;
    }

    moveStepsEnd() {
        this.setState((state, props) => {
            state = Object.assign({}, state, {runningMoves: state.runningMoves - 1});
            if (state.runningMoves == 0) {
                state.overridenList = null;
                state.overridenListSource = null;
            }
            return state;
        });
    }

    moveSteps({oldIndex, newIndex}) {
        if (oldIndex == newIndex) return;
        var newOrder = arrayMove(this.getCurrentStepList(this.state, this.props), oldIndex, newIndex);
        var initialOrder = this.props.details.steps.list;

        // Update the state, then start a trigger
        this.setState((state, props)=>
            Object.assign(
                    {},
                    state,
                    {
                        overridenList: newOrder,
                        overridenListSource: initialOrder,
                        runningMoves: state.runningMoves + 1
                    }),
            ()=>{
                this.props.app.moveSequenceSteps(this.props.uid, this.getCurrentStepList(this.state, this.props))
                    .then(this.moveStepsEnd)
                    .onError(this.moveStepsEnd)
                    .onCancel(this.moveStepsEnd)
                    .start();
            });
    }

    render() {
        if (!this.props.visible) {
            return null;
        }
        var self =this;
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

        function isParamOverride(store, param) {
            var v = atPath(store, param.valuePath);
            if (v !== null && v !== undefined) return true;
            return undefined;
        }

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
                        <DeviceConnectBton
                            activePath={"$.backend.camera.sequences.byuuid[" + JSON.stringify(this.props.uid) +"].camera"}
                            app={this.props.app}
                        />
                </div>
                <StatePropCond
                            device={this.props.details.camera}
                            property="CCD_EXPOSURE"
                            overridePredicate={(store)=>isParamOverride(store, exposureParam)}>
                    <div className="IndiProperty">
                            Exp:
                            <KeepValue app={this.props.app}
                                    valuePath={exposureParam.valuePath}
                                    setValue={exposureParam.set}>
                                <CameraExpEditor
                                    device={this.props.details.camera}
                                    valuePath={exposureParam.valuePath}
                                    setValue={exposureParam.set}
                                />
                            </KeepValue>
                    </div>
                </StatePropCond>
                <StatePropCond
                            device={this.props.details.camera}
                            property="CCD_BINNING"
                            overridePredicate={(store)=>isParamOverride(store, binningParam)}>
                    <div className="IndiProperty">
                            Bin:
                            <KeepValue app={this.props.app}
                                    valuePath={binningParam.valuePath}
                                    setValue={binningParam.set}>
                                <CameraBinEditor
                                    device={this.props.details.camera}
                                    valuePath={binningParam.valuePath}
                                    setValue={binningParam.set}
                                />
                            </KeepValue>
                    </div>
                </StatePropCond>
                <StatePropCond
                            device={this.props.details.camera}
                            property="CCD_ISO"
                            overridePredicate={(store)=>isParamOverride(store, isoParam)}>
                    <div className="IndiProperty">
                            Iso:
                            <KeepValue app={this.props.app}
                                    valuePath={isoParam.valuePath}
                                    setValue={isoParam.set}>
                                <CameraIsoEditor
                                    device={this.props.details.camera}
                                    valuePath={isoParam.valuePath}
                                    setValue={isoParam.set}
                                />
                            </KeepValue>
                    </div>
                </StatePropCond>

                <SortableList items={this.getCurrentStepList(this.state, this.props)}
                        onSortEnd={this.moveSteps}
                        camera={this.props.details.camera}
                        app={this.props.app}
                        sequenceUid={this.props.uid}
                        pressDelay={200}
                        helperClass="sortableHelper"/>

                <input type='button' value='Add a step'
                    disabled={!!this.state.AddStepBusy}
                    onClick={e=>Utils.promiseToState(this.props.app.newSequenceStep(this.props.uid), this, "AddStepBusy")}/>

                <input type='button' value='Close' onClick={e=>this.props.app.closeSequenceEditor()}/>
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