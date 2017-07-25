/**
 * Created by ludovic on 21/07/17.
 */
import React, { Component } from 'react';
import { connect } from 'react-redux';
import Collapsible from 'react-collapsible';
import "./Collapsible.css";

// Return a function that will call the given function with the given args
function closure() {
    var func = arguments[0];
    var args = Array.from(arguments).slice(1);
    var self = this;

    return ()=> {
        return func.apply(self, args);
    };
}


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

        var deviceSelectorOptions;
        if (Object.prototype.hasOwnProperty.call(this.props.indiManager, 'deviceTree')) {
            deviceSelectorOptions = Object.keys(this.props.indiManager.deviceTree).sort().map((item) => <option key={item} value={item}>{item}</option>);
        } else {
            deviceSelectorOptions = null;
        }

        var vectors = [];
        var currentDevice = this.props.uiState.selectedDevice;
        if (currentDevice == undefined) currentDevice = "";
        if (currentDevice == "") {
            deviceSelectorOptions.push(<option value="" key=""></option>);
        } else {
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
                    for(var key of Object.keys(deviceProps).filter((e)=>{return deviceProps[e].$group == group || true}).sort()) {
                        childs.push(<div key={key}>{key}</div>);
                    }

                    vectors.push(<Collapsible
                        key={group}
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
                    <select value={currentDevice} onChange={(e)=>{this.props.app.dispatchAction("switchToDevice", e.target.value)}} placeholder="Select device...">
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

export default connect(mapStateToProps)(IndiManagerView);