import React, { PureComponent} from 'react';
import "./Led.css"

export type Props = {
    color: string;
}

export default class Led extends PureComponent<Props> {
    render() {
        return <div className={"led-" + this.props.color + " led-generic"}></div>;
    }
}
