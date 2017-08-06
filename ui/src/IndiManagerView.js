/**
 * Created by ludovic on 21/07/17.
 */
import React, { Component, PureComponent} from 'react';
import { connect } from 'react-redux';
import shallowequal from 'shallowequal';
import Collapsible from 'react-collapsible';
import "./Collapsible.css";
import Led from "./Led";
import TextEdit from "./TextEdit.js";
import "./IndiManagerView.css";

// Return a function that will call the given function with the given args
function closure() {
    var func = arguments[0];
    var args = Array.from(arguments).slice(1);
    var self = this;

    return ()=> {
        return func.apply(self, args);
    };
}

class IndiDriverSelector extends Component {
    constructor(props) {
        super(props);
    }

    render() {
        var deviceSelectorOptions = this.props.options.map((item) => <option key={item} value={item}>{item}</option>);
        return (<select value={this.props.current} onChange={(e) => {
            this.props.app.dispatchAction("switchToDevice", e.target.value)
        }} placeholder="Select device...">
            {deviceSelectorOptions}
        </select>);

    }

    // Limit the refresh for the selector (would reset selection)
    shouldComponentUpdate(nextProps, nextState) {
        return !shallowequal(nextProps, this.props,(a, b, k)=>(k == "options" ? shallowequal(a, b) : undefined));
    }

    static mapStateToProps(store) {
        var deviceSelectorOptions = [];

        var backend = store.backend.indiManager;

        var currentDevice = store.indiManager.selectedDevice;
        if (currentDevice == undefined) currentDevice = "";
        if (currentDevice == "") {
            deviceSelectorOptions.push("");
        }

        if (Object.prototype.hasOwnProperty.call(backend, 'deviceTree')) {

            for(var o of Object.keys(backend.deviceTree).sort()) {
                deviceSelectorOptions.push(o);
            }
        }

        var result = {
            options: deviceSelectorOptions,
            current:currentDevice
        };
        return result;
    }
}

IndiDriverSelector = connect(IndiDriverSelector.mapStateToProps)(IndiDriverSelector);

const VectorStateToColor = {
    Idle: 'grey',
    Ok: 'green',
    Busy: 'yellow',
    Alert: 'red'
}

// Render as a drop down selector
class IndiSelectorPropertyView extends PureComponent {
    // props: app, dev, vec
    render() {
        var self = this;
        var options = [];
        var currentOption = undefined;

        for(var childId of this.props.childNames) {
            var child = this.props.childs[childId];

            options.push(<option key={child.$name} value={child.$name}>{child.$label}</option>);
            if (child.$_ == 'On') {
                currentOption = childId;
            }
        }

        return <select value={currentOption} onChange={(e) => {
            this.props.app.rqtSwitchProperty({
                dev: self.props.dev,
                vec: self.props.vec,
                children: [
                    {name: e.target.value, value: 'On'}
                ]})
        }}>{options}</select>;
    }

    static mapStateToProps(store, ownProps) {
        var vec;
        try {
            vec = store.backend.indiManager.deviceTree[ownProps.dev][ownProps.vec];
            if (vec == undefined) throw "vector not found";
        } catch (e) {
            throw new Error('One of many not found: ' + ownProps.dev + ' , ' + ownProps.vec + ' => ' + e);
        }

        return ({
            childs: vec.childs,
            childNames: vec.childNames
        })
    }
}

IndiSelectorPropertyView = connect(IndiSelectorPropertyView.mapStateToProps)(IndiSelectorPropertyView);


/** Render a property as key: value (readonly) */
class IndiPropertyView extends PureComponent {
    // props: app, dev, vec, prop, showVecLabel,
    // props: forcedValue
    // onChange(newValue)
    render() {
        var self = this;
        var label = this.props.propLabel;
        if (this.props.vecLabel != undefined) {
            label = this.props.vecLabel + ": " + label;
        }

        if (this.props.vecType == 'Switch' && this.props.vecPerm != 'ro') {
            if (this.props.vecRule == 'AtMostOne') {
                return <input
                    type="button"
                    className={"IndiSwitchButton IndiSwitchButton" + this.props.value}
                    value={label}
                    onClick={(e) => {
                        self.props.onChange(self.props.value == 'On' ? 'Off' : 'On')
                    }}
                />

            } else {
                return <div className="IndiProperty">
                    <input
                        type="checkbox"
                        checked={this.props.value == 'On'}
                        onChange={(e) => {
                            self.props.onChange(e.target.checked ? 'On' : 'Off')
                        }}
                    ></input>
                    {label}</div>
            }
        } else if (this.props.vecPerm != 'ro') {
            return <div className="IndiProperty">{label}: <TextEdit value={this.props.value} onChange={(e)=> {self.props.onChange(e)}}/></div>;
        } else {
            return <div className="IndiProperty">{label}: {this.props.value}</div>
        }

    }


    static mapStateToProps(store, ownProps) {
        var prop, vec;
        try {
            vec = store.backend.indiManager.deviceTree[ownProps.dev][ownProps.vec];
            prop = vec.childs[ownProps.prop];
        } catch(e) {
            throw new Error('Property not found: ' + ownProps.dev + ' , ' + ownProps.vec + ' , ' + ownProps.prop + ' => ' + e);
        }

        return ({
            vecLabel: ownProps.showVecLabel ? vec.$label: undefined,
            vecType: vec.$type,
            vecRule: vec.$rule,
            vecPerm: vec.$perm,
            propLabel : prop.$label,
            value: ownProps.forcedValue != undefined ? ownProps.forcedValue: prop.$_
        });
    }
}

IndiPropertyView = connect(IndiPropertyView.mapStateToProps)(IndiPropertyView);

/** Render a vector, depending on its type and access rules */
class IndiVectorView extends PureComponent {
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

            function changeCallbackForId(id) {
                if (self.props.childs.length > 1 && false) {

                } else {
                    return (value) => {
                        // Direct push of the value
                        self.props.app.rqtSwitchProperty({
                            dev: self.props.dev,
                            vec: self.props.vec,
                            children: [
                                {name: id, value: value}
                            ]
                        })
                    }
                }
            }

            content = this.props.childs.map((id) => <IndiPropertyView app={self.props.app} dev={self.props.dev}
                                                                      showVecLabel={this.props.childs.length == 1}
                                                                      onChange={changeCallbackForId(id)}
                                                                      vec={self.props.vec} prop={id} key={id}/>);
            if (this.props.childs.length > 1) {
                content.splice(0, 0, <div className="IndiVectorTitle">{this.props.label}</div>);
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
                        onOpen={this.props.app.dispatchAction.bind(null, "setGroupState", currentDevice, group, true)}
                        onClose={this.props.app.dispatchAction.bind(null, "setGroupState", currentDevice, group, false)}
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
                </div>

                <div className="IndiPropertyView">
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

export default connect(mapStateToProps)(IndiManagerView);