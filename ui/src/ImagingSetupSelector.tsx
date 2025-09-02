import * as React from 'react';
import { connect } from 'react-redux';
import { createSelector } from 'reselect'
import CancellationToken from 'cancellationtoken';

import * as Help from './Help';
import * as Store from './Store';
import * as BackendRequest from "./BackendRequest";
import PromiseSelector, { Props as PromiseSelectorProps } from './PromiseSelector';

type CustomProps = {
    accessor: Store.Accessor<string|null>;
    accessInactive?: boolean;
}

export type Item = {
    key: string;
    title: string;
    enabled: boolean;
}

function getTitle(e:Item) {
    return e.title;
}

function getId(e:Item) {
    return e.key;
}

function getEnabled(e:Item) {
    return e.enabled;
}

export type InputProps = CustomProps & Omit<PromiseSelectorProps<Item>, "getId"|"getTitle"|"active"|"placeholder"|"availablesGenerator">;

const imagingSetupSelectorHelp = Help.key("Select imaging setup", "Select the imaging setup to use. Use the Edit entry to inspect/modify");

const ImagingSetupSelector = connect(()=> {
    const listSelector = createSelector(
        (store: Store.Content, ownProps: CustomProps)=>store.backend?.imagingSetup?.configuration?.byuuid,
        (store: Store.Content, ownProps: CustomProps)=>store.backend?.imagingSetup?.availableImagingSetups,
        (byuuid, availables)=> {
            const ret = [];
            if (availables == undefined) availables = [];
            for(const key of Object.keys(byuuid || {})) {
                ret.push({key, title: byuuid![key].name, enabled: availables.indexOf(key) != -1});
            }
            ret.sort((a, b)=>(a.title.localeCompare(b.title)));
            return ret;
        });

    return (store:Store.Content, ownProps:CustomProps) => {
        const active = ownProps.accessor.fromStore(store);
        return ({
            active: active,
            setValue: ownProps.accessor.send,
            getId,
            getTitle,
            getEnabled: ownProps.accessInactive ?  undefined : getEnabled,
            helpKey: imagingSetupSelectorHelp,
            availables: listSelector(store, ownProps)
        })
    }
}, null, null, {forwardRef: true} as any)(PromiseSelector);

export default ImagingSetupSelector;
