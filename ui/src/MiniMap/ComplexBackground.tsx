import React from 'react';

type InputProps = {
    className?: string;
    style?: React.CSSProperties;
    // Alt - az array of colors
    gradient: string[][];
};

export default class ComplexBackground extends React.PureComponent<InputProps> {
    
    
    renderGradient(level: number, values: Array<string>) {


        let angleStep = 360 / values.length;
        let background = values.map((c, i) => `${c} ${i * angleStep}deg ${(i + 1) * angleStep}deg`).join(', ');

        const style = { "--level": level, background: `conic-gradient(${background})`, ...this.props.style } as React.CSSProperties;

        return <div
                    key={`histo-${level}`}
                    className={`MiniMapBackground ${this.props.className || ''}`}
                    style={style}
                    />;
    }

    render() {
        return <>
            {this.props.gradient?.map((e, i) => this.renderGradient(i / this.props.gradient!.length, e))}
        </>
    }

}
