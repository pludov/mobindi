import React, { Component, PureComponent, CSSProperties, RefObject} from 'react';
import { VirtualSkyRightClick } from './Sky';
import ContextMenuContainer from '../ContextMenuContainer';

export type Props = {
    event: VirtualSkyRightClick;
    goto?: (e:VirtualSkyRightClick)=>void;
    sync?: (e:VirtualSkyRightClick)=>void;
    close: ()=>void;
}

export default class ContextMenu extends PureComponent<Props> {
    constructor(props:Props) {
        super(props);
    }

    private goto = ()=>this.props.goto!(this.props.event);
    private sync = ()=>this.props.sync!(this.props.event);

    render() {
        return(
            <ContextMenuContainer x={this.props.event.canvasx} y={this.props.event.canvasy} close={this.props.close}>
                {this.props.goto
                    ? <div className="Item" onClick={this.goto}>Goto here</div>
                    : null
                }
                {this.props.sync
                    ? <div className="Item" onClick={this.sync}>Sync scope</div>
                    : null
                }
            </ContextMenuContainer>);
    }
}
