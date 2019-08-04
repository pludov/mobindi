import * as React from 'react';
import $ from 'jquery';

import CancellationToken from 'cancellationtoken';


import * as BackofficeStatus from '@bo/BackOfficeStatus';
import * as BackendRequest from "../BackendRequest";
import * as Store from "../Store";
import ContextMenuCross from '../FitsViewer/ContextMenuCross';
import ContextMenu from './ContextMenu';

declare var S: any;


export type VirtualSkyRightClick = {
    canvasx: number;
    canvasy: number;
    skyPos?: {
        ra: number;
        dec: number;
    }
}

class VirtualSkyAccessor {
    public readonly virtualSky : any;
    public readonly container: HTMLDivElement;

    public onRightClick: (e:VirtualSkyRightClick)=>void = ()=>{};

    private static virtualSkyContainer:HTMLDivElement|undefined = undefined;
    private static virtualSkyInvisibleContainer: HTMLSpanElement|undefined = undefined;
    private static virtualSkyInstance:any = undefined;
    private static currentAccessor: VirtualSkyAccessor|undefined = undefined;

    private static globalInit() {
        VirtualSkyAccessor.virtualSkyInvisibleContainer=$("<span style='display: none'></span>")[0] as HTMLSpanElement;

        VirtualSkyAccessor.virtualSkyContainer=$("<div id='virtualSky' style='width: 100%; height: 100%'></div>")[0] as HTMLDivElement;
        VirtualSkyAccessor.virtualSkyInvisibleContainer.append(VirtualSkyAccessor.virtualSkyContainer);
        $("body").append(VirtualSkyAccessor.virtualSkyInvisibleContainer);

        VirtualSkyAccessor.virtualSkyInstance = S.virtualsky({
            id: 'virtualSky',
            'projection': 'gnomic',
            'ra': 83.8220833,
            'dec': -5.3911111,
            'ground': true,
            'constellations': true,
            'fov': 15,
            callback: {
                rightclick: (e:VirtualSkyRightClick)=> {
                    if (VirtualSkyAccessor.currentAccessor) {
                        VirtualSkyAccessor.currentAccessor.onRightClick(e);
                    }
                }
            }
        });
        console.log("Done virtual sky init", VirtualSkyAccessor.virtualSkyInstance);
    }

    constructor() {
        if (VirtualSkyAccessor.currentAccessor !== undefined) {
            throw new Error("Virtual sky cannot be shared");
        }

        if (VirtualSkyAccessor.virtualSkyInstance === undefined) {
            VirtualSkyAccessor.globalInit();
        }
        this.virtualSky = VirtualSkyAccessor.virtualSkyInstance;
        this.container = VirtualSkyAccessor.virtualSkyContainer!;
        VirtualSkyAccessor.currentAccessor = this;
    }

    public release() {
        if (VirtualSkyAccessor.currentAccessor !== this) {
            throw new Error("Virtual sky release of non active instance");
        }
        VirtualSkyAccessor.currentAccessor = undefined;
        if (this.container.parentElement !== VirtualSkyAccessor.virtualSkyInvisibleContainer) {
            // this.container.parentElement.removeChild(this.container);
            VirtualSkyAccessor.virtualSkyInvisibleContainer!.append(this.container);
        }

        // Turn off live mode
        // this.virtualSky.stop();
    }
}


type Props = {};

type State = {
    rightClick?: VirtualSkyRightClick;
}

export default class Sky extends React.PureComponent<Props, State> {
    private readonly el =  React.createRef<HTMLDivElement>();
    private virtualSkyAccessor: VirtualSkyAccessor|undefined;

    constructor(p:Props) {
        super(p);
        this.state = {}
    }

    render() {
        return (<div ref={this.el} style={{width: '100%', height: '100%', position: 'relative' }}>
                    {this.state.rightClick
                        ?<ContextMenuCross
                            x={this.state.rightClick.canvasx}
                            y={this.state.rightClick.canvasy}/>
                        : null
                    }
                    {this.state.rightClick
                        ?<ContextMenu
                            event={this.state.rightClick}
                            close={this.closeContextMenu}
                            goto={this.goto}
                            sync={this.goto}
                            />
                        : null
                    }
                </div>);
    }

    closeContextMenu=()=> {
        this.setState({rightClick: undefined});
    }
    goto = (e:VirtualSkyRightClick)=> {
        this.closeContextMenu();
    }
    sync = (e:VirtualSkyRightClick)=> {
        this.closeContextMenu();
    }

    onRightClick = (e:VirtualSkyRightClick)=> {
        console.log('onrightclick', e);
        this.setState({rightClick: e});
    }

    componentDidMount() {
        console.log('virtual sky did mount');
        const e = this.el.current;
        if (!e) {
            return;
        }
        this.virtualSkyAccessor = new VirtualSkyAccessor();
        this.virtualSkyAccessor.onRightClick = this.onRightClick;
        e.append(this.virtualSkyAccessor.container);
        this.virtualSkyAccessor.virtualSky.resize();
    }

    componentWillUnmount() {
        if (this.virtualSkyAccessor) {
            this.virtualSkyAccessor.release();
            this.virtualSkyAccessor = undefined;
        }
    }
};

