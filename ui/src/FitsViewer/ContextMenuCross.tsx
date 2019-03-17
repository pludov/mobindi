
import React, { Component, PureComponent} from 'react';
import './FitsViewer.css'

export type Props = {
    x:number,
    y:number,
}

export default class ContextMenuCross extends PureComponent<Props> {
    constructor(props:Props) {
        super(props);
    }

    render() {
        return <React.Fragment>
            <div className="ContextMenuCrossV"
                    style={{
                        position: 'absolute',
                        backgroundColor: "#red",
                        left: this.props.x - 10,
                        width: 20,
                        top: 0,
                        bottom: 0
                    }}/>
            <div className="ContextMenuCrossH"
                    style={{
                        position: 'absolute',
                        backgroundColor: "#blue",
                        top: this.props.y - 10,
                        height: 20,
                        left: 0,
                        right: 0
                    }}/>
        </React.Fragment>;
    }
}
