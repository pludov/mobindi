import * as React from 'react';
import { connect } from 'react-redux';
import { createSelector } from 'reselect'

import * as BackOfficeStatus from '@bo/BackOfficeStatus';

import * as Utils from '../Utils';
import * as Actions from '../Actions';
import * as Store from '../Store';
import * as BackendRequest from '../BackendRequest';

import * as SequenceStore from '../SequenceStore';
import PromiseSelector from '../PromiseSelector';
import { atPath } from '../shared/JsonPath';
import CancellationToken from 'cancellationtoken';


type OwnProps = {
    currentPath: string;
    onCreated: (uid:string)=>void;
};

function setCurrentSequence(uid:string) {
    Actions.dispatch<SequenceStore.Actions>()("setCurrentSequence", {sequence: uid});
}

async function newSequence(onCreated: (uid:string)=>void) {
    const sequence = await BackendRequest.RootInvoker("camera")("newSequence")(
        CancellationToken.CONTINUE,
        {});
    Actions.dispatch<SequenceStore.Actions>()("setCurrentSequence", {sequence});
    onCreated(sequence);
}

const SequenceSelector = connect(()=>{
    const sequenceSelectorBaseProps = {
        placeholder: 'Sequence...',
        nullAlwaysPossible: true,
        getTitle: (id:string, props:any)=>(id && props.definitions[id] ? props.definitions[id].title : null),
        setValue: setCurrentSequence,
    };

    const controls = createSelector(
            (store: Store.Content, ownProps: OwnProps)=>ownProps.onCreated,
            (onCreated)=> [{
                id:'new',
                title:'New',
                run: ()=>newSequence(onCreated)
            }]);

    return (store:Store.Content, ownProps:OwnProps)=> ({
        ... sequenceSelectorBaseProps,
        controls: controls(store, ownProps),
        active: atPath(store, ownProps.currentPath),
        availables: store.backend.camera!.sequences.list,
        definitions: store.backend.camera!.sequences.byuuid
    })
})(PromiseSelector);

export default SequenceSelector;
