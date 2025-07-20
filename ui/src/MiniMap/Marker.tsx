import React from 'react';

type InputProps = {
    className?: string;
    style?: React.CSSProperties;
    alt: number;
    az: number;
};

export default class Marker extends React.PureComponent<InputProps> {
    render() {
        let dst = 0.5 * (90 - this.props.alt) / 90;
        
        let relX = 0.5 + dst * Math.sin(this.props.az * Math.PI / 180.0);
        let relY = 0.5 - dst * Math.cos(this.props.az * Math.PI / 180.0);

        const style = { "--relx": relX, "--rely": relY, ...this.props.style } as React.CSSProperties;

        return <div
                    className={`MiniMapMarker ${this.props.className || ''}`}
                    style={style}
                    ></div>
    }

}
