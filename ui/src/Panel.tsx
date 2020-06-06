import React from 'react';
import Collapsible from 'react-collapsible';
import * as Store from './Store';
import * as Actions from './Actions';
import * as GenericUiStore from './GenericUiStore';

type InputProps = {
    guid: string;
    className?: string;
};

type MappedProps = {
    state: boolean;
}

type Props = InputProps & MappedProps;

class Panel extends React.PureComponent<Props> {
    private child = React.createRef<HTMLSpanElement>();
    setState = (b:boolean)=> {
        Actions.dispatch<GenericUiStore.GenericUiActions>()("setPanelState", {
            panelId: this.props.guid,
            panelState: b
        });
    }

    scrollIntoView = ()=> {
        if (this.child.current!) {
            this.child.current!.scrollIntoView({behavior: "smooth"});
        }
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
                        className={this.props.className}
                        open={this.props.state}
                        onOpening={this.open}
                        onOpen={this.scrollIntoView}
                        onClosing={this.close}
                        transitionTime={200}
                        trigger={head as React.ReactElement<any>}
                        lazyRender={true}><span ref={this.child}>{children}</span></Collapsible>;
    }

    static mapStateToProps(store: Store.Content, ownProps: InputProps):MappedProps {
        return {
            state: GenericUiStore.getPanelState(store, ownProps.guid)
        };
    }
}

export default Store.Connect(Panel);