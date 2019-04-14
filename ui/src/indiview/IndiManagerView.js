/**
 * Created by ludovic on 21/07/17.
 */
import React, { Component, PureComponent} from 'react';
import { connect } from 'react-redux';
import Collapsible from 'react-collapsible';
import Led from "../Led";
import TextEdit from "../TextEdit";
import Icons from "../Icons"
import IconButton from "../IconButton";
import IndiDriverControlPanel from "./IndiDriverControlPanel";
import IndiDriverSelector from "./IndiDriverSelector";
import IndiSelectorPropertyView from "./IndiSelectorPropertyView";
import IndiPropertyView from "./IndiPropertyView";
import "../Collapsible.css";
import "./IndiManagerView.css";



const VectorStateToColor = {
    Idle: 'grey',
    Ok: 'green',
    Busy: 'yellow',
    Alert: 'red'
}



/** Render a vector, depending on its type and access rules */
class IndiVectorView extends PureComponent {
    constructor(props) {
        super(props);
        this.state = {
            pendingChange: false
        };
        this.pushMultiValue = this.pushMultiValue.bind(this);
        this.changeCallback = this.changeCallback.bind(this);
        this.cancelPendingChanges = this.cancelPendingChanges.bind(this);
    }

    pendingChangesIds() {
        var rslt = [];
        for(var o of Object.keys(this.state)) {
            if (o.startsWith("forced_")) {
                var id = o.substring(7);
                rslt.push(id);
            }
        }
        return rslt;
    }


    cancelPendingChanges() {
        var newState = {};
        for(var id of this.pendingChangesIds()) {
            newState["forced_" + id] = undefined;
        }
        newState.pendingChange = false;
        this.setState(newState);
    }

    doneRequest(request) {
        this.cancelPendingChanges();
    }

    async pushMultiValue() {
        var req = {
            dev: this.props.dev,
            vec: this.props.vec,
            children: []
        };
        var newState = {};
        for(var o of Object.keys(this.state)) {
            if (o.startsWith("forced_")) {
                var id = o.substring(7);
                var value = this.state[o];
                newState[o] = undefined;
                req.children.push({name: id, value: value});
            }
        }

        this.setState(newState);
        
        await this.props.app.rqtSwitchProperty(req)
        this.doneRequest(req);
    }

    async changeCallback(id, immediate, value) {
        if ((!immediate) && this.props.childs.length > 1) {
            // Do nothing for now
            this.setState({
                ["forced_" + id]: value,
                pendingChange: true
            });
        } else {
            // Direct push of the value
            const request = {
                dev: this.props.dev,
                vec: this.props.vec,
                children: [
                    {name: id, value: value}
                ]
            };
            await this.props.app.rqtSwitchProperty(request);
            this.doneRequest(request);
        }
    }

    // props: app
    // props: dev
    // props: vec
    render() {
        var self = this;
        var ledColor = VectorStateToColor[this.props.state];
        if (ledColor == undefined) {
            ledColor = VectorStateToColor['Alert'];
        }

        var content;
        if (this.props.type == 'Switch' && this.props.rule == 'OneOfMany' && this.props.perm != "ro") {
            content = <div className="IndiProperty">{this.props.label}:
                <IndiSelectorPropertyView app={this.props.app} dev={this.props.dev} vec={this.props.vec}>
                </IndiSelectorPropertyView>
            </div>;
        } else if (this.props.childs.length > 0) {
            content = this.props.childs.map(
                (id) => <IndiPropertyView app={self.props.app} dev={self.props.dev}
                                showVecLabel={this.props.childs.length == 1}
                                onChange={this.changeCallback}
                                vec={self.props.vec} prop={id} key={'child_' + id}
                                forcedValue={self.state["forced_" + id]}/>);
            if (this.props.childs.length > 1) {
                content.splice(0, 0, 
                        <div
                            key='$$$title$$$' 
                            className="IndiVectorTitle">
                                {this.props.label}
                                {this.props.perm == 'ro' ? null :
                                    <IconButton 
                                        src={Icons.dialogOk} 
                                        onClick={this.pushMultiValue}
                                        visible={self.state.pendingChange}/>
                                }
                                {this.props.perm == 'ro' ? null :
                                    <IconButton
                                        src={Icons.dialogCancel}
                                        onClick={this.cancelPendingChanges}
                                        visible={self.state.pendingChange}/>
                                }
                        </div>
                        );
            }
        } else {
            content = <div className="IndiProperty">{this.props.label}></div>;
        }

        return <div className="IndiVector"><Led color={ledColor}></Led><div className="IndiVectorProps">{content}</div></div>
    }

    static mapStateToProps(store, ownProps) {
        var rslt = {};
        var vec;
        try {
            vec = store.backend.indiManager.deviceTree[ownProps.dev][ownProps.vec];
        } catch(e) {}

        if (vec != undefined) {
            rslt = {
                label: vec.$label,
                state: vec.$state,
                type: vec.$type,
                rule: vec.$rule,
                perm: vec.$perm,
                childs: vec.childNames
            }
        } else {
            rslt = {
                label: "N/A",
                state: 'Error',
                childs: []
            }
        }
        return rslt;
    }
}

IndiVectorView = connect(IndiVectorView.mapStateToProps)(IndiVectorView);

class IndiManagerView extends Component {
    constructor(props) {
        super(props);

        this.state = { value: ''};
    }

    render() {
        var bs = this.props.indiManager;
        if (bs == undefined || bs == null) {
            return null;
        }

        var vectors = [];
        var currentDevice = this.props.uiState.selectedDevice;
        if (currentDevice == undefined) currentDevice = "";
        if (currentDevice != "") {
            if (Object.prototype.hasOwnProperty.call(this.props.indiManager.deviceTree, currentDevice)) {
                var deviceProps = this.props.indiManager.deviceTree[currentDevice];

                // Les groupes ouverts
                var opens = this.props.uiState.expandedGroups[currentDevice];

                var groups = {};
                for(var key in deviceProps) {
                    var grpId = deviceProps[key].$group;
                    groups[grpId] = {
                        opened: Object.prototype.hasOwnProperty.call(opens, grpId) && opens[grpId],
                        vectors: []
                    };
                }
                var groupIds = Object.keys(groups).sort();
                for(let group of groupIds) {
                    var groupDesc = groups[group];
                    let childs = [];
                    for(var key of Object.keys(deviceProps).filter((e)=>{return deviceProps[e].$group == group}).sort()) {
                        childs.push(<IndiVectorView app={this.props.app} key={currentDevice +':vector:' +key} dev={currentDevice} vec={key}/>);
                    }

                    vectors.push(<Collapsible
                        key={currentDevice + ":" + group}
                        open={groupDesc.opened}
                        onOpening={()=>this.props.app.setGroupState(currentDevice, group, true)}
                        onClosing={()=>this.props.app.setGroupState(currentDevice, group, false)}
                        transitionTime={200}
                        trigger={group}
                        lazyRender={true}>{childs}</Collapsible>);
                    /**
                     *                 // Parcourir les groupes
                     for (var key in deviceProps) {
                    vectors.push(<div key={key}>{JSON.stringify(deviceProps[key])}</div>);
                }

                     */
                }
            }


        }





        return (
            <div className="Page">
                <div className={'IndiAppState IndiAppState_' + bs.status}>Server: {bs.status}
                </div>

                <div className="IndiDriverSelector">
                    Driver: <IndiDriverSelector app={this.props.app}/>
                    <IndiDriverControlPanel app={this.props.app}/>
                </div>

                <div className="IndiPropertyView">
                    {vectors}
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

export default connect(mapStateToProps)(IndiManagerView);