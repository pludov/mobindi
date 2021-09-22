import * as React from 'react';

import * as Help from './Help';
import * as Store from "./Store";
import {For} from "./shared/AccessPath";
import { defaultMemoize } from 'reselect';
import * as NotificationStore from "./NotificationStore";
import "./MessageViewControls.css"
import Bool from './primitives/Bool';

type WatchSettingsViewInputProps = {
}

type WatchSettingsViewMappedProps = {
    notificationAuth: boolean|undefined;
    watchActive: boolean;
    tictac: boolean;
}

type WatchSettingsViewProps = WatchSettingsViewInputProps & WatchSettingsViewMappedProps;

class UnmappedWatchSettingsView extends React.PureComponent<WatchSettingsViewProps> {
    static tictacHelp = Help.key("Emit tic tac", "Keep on emiting a clock like sound while supervision is active. This helps in ensuring that the monitoring doesn't stop when browser is hidden/screen is off.");
    static tictacHoursHelp = Help.key("Chime hours", "Chime at every hour.");

    constructor(props:WatchSettingsViewProps) {
        super(props);
    }

    private readonly tictacAccessor = defaultMemoize(()=>NotificationStore.WatchConfigurationAccessor().child(For((e)=>e.tictac)));
    private readonly tictacHoursAccessor = defaultMemoize(()=>NotificationStore.WatchConfigurationAccessor().child(For((e)=>e.tictacHours)));

    render() {
        return <div>
            <div>Configuration of audio alerts</div>
            <div>
                <Bool accessor={this.tictacAccessor()} helpKey={UnmappedWatchSettingsView.tictacHelp}></Bool> {UnmappedWatchSettingsView.tictacHelp.title}
            </div>
            {this.props.tictac ?
                <div>
                    <Bool accessor={this.tictacHoursAccessor()} helpKey={UnmappedWatchSettingsView.tictacHoursHelp}></Bool> {UnmappedWatchSettingsView.tictacHoursHelp.title}
                </div>
                : null
            }
            <div style={{"margin": "4em 0 1em 0"}}>
                Sound effects courtesy of <a href="https://www.orangefreesounds.com/">www.orangefreesounds.com</a> and <a href="https://www.fesliyanstudios.com/">www.fesliyanstudios.com</a>
            </div>
        </div>
    }

    static mapStateToProps(store:Store.Content, ownProps:WatchSettingsViewInputProps):WatchSettingsViewMappedProps {
        return {
            notificationAuth: store.messages.notificationAuth,
            watchActive: !!store.watch?.active,
            tictac: !!store.watch?.tictac,
        };
    }
}

export default Store.Connect(UnmappedWatchSettingsView);
