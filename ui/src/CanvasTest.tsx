import React, { Component, PureComponent} from 'react';

import Konva from 'konva';
import { render } from 'react-dom';
import { Stage, Layer, Shape, Circle } from 'react-konva';


type Props = {};

type State = {
    cpt: number;
}

function init() {
    const stars = [];

    for(let i = 0; i < 300; ++i) {
        stars[i] = [
            Math.random() * 2 - 1,
            Math.random() * 2 - 1,
            1 + 3 * Math.exp(-Math.random())
        ];
    }

    return stars;
}

const stars = init();

export default class CanvasTest extends React.PureComponent<Props, State> {
    timeout: NodeJS.Timeout;

    constructor(props:Props) {
        super(props);
        this.state = {cpt: 0};
    }

    componentDidMount() {
        this.timeout = setInterval(()=>this.tick(), 10);
    }

    tick() {
        this.setState({cpt: this.state.cpt+1});
    }

    render() {
        const cs = 200 * Math.cos(this.state.cpt / 100);
        const sn = 200 * Math.sin(this.state.cpt / 100);
        
        return <div style={{backgroundColor: "#112233" }} className={"FitsViewer"}>

            <Stage width={1000} height={500}>
                <Layer>
                <Shape
                    sceneFunc={(context, shape) => {
                        context.beginPath();
                        context.moveTo(20, 50);
                        context.lineTo(220, 80);
                        context.quadraticCurveTo(150, 100, 260, 170);
                        context.closePath();
                        // (!) Konva specific method, it is very important
                        context.fillStrokeShape(shape);
                    }}
                    fill="#00D2FF"
                    stroke="black"
                    strokeWidth={4}
                />
                    {
                        stars.map(e=>
                            <Circle
                                radius={e[2]}
                                fill="#ffffff"
                                x={200 + cs * e[0] + sn * e[1]}
                                y={200 + cs * e[1] - sn * e[0]}
                                />)
                    }
                </Layer>
            </Stage>
        </div>;
    }
};

