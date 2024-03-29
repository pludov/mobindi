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
}

export type Item = {
    key: string;
    title: string;
}

function getTitle(e:Item) {
    return e.title;
}

function getId(e:Item) {
    return e.key;
}

export type InputProps = CustomProps & Omit<PromiseSelectorProps<Item>, "getId"|"getTitle"|"active"|"placeholder"|"availablesGenerator">;

const imagingSetupSelectorHelp = Help.key("Select imaging setup", "Select the imaging setup to use. Use the Edit entry to inspect/modify");

const ImagingSetupSelector = connect(()=> {
    const listSelector = createSelector(
        (store: Store.Content, ownProps: CustomProps)=>store.backend?.imagingSetup?.configuration?.byuuid,
        (byuuid)=> {
            const ret = [];
            for(const key of Object.keys(byuuid || {})) {
                ret.push({key, title: byuuid![key].name});
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
            helpKey: imagingSetupSelectorHelp,
            availables: listSelector(store, ownProps)
        })
    }
}, null, null, {forwardRef: true} as any)(PromiseSelector);

export default ImagingSetupSelector;
