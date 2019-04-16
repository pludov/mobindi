import * as React from 'react';
import * as Store from './Store';
import * as Utils from './Utils';
import * as IndiUtils from './IndiUtils';
import { IndiDevice, IndiVector } from '@bo/BackOfficeStatus';

type InputProps = {
    overridePredicate?: ((store: Store.Content, props: InputProps)=>(boolean|undefined));
    condition?: ((device:IndiVector|undefined)=>boolean);
    device: string|null;
    property: string;
};

type MappedProps = {
    active: boolean;
};

type Props = InputProps & MappedProps;

/* Render the child depending on the availability of an Indi Setting */
class StatePropCond extends React.PureComponent<Props> {
    constructor(props: Props) {
        super(props);
    }

    render()
    {
        if (this.props.active) {
            return React.Children.only(this.props.children);
        } else {
             return null;
        }
    }

    static mapStateToProps = function(store: Store.Content, ownProps: InputProps) {
        if (ownProps.overridePredicate !== undefined) {
            const override = ownProps.overridePredicate(store, ownProps);
            if (override !== undefined) {
                return {
                    active: override
                }
            }
        }
        const desc = ownProps.device === null ? undefined : Utils.noErr(()=>IndiUtils.getDeviceDesc(store, ownProps.device!)![ownProps.property], undefined);
        let result;
        if (ownProps.condition !== undefined) {
            result = ownProps.condition(desc);
        } else {
            result = (desc !== undefined);
        }
        return ({
            active: result == true
        });
    }
}

export default Store.Connect<StatePropCond, InputProps, {}, MappedProps>(StatePropCond);
