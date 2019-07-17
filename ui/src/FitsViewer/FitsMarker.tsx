import React, { Component, PureComponent} from 'react';

interface FitsChildToken {
    setPosition(x:number, y:number):void;
    free():void;
}

export type Props = {
    x:number;
    y:number;
    __fitsViewerDeclareChild?:(el: React.RefObject<HTMLDivElement>)=>FitsChildToken;
};


export default class FitsMarker extends React.PureComponent<Props> {
    el: React.RefObject<HTMLDivElement> = React.createRef();
    token?: FitsChildToken;

    render() {
        return <div style={{position:"absolute", overflow:"visible", width: "0px", height:"0px"}} ref={this.el}>{this.props.children}</div>;
    }

    componentDidMount() {
        this.token = this.props.__fitsViewerDeclareChild && this.props.__fitsViewerDeclareChild(this.el);
        if (this.token) {
            this.token.setPosition(this.props.x, this.props.y);
        }
    }

    componentDidUpdate() {
        if (this.token) {
            this.token.setPosition(this.props.x, this.props.y);
        }
    }

    
    componentDidUnmount() {
        if (this.token) {
            this.token.free();
        }
        this.token = undefined;
    }
}