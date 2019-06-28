import * as React from 'react';
import * as Store from './Store';
import './NotificationContainer.css';
import Notification from './Notification';
import ExpirableList from './ExpirableList';

type InputProps = {}
type MappedProps = {
    list: string[]
}
type Props = InputProps & MappedProps;


class NotificationContainer extends React.PureComponent<Props> {

    constructor(props:Props) {
        super(props);
    }

    public renderChild = (uuid:string)=> {
        return <Notification uuid={uuid}/>
    }

    public render() {
        return <div className="NotificationViewContainer">
            <ExpirableList
                list={this.props.list}
                render={this.renderChild}
                reverse={true}
                delay={2000}
            />
        </div>;
    }

    static mapStateToProps = function(store:Store.Content, props:InputProps):MappedProps {
        return {
            list: store.backend.notification ? store.backend.notification!.list : []
        };
    }
}


export default Store.Connect(NotificationContainer);