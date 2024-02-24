/**
 * Created by ludovic on 21/07/17.
 */
import React, { } from 'react';
import Collapsible from 'react-collapsible';
import * as Store from "../Store";
import * as Actions from "../Actions";
import * as IndiManagerStore from "../IndiManagerStore";
import { IndiManagerStatus } from '@bo/BackOfficeStatus';
import "./IndiManagerView.css";
import "../Collapsible.css";
import IndiDriverControlPanel from './IndiDriverControlPanel';
import IndiDriverSelector from './IndiDriverSelector';
import IndiVectorView from './IndiVectorView';
import IndiProfileSelector from './IndiProfileSelector';
import IndiPropertyProfileStatus from './IndiPropertyProfileStatus';

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
        await Actions.dispatch<IndiManagerStore.IndiManagerActions>()("setGroupState", {dev, group, newState});
    }

    hasActiveProfile() {
        const profile = this.props.indiManager.configuration.profiles;
        return profile.list.filter((e)=>profile.byUid[e]?.active).length > 0;
    }

    decorateVectorWithProfile(props: {
        dev: string;
        vec: string;
        type: string;
        rule: string;
        perm: string;
        prop: string|null;
        changeCallback?: (id:string, immediate:boolean, value:string)=>void;
    }) {
        if (props.perm === "ro") {
            return null;
        }

        if (props.type === 'Switch' && props.rule === 'AtMostOne') {
            return null;
        }
        return <IndiPropertyProfileStatus
                        dev={props.dev}
                        vec={props.vec}
                        prop={props.prop}
                        />;
    }

    render() {
        var bs = this.props.indiManager;
        if (bs == undefined || bs == null) {
            return null;
        }

        const decorator = !this.hasActiveProfile() ? undefined : this.decorateVectorWithProfile;

        const vectors = [];
        const currentDevice = this.props.uiState.selectedDevice || "";
        if (currentDevice !== "") {
            if (Object.prototype.hasOwnProperty.call(this.props.indiManager.deviceTree, currentDevice)) {
                const deviceProps = this.props.indiManager.deviceTree[currentDevice];

                // Les groupes ouverts
                const opens = this.props.uiState.expandedGroups[currentDevice];

                const groups = {};
                for(const key of Object.keys(deviceProps)) {
                    const grpId = deviceProps[key].$group;
                    groups[grpId] = {
                        opened: Object.prototype.hasOwnProperty.call(opens, grpId) && opens[grpId],
                        vectors: []
                    };
                }
                const groupIds = Object.keys(groups).sort();
                for(let group of groupIds) {
                    const groupDesc = groups[group];
                    let childs = [];
                    for(const key of Object.keys(deviceProps).filter((e)=>{return deviceProps[e].$group == group}).sort()) {
                        childs.push(<IndiVectorView key={currentDevice +':vector:' +key} decorator={decorator} dev={currentDevice} vec={key}/>);
                    }
                    // use panel here...
                    vectors.push(<Collapsible
                        key={currentDevice + ":" + group}
                        open={groupDesc.opened}
                        onOpening={()=>this.setGroupState(currentDevice, group, true)}
                        onClosing={()=>this.setGroupState(currentDevice, group, false)}
                        transitionTime={200}
                        trigger={group}
                        lazyRender={true}>{childs}</Collapsible>);
                }
            }


        }


        return (
            <div className="Page">
                <div className={'IndiAppState IndiAppState_' + bs.status}>Server: {bs.status}
                </div>

                <div className="IndiProfileSelector">
                    <IndiProfileSelector/>
                </div>

                <div className="IndiDriverSelector">
                    <IndiDriverSelector/>
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