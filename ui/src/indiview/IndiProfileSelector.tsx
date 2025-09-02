/**
 * Created by ludovic on 21/07/17.
*/
import React, { } from 'react';
import { connect } from 'react-redux';
import * as Store from "../Store";
import * as Help from '../Help';
import IndiProfileDialog from './IndiProfileDialog';
import * as PromiseSelector from '../PromiseSelector';

type InputProps = {
    activeUid: string|null;
    activeName: string|null;
    helpKey?: Help.Key;
    setValue: (e:string)=>Promise<void>;
}

type MappedProps = PromiseSelector.Props<string|null> & {
    items:{[id: string]: string};
}

type Props = InputProps & MappedProps;

type Item = {
    uid: string,
    name: string,
}

const IndiProfileSelector = connect((store:Store.Content, ownProps:InputProps) => {
    let profileList =  store.backend?.indiManager?.configuration?.profiles?.list || [];
    let profileByUid =  store.backend?.indiManager?.configuration?.profiles?.byUid || {};

    let profiles: Array<Item> = profileList.map((uid)=> {
        return {
            uid,
            name:
                Object.prototype.hasOwnProperty.call(profileByUid, uid)
                    ?
                        profileByUid[uid].name
                    :
                        `???${uid}???`
        }
    });

    profiles = [ ...profiles];


    const root = ({
        placeholder: 'None...',
        nullAlwaysPossible: true,
        active: ownProps.activeUid,
        availablesGenerator: ()=>profiles,
        getTitle: (e: Item)=> e.name,
        getId: (e: Item)=>e.uid,
        $itemCount: 0,
    });

    return root;
})(PromiseSelector.default)

export default IndiProfileSelector;