import * as React from 'react';
import "./Tooltip.css";

type Props = {
    title?: string;
}

type State = {
    visible: boolean;
}


export default class Tooltip extends React.PureComponent<Props, State> {
    constructor(props:Props) {
        super(props);
        this.state = {
            visible: false
        }
    }

    public render() {
        const content = !this.state.visible
                ? null
                : <div className="Modal">
                            <div className="ModalContent">
                                {this.props.title !== undefined
                                    ?
                                        <h1>
                                            <span className="TooltipTitle">&#9432;</span>{this.props.title}
                                        </h1>
                                    : null
                                }
                                <br/>
                                {this.props.children}
                                <br/><br/>
                                <input type='button' value='Close' onClick={this.close}/>
                            </div>
                </div>

        return <>
                <span className="TooltipIcon" onClick={this.open}>&#9432;</span>
                {content}
        </>;
    }

    public readonly open=()=>{
        this.setState({visible: true});
    }

    public readonly close=()=>{
        this.setState({visible: false});
    }
}