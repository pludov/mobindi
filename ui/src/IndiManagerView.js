/**
 * Created by ludovic on 21/07/17.
 */
import React, { Component, PureComponent} from 'react';
import { connect } from 'react-redux';
import shallowequal from 'shallowequal';
import Collapsible from 'react-collapsible';
import "./Collapsible.css";
import Led from "./Led";

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
}

const mapStateToSelectorProps = function(store) {
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
IndiDriverSelector = connect(mapStateToSelectorProps)(IndiDriverSelector);

const VectorStateToColor = {
    Idle: 'grey',
    Ok: 'green',
    Busy: 'yellow',
    Alert: 'red'
}

class IndiVectorView extends PureComponent {
    // props: dev
    // props: vec
    render() {
        var ledColor = VectorStateToColor[this.props.state];
        if (ledColor == undefined) {
            ledColor = VectorStateToColor['Alert'];
        }

        return <div><Led color={ledColor}></Led>{this.props.state} {this.props.label}</div>
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
                state: vec.$state
            }
        } else {
            rslt = {
                label: "N/A",
                state: 'Error'
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
                        childs.push(<IndiVectorView key={currentDevice +':vector:' +key} dev={currentDevice} vec={key}/>);
                    }

                    vectors.push(<Collapsible
                        key={currentDevice + ":" + group}
                        open={groupDesc.opened}
                        onOpen={this.props.app.dispatchAction.bind(null, "setGroupState", currentDevice, group, true)}
                        onClose={this.props.app.dispatchAction.bind(null, "setGroupState", currentDevice, group, false)}
                        transitionTime="200"
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
                <div className={'IndiAppState IndiAppState_' + bs.status}>{bs.status}
                </div>


                <div>
                    <IndiDriverSelector app={this.props.app}/><br/>
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