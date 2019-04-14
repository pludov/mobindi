/**
 * Created by ludovic on 21/07/17.
 */
import React, { Component, PureComponent} from 'react';
import Collapsible from 'react-collapsible';
import CancellationToken from 'cancellationtoken';
import * as Store from "../Store";
import * as Actions from "../Actions";
import * as BackendRequest from "../BackendRequest";
import * as IndiManagerStore from "../IndiManagerStore";
import * as Utils from "../Utils";
import { IndiVector, IndiProperty, IndiManagerStatus } from '@bo/BackOfficeStatus';
import * as BackOfficeAPI from '@bo/BackOfficeAPI';
import IndiSelectorPropertyView from "./IndiSelectorPropertyView";
import IndiPropertyView from "./IndiPropertyView";
import "./IndiManagerView.css";
import "../Collapsible.css";
import IconButton from '../IconButton';
import Icons from '../Icons';
import Led from '../Led';
import IndiDriverControlPanel from './IndiDriverControlPanel';
import IndiDriverSelector from './IndiDriverSelector';
import IndiVectorView from './IndiVectorView';

type InputProps = {
}

type MappedProps = {
    indiManager: IndiManagerStatus;
    uiState: IndiManagerStore.IndiManagerStoreContent;
}

type Props = InputProps & MappedProps;


class IndiManagerView extends React.PureComponent<Props> {
    constructor(props:Props) {
        super(props);

        this.state = { value: ''};
    }

    async setGroupState(dev: string, group: string, newState: boolean)
    {
        await Actions.dispatch<IndiManagerStore.Actions>()("setGroupState", {dev, group, newState});
    }

    render() {
        var bs = this.props.indiManager;
        if (bs == undefined || bs == null) {
            return null;
        }

        var vectors = [];
        const currentDevice = this.props.uiState.selectedDevice || "";
        if (currentDevice !== "") {
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
                        onOpening={()=>this.setGroupState(currentDevice, group, true)}
                        onClosing={()=>this.setGroupState(currentDevice, group, false)}
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
                    Driver: <IndiDriverSelector/>
                    <IndiDriverControlPanel/>
                </div>

                <div className="IndiPropertyView">
                    {vectors}
                </div>
            </div>);
    }

    static mapStateToProps = (store:Store.Content, ownProps: InputProps)=>{
        return {
            indiManager: store.backend.indiManager,
            uiState: store.indiManager
        } as MappedProps;
    }
}



export default Store.Connect(IndiManagerView);