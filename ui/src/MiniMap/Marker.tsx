import React from 'react';
import { mapAltAz } from './projection';

type InputProps = {
    className?: string;
    style?: React.CSSProperties;
    alt: number;
    az: number;
};

export default class Marker extends React.PureComponent<InputProps> {
    render() {
        const { x, y } = mapAltAz(this.props.alt, this.props.az);
        const style = { "--relx": x, "--rely": y, ...this.props.style } as React.CSSProperties;

        return <div
                    className={`MiniMapMarker ${this.props.className || ''}`}
                    style={style}
                    ></div>
    }

}
