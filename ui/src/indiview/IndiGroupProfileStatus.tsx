/**
 * Created by ludovic on 21/07/17.
 */
import React, { } from 'react';
import * as Store from "../Store";
import { IndiDevice, IndiProfilesConfiguration, IndiVector, ProfilePropertyAssociation } from '@bo/BackOfficeStatus';
import "./IndiManagerView.css";
import "../Collapsible.css";
import { defaultMemoize } from 'reselect';
import * as IndiUtils from '../IndiUtils';
import { get3D } from '../shared/Obj';
import { mapMemoize } from '../utils/MapMemoize';

import "./IndiGroupProfileStatus.css";

type InputProps = {
    dev: string;
    group: string;
}

type MappedProps = {
    restriction: boolean;
    mismatch: boolean;
}

type Props = InputProps & MappedProps;


// Return the propertie(s) to watch for this vector
function getVectorProps(vector: IndiVector) {
    if (vector.$perm === "ro") {
        return [];
    }
    if (vector.$type === 'Switch' && vector.$rule === 'AtMostOne') {
        return [];
    }

    if (vector.$type == 'Switch' && vector.$rule == 'OneOfMany' && vector.$perm != "ro") {
        return ["...whole_vector..."];
    }
    return vector.childNames;
}

function getWatchableProps(dev: IndiDevice, groupId: string) {
    let ret = [];
    for(const vecId of Object.keys(dev).sort()) {
        let vec = dev[vecId];

        if (vec.$group !== groupId) {
            continue;
        }

        for(const prop of getVectorProps(vec)) {
            ret.push(JSON.stringify([vecId, prop]));
        }
    }
    return ret;
}

function getPropertyStatus(dev: string, propId: string,
                        profiles: IndiProfilesConfiguration|undefined,
                        status: ProfilePropertyAssociation<{wanted: string, profile: string}>|undefined
) {
    if (profiles === undefined || !status) {
        return {restriction: 0, mismatch: 0};
    }
    let restriction = 0, mismatch = 0;
    const [ vec, propStr ] = JSON.parse(propId);
    for(const id of [...profiles.list].reverse()) {
        const profile = profiles.byUid[id];
        if (!profile.active) {
            continue;
        }

        const prop = get3D(profile.keys, dev, vec, propStr);
        if (prop) {
            let r = status ? get3D(status, dev, vec, propStr) : undefined;
            restriction++;
            if (r !== undefined) mismatch++;
            break;
        }
    }

    return {
        restriction,
        mismatch
    };
}


function getGroupStatus() {
    const getDevice =  defaultMemoize((store, device) => IndiUtils.getDeviceDesc(store, device));
    const getProps = defaultMemoize((device, groupId) => getWatchableProps(device, groupId));
    // This create a map of memoizer, one per watched property.
    const getPropStatus = mapMemoize((propId: string) => defaultMemoize(
        (device: string,
         profiles: IndiProfilesConfiguration|undefined,
         status: ProfilePropertyAssociation<{wanted: string, profile: string}>|undefined) =>  {
            return getPropertyStatus(device, propId, profiles, status);
    }));
    // This calls every memoizer and aggregate the result.
    const aggregate = defaultMemoize(
        (
            deviceId: string,
            profiles: IndiProfilesConfiguration|undefined,
            status: ProfilePropertyAssociation<{wanted: string, profile: string}>|undefined,
            map: {
                [id: string]:
                    (
                        device:string,
                        profiles: IndiProfilesConfiguration|undefined,
                        status: ProfilePropertyAssociation<{wanted: string, profile: string}>|undefined
                    ) => {restriction: number, mismatch: number}
            }
        ) => {
            let restriction = 0;
            let mismatch = 0;
            for(const r of Object.values(map)) {
                const rval = r(deviceId, profiles, status)
                restriction += rval.restriction;
                mismatch += rval.mismatch;
            }
            return {
                restriction: !!restriction,
                mismatch: !!mismatch,
            };
        }
    );
    return (store: Store.Content, devId: string, groupId: string) => {
        let device = getDevice(store, devId);

        let props = getProps(device, groupId);

        let propStatus = getPropStatus(props);

        return aggregate(devId,
            store.backend.indiManager?.configuration.profiles,
            store.backend.indiManager?.profileStatus.mismatches,
            propStatus);
    }
}


class IndiGroupProfileStatus extends React.PureComponent<Props> {
    public render() {
        return <div style={{float: "right", clear: "left"}}>
                <div className="GroupProfileStatusIndicator"
                            style={{
                                    filter: this.props.restriction ? undefined : 'grayscale(80%)',
                                    backgroundColor: this.props.mismatch ? 'red' : undefined,
                            }}
                            onClick={()=>{}}
                >🔒</div>
            </div>;
    }

    public static mapStateToProps = ()=>{
        const getGroupStatusMemoized = getGroupStatus();

        return (store:Store.Content, ownProps: InputProps) => {
            return getGroupStatusMemoized(store, ownProps.dev, ownProps.group);
        }
    }
}

export default Store.Connect(IndiGroupProfileStatus);
