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
import IndiVectorView from "./IndiVectorView";
import "../Collapsible.css";
import "./IndiManagerView.css";







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