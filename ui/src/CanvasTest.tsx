import React, { Component, PureComponent} from 'react';
import * as BackendRequest from "./BackendRequest";
import CancellationToken from 'cancellationtoken';

import Konva from 'konva';
import { render } from 'react-dom';
import { Stage, Layer, Shape, Circle, Line } from 'react-konva';

import FitsViewer, {Props as FitsViewerProps, FullState as FitsViewerFullState} from './FitsViewer/FitsViewer';
import { ProcessorHistogramResult } from '@bo/ProcessorTypes';
import ReactResizeDetector from 'react-resize-detector';

import "./Histogram.css"

type Props = {
    path: FitsViewerProps["path"];
    streamId: FitsViewerProps["streamId"];
    streamSerial: FitsViewerProps["streamSerial"];
}

type State = {
    path: FitsViewerProps["path"] | null;
    streamId: FitsViewerProps["streamId"] | null;
    streamSerial: FitsViewerProps["streamSerial"] | null;
    value: ProcessorHistogramResult | null;
    loading: boolean;
    canvas_x: number;
    canvas_y: number;
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

type PreRenderedHistogram = {
    color: string;
    shadow: string;
    y: Array<number>;
}

function renderHistogramData(value: any, height:number):PreRenderedHistogram {
    const yValues:number[] = [];

    let max = 0;
    let lastCumul = 0;
    for(let i = 0; i < 256; ++i) {
        let cumul;
        if (i < value.min || i > value.max) {
            cumul = lastCumul;
        } else {
            cumul = value.data[i - value.min];
        }
        const v = (cumul - lastCumul);
        if (max < v) {
            max = v;
        }
        yValues[i] = v;
        lastCumul = cumul;
    }

    const scale = max ? (height - 1) / max : 0;
    for(let i = 0; i < 256; ++i) {
        yValues[i] = (height - 1) - yValues[i] * scale;

    }

    return {
        color: "rgb(0,255,0)",
        shadow: "rgb(0,127,0)",
        y: yValues,
    }
}

export default class CanvasTest extends React.PureComponent<Props, State> {
    constructor(props:Props) {
        super(props);
        this.state = {
            path: null,
            streamId: null,
            streamSerial: null,
            loading: false,
            value: null,
            canvas_x: 0,
            canvas_y: 0,
        };
    }

    async _loadData() {
        if (this.props.path === this.state.path && this.props.streamId == this.state.streamId) {
            return;
        }
        // Start a new loading.
        // cancel the previous request
        this._cancelLoadData();
        this.setState({
            path: this.props.path,
            streamId: this.props.streamId,
            value: null,
            loading: true
        });
        const self = this;

        try {
            const e = await BackendRequest.ImageProcessor(
                CancellationToken.CONTINUE,
                {
                    histogram: { "source": {
                        path: this.props.path || "",
                        streamId: this.props.streamId || "",
                    }}
                }
            );

            console.log('loaded', e);
            this.setState({
                value: e,
                loading: false
            });
        } catch(e) {
            this.setState({
                value: null,
                loading: false
            });
        };

    }


    _cancelLoadData() {
        // Not implemented
        console.log('FIXME: canceling FWHMDisplayer is not implemented');
    }

    componentWillUnmount() {
        this._cancelLoadData();
    }

    componentDidMount() {
        this._loadData();
    }

    componentDidUpdate(prevProps:Props, prevState:State) {
        this._loadData();
    }

    onCanvasResize=(canvas_x:number, canvas_y:number)=>{
        this.setState({canvas_x, canvas_y});
    }

    render() {
        const channels:Array<PreRenderedHistogram> = (this.state.value || []).map((data:any)=>renderHistogramData(data, this.state.canvas_y));
        const xscale = this.state.canvas_x / 255;

        return <div className="HistogramDetail plop">
            <ReactResizeDetector handleWidth handleHeight onResize={this.onCanvasResize} />
            <Stage width={this.state.canvas_x} height={this.state.canvas_y} opacity={1}>
                <Layer>
                    {channels.map((c, id)=>
                        <Shape key={"shadow:" + id}
                            sceneFunc={(context, shape) => {
                                context.beginPath();
                                context.moveTo(0,this.state.canvas_y);
                                for(let i = 0; i < 256; ++i) {
                                    context.lineTo(i * xscale, c.y[i]);
                                }
                                context.lineTo(255 * xscale,this.state.canvas_y);
                                context.closePath();
                                context.fillShape(shape);
                            }}
                            fill={c.shadow}
                        />
                    )}

                    {channels.map((c, id)=>
                        <Shape key={"light:" + id}
                            sceneFunc={(context, shape) => {
                                context.beginPath();

                                for(let i = 0; i < 256; ++i) {
                                    if (i === 0) {
                                        context.moveTo(i * xscale, c.y[i]);
                                    } else {
                                        context.lineTo(i * xscale, c.y[i]);
                                    }
                                }

                                context.strokeShape(shape);
                            }}
                            stroke={c.color}
                            strokeWidth={1}
                        />
                    )}
                </Layer>
            </Stage>
        </div>;


    }

    renderStars() {
        
        const cs = 200 * Math.cos(1 / 100);
        const sn = 200 * Math.sin(1 / 100);
        const starPos = stars.map(e=>
            [ 
                    200 + cs * e[0] + sn * e[1], 
                    200 + cs * e[1] - sn * e[0], 
                    e[2]]);

        return <div style={{backgroundColor: "#112233", border: "1px solid #ffffff" }} className={"FitsViewer"}>

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

