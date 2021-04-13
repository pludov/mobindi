import * as React from 'react';

import { SequenceStep } from '@bo/BackOfficeStatus';

import * as Utils from '../Utils';
import * as Store from '../Store';

type InputProps = {
    uid?: string;
}

type MappedProps = {
    needLight: boolean;
}

type Props = InputProps & MappedProps;

function sequenceRequireLight(sequence: SequenceStep)
{
    if (Utils.has(sequence, 'type')) {
        return false;
    }

    if (sequence.foreach?.param === 'type') {
        return false;
    }

    if (sequence.childs) {
        for(const child of Object.values(sequence.childs.byuuid)) {
            if (!sequenceRequireLight(child)) {
                return false;
            }
        }
    }

    return true;
}

class SequenceWarning extends React.PureComponent<Props> {
    constructor(props:Props) {
        super(props);
    }


    render() {
        return <>
            {this.props.needLight ?
                <div id="needLight" className="SequenceWarning">
                    A "Frame type" is required for proper operation
                </div>
            :null}
        </>;
    }

    static mapStateToProps=(store: Store.Content, ownProps: InputProps)=>{
        const details = Utils.getOwnProp(store.backend.sequence?.sequences.byuuid, ownProps.uid)?.root;
        if (details === undefined) {
            return {
                needLight: false
            };
        }
        return {
            needLight: sequenceRequireLight(details)
        };

    }
}

export default Store.Connect(SequenceWarning);

