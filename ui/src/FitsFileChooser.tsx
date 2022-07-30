import * as React from 'react';

import * as Utils from "./Utils";

import * as Help from "./Help";
import Log from './shared/Log';
import * as BackendRequest from "./BackendRequest";
import * as Store from "./Store";
import CancellationToken from 'cancellationtoken';

import { ImageFileInfo } from '@bo/BackOfficeAPI';

import "./FitsFileChooser.css";


const logger = Log.logger(__filename);

type State = {
    busy: boolean;
    error: string|null;
    path : string|undefined;
    content: Array<ImageFileInfo>;
}

type Props = {
    chooseCb: (path: string)=>void;
    defaultPathAccessor: Store.Accessor<string|null>;
};

function pathCombine(path: string, child: string) {
    while(path.endsWith('/')) {
        path = path.substring(0, path.length - 1);
    }

    path = path + '/' + child;
    return path;
}

class FitsFileChooser extends React.PureComponent<Props, State> {

    loadAttemptCancel : undefined|(()=>void) = undefined;

    constructor(props: Props) {
        super(props);
        this.state = {
            busy: false,
            path: undefined,
            error: null,
            content: [],
        }
    }

    /** Force opening settings when no scope is connected */
    static getDerivedStateFromProps(newProps:Props, prevState:State) {
        if (prevState?.path === undefined) {
            return {
                path: newProps.defaultPathAccessor.fromStore(Store.getStore().getState()) || '/'
            };
        }
        return {};
    }


    async loadData() {
        this.setState({
            busy: true,
            error: null,
            content: [],
        });
        const path = this.state.path;

        const {token, cancel} = CancellationToken.create();
        this.loadAttemptCancel = cancel;

        try {
            const e = await BackendRequest.RootInvoker("camera")("getImageFiles")(
                token,
                {
                    path: path!
                }
            );
            token.throwIfCancelled();

            this.setState({
                busy: false,
                error: null,
                content: e
            });
        } catch(e) {
            token.throwIfCancelled();
            this.setState({
                busy: false,
                error: e.message,
                content: [],
            });
        } finally {
            if (this.loadAttemptCancel === cancel) {
                this.loadAttemptCancel = undefined;
            }
        }
    }

    cancelLoadData = ()=>{
        const cancel = this.loadAttemptCancel;
        if (cancel !== undefined) {
            this.loadAttemptCancel = undefined;
            cancel();
        }
    }

    componentDidMount() {
        this.loadData();
    }

    componentWillUnmount() {
        this.cancelLoadData();
    }

    componentDidUpdate(prevProps:Props, prevState:State) {
        if (this.state.path != prevState.path) {
            this.cancelLoadData();
            this.loadData();
        }
    }

    fileClicked:React.MouseEventHandler<HTMLElement> = (e) =>{
        const idClicked = (e.target as HTMLElement).dataset.path!;
        this.props.chooseCb(pathCombine(this.state.path! , idClicked));
    }

    switchToPath = async(path: string)=> {
        this.setState({
            path
        });
        try {
            await this.props.defaultPathAccessor.send(path);
        } catch(e) {
            logger.error('Failed to update default path', e);
        }
    }

    dirClicked: React.MouseEventHandler<HTMLElement> = async (e) =>{
        const idClicked = (e.target as HTMLElement).dataset.path!;
        const path = pathCombine(this.state.path! , idClicked);
        await this.switchToPath(path);
    }

    parentClicked: React.MouseEventHandler<HTMLElement> = async (e) =>{
        const path = (e.target as HTMLElement).dataset.path!;
        await this.switchToPath(path);
    }


    render=() => {
        const currentPath = (this.state.path||'/').split('/').map((e)=>({title: e+'/', path: e}));
        let p = '/';
        for(const c of currentPath) {
            c.path = p + c.path;
            if (c.path !== '/') {
                p = c.path + '/';
            }
        }
        return <div className="FitsSelectorContainer">

            <div className="FitsSelectorPath">
                {currentPath.map((c)=>
                    <span className='currentDirectoryPathPart' data-path={c.path} onClick={this.parentClicked}>
                        {c.title}
                    </span>
                )}
            </div>
            <div className="FitsSelectorContent">
                {this.state.busy
                    ? <div>Loading...</div>
                    : null
                }
                {this.state.error
                    ? <div>{this.state.error}</div>
                    : null
                }

                {
                    this.state.content.map((e)=>
                        <div className="directoryEntry" key={e.name} data-path={e.name} onClick={e.type === "dir" ? this.dirClicked : this.fileClicked}>
                            <span className="FileTypeIndicator">
                                {e.type === "dir" ? '📁' : '🎞' }
                            </span>
                            {e.name}
                        </div>
                    )
                }
            </div>
        </div>

    }

};


export default FitsFileChooser;