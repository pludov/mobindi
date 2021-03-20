import React, { Component, PureComponent} from 'react';
import CancellationToken from 'cancellationtoken';
import Log from '../shared/Log';
import * as BackendRequest from "../BackendRequest";

import Konva from 'konva';
import { Stage, Layer, Shape, Circle, Line } from 'react-konva';

import FitsViewer, {Props as FitsViewerProps, FullState as FitsViewerFullState} from './FitsViewer';
import { ProcessorHistogramResult, ProcessorHistogramChannel } from '@bo/ProcessorTypes';
import ReactResizeDetector from 'react-resize-detector';

import "./Histogram.css"

const logger = Log.logger(__filename);

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


type PreRenderedHistogram = {
    color: string;
    shadow: string;
    y: Array<number>;
}

const colors = {
    red: {
        color: "rgb(255,0,0)",
        shadow: "rgb(128,0,0)",
    },
    green: {
        color: "rgb(0,255,0)",
        shadow: "rgb(0,128,0)",
    },
    blue: {
        color: "rgb(0,0,255)",
        shadow: "rgb(0,0,128)",
    },
    light: {
        color: "rgb(240,240,240)",
        shadow: "rgb(128,128,128)",
    }
}


function renderHistogramData(value: ProcessorHistogramChannel, height:number):PreRenderedHistogram {
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

    const scaleTo1 = max ? 1 / max : 0;
    const scale = (height - 1);
    for(let i = 0; i < 256; ++i) {
        yValues[i] = (height - 1) - Math.pow( yValues[i] * scaleTo1, 0.3) * scale;

    }

    const colorId = Object.prototype.hasOwnProperty.call(colors, value.identifier) ? value.identifier : 'light';

    return {
        ...colors[colorId],
        y: yValues,
    }
}

export default class Histogram extends React.PureComponent<Props, State> {
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
                    histogram: {
                        "source": {
                            path: this.props.path || "",
                            streamId: this.props.streamId || "",
                        },
                        options: {
                            maxBits: 8,
                        }
                    }
                }
            );

            this.setState({
                value: e,
                loading: false
            });
        } catch(e) {
            logger.error('Unable to load histogram', {path: this.props.path, streamId: this.props.streamId}, e);
            this.setState({
                value: null,
                loading: false
            });
        };

    }


    _cancelLoadData() {
        // Not implemented
        logger.warn('FIXME: canceling FWHMDisplayer is not implemented');
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
        const channels:Array<PreRenderedHistogram> = (this.state.value || []).map((data)=>renderHistogramData(data, this.state.canvas_y));
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
};

