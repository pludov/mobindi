import React, { Component, PureComponent} from 'react';
import FitsViewer, { FitsViewerContext } from './FitsViewer';

interface FitsChildToken {
    setPosition(x:number, y:number):void;
    free():void;
}

export type Props = {
    x:number;
    y:number;
    viewerContext?: FitsViewerContext;
};


class FitsViewerPositionedItem extends React.PureComponent<Props> {
    el: React.RefObject<HTMLDivElement> = React.createRef();
    token?: FitsChildToken;

    componentDidMount() {
        this.token = this.props.viewerContext && this.props.viewerContext.declareChild(this.el);
        if (this.token) {
            this.token.setPosition(this.props.x, this.props.y);
        }
    }

    componentDidUpdate(prevProps: Props) {
        if (prevProps?.viewerContext != this.props.viewerContext) {
            // Kill the previous token
            if (this.token) {
                this.token.free();
                this.token = undefined;
            }
            // Ensure we have a token
            if (this.props.viewerContext) {
                this.token = this.props.viewerContext.declareChild(this.el)
                if (this.token) {
                    this.token.setPosition(this.props.x, this.props.y);
                }
            }
        } else if (prevProps?.x != this.props.x || prevProps?.y != this.props.y) {
            if (this.token) {
                this.token.setPosition(this.props.x, this.props.y);
            }
        }
    }

    componentWillUnmount() {
        if (this.token) {
            this.token.free();
        }
        this.token = undefined;
    }

    render() {
        return <div style={{position:"absolute", overflow:"visible", width: "0px", height:"0px"}} ref={this.el}>{this.props.children}</div>;
    }
}

export default class FitsMarker extends React.PureComponent<Props> {

    render() {
        return <FitsViewer.ViewContext.Consumer>
            {viewerContext=>
                <FitsViewerPositionedItem x={this.props.x} y={this.props.y} viewerContext={viewerContext} children={this.props.children}/>
            }
        </FitsViewer.ViewContext.Consumer>;
    }
}