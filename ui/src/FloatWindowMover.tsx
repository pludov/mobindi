import React from 'react';
import FloatContainer, {FloatContainerContext} from './FloatContainer';
import $ from 'jquery';
import MouseMoveListener from './MouseMoveListener';

type Props = React.DetailedHTMLProps<React.HTMLAttributes<HTMLDivElement>, HTMLDivElement>;

type State = {
}


export default class FloatWindowMover extends React.PureComponent<Props, State> {
    private divRef: React.RefObject<HTMLDivElement> = React.createRef();
    private moveListener?: MouseMoveListener;
    context: FloatContainerContext|undefined;
    touches = {};

    constructor(props:Props) {
        super(props);
    }


    componentDidMount() {
        this.moveListener = new MouseMoveListener($(this.divRef.current!), {
            openContextMenu:(cx: number, cy:number)=>{
                this.context?.openContextMenu(cx, cy);
            },
            closeContextMenu:()=>{
                this.context?.closeContextMenu();
            },
            zoom:()=>{},
            drag:(dx, dy)=>{
                this.context?.deltaMove(dx, dy)
            },
            endDrag:()=> {
                this.context?.deltaMoveEnd();
            }
        });
    }

    componentWillUnmount() {
        if (this.moveListener) {
            this.moveListener.dispose();
            // this.moveListener = undefined;
        }
    }

    render() {
        return <div {...this.props}
                    ref={this.divRef}
                    style={{ ...this.props.style, cursor: "pointer"}}>
            {this.props.children}
        </div>;
    }

}

FloatWindowMover.contextType = FloatContainer.Context;