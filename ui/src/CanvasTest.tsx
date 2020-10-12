import React, { Component, PureComponent} from 'react';

import Konva from 'konva';
import { render } from 'react-dom';
import { Stage, Layer, Shape, Circle, Line } from 'react-konva';

import FitsViewer, {Props as FitsViewerProps, FullState as FitsViewerFullState} from './FitsViewer/FitsViewer';

type Props = {
    path: FitsViewerProps["path"];
    streamId: FitsViewerProps["streamId"];
    streamSerial: FitsViewerProps["streamSerial"];
    streamSize: FitsViewerProps["streamSize"];
    subframe: FitsViewerProps["subframe"];
}

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

function initLines() {
    const ret = [];
    for(let i = 0; i < 35; ++i) {
        ret.push([Math.floor(Math.random() * stars.length), Math.floor(Math.random() * stars.length)]);
    }
    return ret;
}

const stars = init();

function createHisto() {
    const ret = [];
    for(let i = 0; i < 256; ++i) {
        ret.push(100 * Math.sin(3.1415* i / 256));
    }
    return ret;
}

const histo = createHisto();

const starLines:Array<Array<number>> = initLines();

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
        return <div style={{backgroundColor: "#112233" , width: "15em", height:"10em" }}>

            <Stage width={100} height={150} opacity={1}>
                <Layer>
                <Shape
                    sceneFunc={(context, shape) => {
                        context.beginPath();
                        context.moveTo(0,0);
                        for(let i = 0; i < 256; ++i) {
                            context.lineTo(i, histo[(i+this.state.cpt)%256]);
                        }
                        context.lineTo(255,0);
                        context.closePath();
                        // (!) Konva specific method, it is very important
                        context.fillShape(shape);
                    }}
                    fill="rgb(0,128,0)"
                />
                <Shape
                    sceneFunc={(context, shape) => {
                        context.beginPath();
                        
                        for(let i = 0; i < 256; ++i) {
                            if (i === 0) {
                                context.moveTo(i, histo[(i+this.state.cpt)%256]);
                            } else {
                                context.lineTo(i, histo[(i+this.state.cpt)%256]);
                            }
                        }

                        // context.endPath();
                        // (!) Konva specific method, it is very important
                        context.strokeShape(shape);
                    }}
                    stroke="rgb(0,255,0)"
                    strokeWidth={2}
                />
                </Layer>
            </Stage>
        </div>;


    }

    renderStars() {
        
        const cs = 200 * Math.cos(this.state.cpt / 100);
        const sn = 200 * Math.sin(this.state.cpt / 100);
        const starPos = stars.map(e=>
            [ 
                    200 + cs * e[0] + sn * e[1], 
                    200 + cs * e[1] - sn * e[0], 
                    e[2]]);

        return <div style={{backgroundColor: "#112233" }} className={"FitsViewer"}>

            <Stage width={1000} height={500} opacity={1}>
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
                        starPos.map((e, i)=>
                            <Circle
                                id={""+ i}
                                radius={e[2]}
                                fill="#ffffff"
                                x={e[0]}
                                y={e[1]}
                                />)
                    }
                    {
                        /*starLines.map((e, i)=> {
                            const sp0 = starPos[e[0]];
                            const sp1 = starPos[e[1]];
                            
                            return <Line id={"" + i} points={[sp0[0], sp0[1], sp1[0], sp1[1]]} stroke="#ffffff"/>
                        })*/
                    }
                </Layer>
            </Stage>
        </div>;
    }
};

