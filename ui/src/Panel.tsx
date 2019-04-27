import React from 'react';
import Collapsible from 'react-collapsible';
import * as Store from './Store';
import * as Actions from './Actions';
import * as GenericUiStore from './GenericUiStore';

type InputProps = {
    guid: string;
};

type MappedProps = {
    state: boolean;
}

type Props = InputProps & MappedProps;

class Panel extends React.PureComponent<Props> {
    setState = (b:boolean)=> {
        Actions.dispatch<GenericUiStore.Actions>()("setPanelState", {
            panelId: this.props.guid,
            panelState: b
        });
    }

    open = ()=> {
        this.setState(true);
    }

    close = ()=> {
        this.setState(false);
    }

    render() {
        const [head, ...children] = React.Children.toArray(this.props.children);

        return <Collapsible
                        open={this.props.state}
                        onOpening={this.open}
                        onClosing={this.close}
                        transitionTime={200}
                        trigger={head as React.ReactElement<any>}
                        lazyRender={true}>{children}</Collapsible>;
    }

    static mapStateToProps(store: Store.Content, ownProps: InputProps):MappedProps {
        return {
            state: GenericUiStore.getPanelState(store, ownProps.guid)
        };
    }
}

export default Store.Connect(Panel);