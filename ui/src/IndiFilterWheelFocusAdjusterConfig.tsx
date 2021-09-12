import * as React from 'react';
import * as Store from './Store';
import * as Utils from './Utils';

import * as AccessPath from "./shared/AccessPath";
import * as BackendAccessor from "./utils/BackendAccessor";
import * as BackofficeStatus from '@bo/BackOfficeStatus';
import TextEdit from './TextEdit';
import { has } from './shared/JsonProxy';


type InputProps = {
    accessor: BackendAccessor.RecursiveBackendAccessor<BackofficeStatus.ImagingSetup>;
}

type MappedProps = {
    filterIds: string[];
    currentDeltas?: BackofficeStatus.FilterWheelDeltas;
}

type Props = InputProps & MappedProps;

type State = {
    runningPromise: number
}

class IndiFilterWheelFocusAdjusterConfig extends React.PureComponent<Props, State> {
    constructor(props:Props) {
        super(props);
        this.state = {
            runningPromise: 0,
        };
    }

    render() {
        return <div>
            {this.props.filterIds.length === 0
                ? <div key="nofilter">No filter found</div>
                : <ul key="filters">
                    {this.props.filterIds.map((id)=>
                        {
                            const currentValue = has(this.props.currentDeltas, id) ? "" + (this.props.currentDeltas![id]) : "";
                            return <li key={id}>{id}:
                                <TextEdit
                                    value={currentValue}
                                    onChange={(e:string)=> this.setFilterValue(id, e)}/>
                            </li>;
                        }
                    )}
                  </ul>
            }
        </div>
    }


    private setFilterValue(filterId: string, valueStr:string) {
        return Utils.promiseToState(
            (async ()=> {
                const adjAccessor = this.props.accessor.child(AccessPath.For((e)=>e.focuserSettings.focuserFilterAdjustment));

                let value: number|null = parseInt(valueStr, 10);
                if (isNaN(value)) {
                    value = null;
                }

                const store = Store.getStore().getState();

                const state = {...adjAccessor.fromStore(store)};
                if (value === null) {
                    delete state[filterId];
                } else {
                    state[filterId] = value;
                }


                await adjAccessor.send(state);
            }),
            this
        );
    }


    static mapStateToProps (store:Store.Content, ownProps: InputProps):MappedProps {
        const imagingSetup = ownProps.accessor.fromStore(store);

        if (imagingSetup === null) {
            return {
                filterIds: Store.emptyArray,
                currentDeltas: Store.emptyObject,
            };
        }

        return {
            filterIds: imagingSetup.availableFilters,
            currentDeltas: imagingSetup.focuserSettings.focuserFilterAdjustment
        };
    }
}


export default Store.Connect(IndiFilterWheelFocusAdjusterConfig);
