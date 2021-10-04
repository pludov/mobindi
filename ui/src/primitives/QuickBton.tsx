import * as React from 'react';
import * as Help from '../Help';
import * as Store from '../Store';
import "./QuickBton.css";

type Props = {
    onClick: ()=>(void);
    helpKey?: Help.Key;
    className?: string;
}

class QuickBton extends React.PureComponent<Props> {
    render() {
        return (
            <div
                className={`QuickBton ${this.props.className || ""}`}
                {...this.props.helpKey?.dom()}
                onClick={this.update}/>
        );
    }

    update=()=>{
        this.props.onClick();
    }
}

export default QuickBton;