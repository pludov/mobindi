import * as React from 'react';
import * as Store from './Store';
import './NotificationContainer.css';
import * as BackendRequest from "./BackendRequest";
import CancellationToken from 'cancellationtoken';
import { has } from './Utils';
import { NotificationItem } from '@bo/BackOfficeStatus';

type InputProps = {
    uuid: string;
}
type MappedProps = {
    visible: false;
    screenVisible?: boolean;
} | (
    {
        visible : true;
        screenVisible?: boolean;
    }
    & NotificationItem
)
type Props = InputProps & MappedProps;

type State = {
    busy: boolean;
}

class Notification extends React.PureComponent<Props, State> {
    prevDisplay: NotificationItem;
    dismissTimeout: undefined | NodeJS.Timeout;
    constructor(props:Props) {
        super(props);
        this.prevDisplay = {
            time: 0,
            title: "",
            type: "oneshot",
            buttons: null,
        }
        this.state = {
            busy: false,
        }
    }
    
    private submit= async (result?:any)=> {
        try {
            if (this.state.busy) {
                throw new Error("Not chaining");
            }
            this.setState({busy: true});

            await BackendRequest.RootInvoker("notification")("closeNotification")(
                CancellationToken.CONTINUE,
                {
                    uuid: this.props.uuid,
                    result
                }
            );
        } catch(e) {
            this.setState({busy: false});
        }
    }

    public dismiss=()=>{
        this.submit();
    }

    private timedDimsiss = ()=>{
        this.dismissTimeout = undefined;
        this.dismiss();
    }

    componentWillUnmount = ()=> {
        if (this.dismissTimeout !== undefined) {
            clearTimeout(this.dismissTimeout);
        }
    }

    public render() {
        const details: NotificationItem = this.props.visible ? this.props : this.prevDisplay;
        if (this.props.visible) {
            this.prevDisplay = {...this.props}
        }

        if (this.props.visible && this.props.screenVisible !== false && details.type === "oneshot") {
            if (this.dismissTimeout === undefined) {
                this.dismissTimeout = setTimeout(this.timedDimsiss, 5000);
            }
        } else {
            if (this.dismissTimeout !== undefined) {
                clearTimeout(this.dismissTimeout);
                this.dismissTimeout = undefined;
            }
        }

        return <div className={"NotificationView " + (!this.props.visible ? "Dead": "")}>
            <div className="NotificationViewTitle">{details.title}</div>
            {details.buttons === null
                ? <input type="button" value="x" onClick={this.dismiss} disabled={this.state.busy}/>
                : details.buttons.map(
                    (bton, id)=><input key={id} type="button" value={bton.title} onClick={()=>this.submit(bton.value)} disabled={this.state.busy}/>)
            }
        </div>;
    }

    static mapStateToProps = function(store:Store.Content, props:InputProps):MappedProps {
        const screenVisible = store.screenVisible;
        const notification = store.backend.notification;
        if (!notification) {
            return {
                screenVisible,
                visible: false
            }
        }
        if (!has(notification.byuuid, props.uuid)) {
            return {
                screenVisible,
                visible: false
            }
        }
        return {
            visible: true,
            ... notification.byuuid[props.uuid],
            screenVisible
        };
    }

}


export default Store.Connect(Notification);