import React, { Component, PureComponent} from 'react';
import "./Led.css"

class Led extends PureComponent {
    render() {
        return <div className={"led-" + this.props.color + " led-generic"}></div>;
    }
}

export default Led