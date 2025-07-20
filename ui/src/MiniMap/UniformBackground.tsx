import React from 'react';

type InputProps = {
    className?: string;
};

export default class UniformBackground extends React.PureComponent<InputProps> {
    render() {
        return <div className={`MiniMapBackground ${this.props.className || ''}`}>
            {this.props.children}
        </div>;
    }

}
