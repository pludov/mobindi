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
        return <span className='cameraSetting' {...this.props.helpKey?.dom()}>
            <div
                className={`QuickBton ${this.props.className || ""}`}
                onClick={this.update}/>
        </span>;
    }

    update=()=>{
        this.props.onClick();
    }
}

export default QuickBton;