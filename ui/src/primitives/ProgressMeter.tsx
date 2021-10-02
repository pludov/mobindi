import * as React from 'react';
import * as Help from '../Help';
import * as Store from '../Store';
import * as BaseText from './BaseText';

type InputProps = {
    current: Store.Accessor<number>;
    min?: Store.Accessor<number>;
    max: Store.Accessor<number>;
    helpKey?: Help.Key;
    className?: string;
}

type MappedProps = {
    currentV: number;
    minV: number;
    maxV: number;
}

type Props = InputProps & MappedProps;


class ProgressMeter extends React.PureComponent<Props> {
    render() {
        const percent = Math.trunc(4 * (this.props.currentV - this.props.minV) / (this.props.maxV - this.props.minV));
        const progress = "○◔◑◕●";
        const additionalClass = percent === 0 ? "empty" : percent === 4 ? "full": "partial";
        return (
            <div className={`ProgressMeter ${additionalClass} ${this.props.className||''}`} {...this.props.helpKey?.dom()}>
                {progress[percent]}
            </div>
        );

    }


    static mapStateToProps:()=>(store: Store.Content, ownProps: InputProps)=>MappedProps=()=>{
        return (store: Store.Content, ownProps: InputProps)=> {
            return {
                currentV: ownProps.current.fromStore(store),
                minV : ownProps.min ? ownProps.min.fromStore(store) : 0,
                maxV : ownProps.max.fromStore(store),
            }
        }
    }
}

export default Store.Connect(ProgressMeter);