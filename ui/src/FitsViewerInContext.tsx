import * as React from "react";

import * as Actions from "./Actions";
import * as Store from "./Store";
import * as FitsViewerStore from "./FitsViewerStore";
import FitsViewer, {Props as FitsViewerProps, FullState as FitsViewerFullState} from './FitsViewer/FitsViewer';

export type InputProps = {
    path: FitsViewerProps["path"];
    streamId: FitsViewerProps["streamId"];
    streamSerial: FitsViewerProps["streamSerial"];
    streamDetails: FitsViewerProps["streamDetails"];
    subframe: FitsViewerProps["subframe"];
    contextKey: string;
};

type MappedProps = {
    viewSettings: FitsViewerProps["viewSettings"];
    directPort: number;
};

type Props = InputProps & MappedProps;

export class UnmappedFitsViewerInContext extends React.PureComponent<Props> {
    fitsViewer = React.createRef<FitsViewer>();
    constructor(props:Props) {
        super(props);
    }

    saveViewSettings=(e:FitsViewerFullState)=>{
        Actions.dispatch<FitsViewerStore.FitsViewerActions>()("setViewerState", {
            context: this.props.contextKey,
            viewSettings: e
        });
    }

    render() {
        return <FitsViewer ref={this.fitsViewer}
                            path={this.props.path}
                            directPort={this.props.directPort}
                            streamId={this.props.streamId}
                            streamDetails={this.props.streamDetails}
                            streamSerial={this.props.streamSerial}
                            subframe={this.props.subframe}
                            viewSettings={this.props.viewSettings}
                            onViewSettingsChange={this.saveViewSettings}
                            children={this.props.children}/>
    }

    static mapStateToProps(store: Store.Content, ownProps: InputProps) {
        return {
            viewSettings: FitsViewerStore.getViewerState(store, ownProps.contextKey),
            directPort: (store.backend && store.backend.uiConfig && store.backend.uiConfig.directPort) || parseInt(document.location.port),
        };
    }
}

export default Store.Connect<UnmappedFitsViewerInContext, InputProps, {}, MappedProps>(UnmappedFitsViewerInContext);
