import React, { Component, PureComponent} from 'react';
import ContextMenuContext, {ContextMenuLink, ContextMenuReference, OpenTrigger} from './ContextMenuContext';
import { ContextMenuEntry } from './FitsViewer';

type Props = {
    children: ContextMenuEntry;
    menuLink: ContextMenuLink;
}

class ContextMenuItemDeclarator extends React.PureComponent<Props> {
    private token: ContextMenuReference|null = null;

    allocToken = () => {
        this.token = this.props.menuLink ? this.props.menuLink.addMenu(this.props.children) : null;
    }

    releaseToken = () => {
        if (this.token !== null) {
            this.token.free();
            this.token = null;
        }
    }

    componentDidMount() {
        this.allocToken();
    }

    componentDidUpdate() {
        if (this.token && this.token.update(this.props.menuLink, this.props.children)) {
            return;
        }

        this.releaseToken();
        this.allocToken();
    }

    componentWillUnmount() {
        this.releaseToken();
    }

    render() {
        return <></>;
    }

}

/**
 * Declare a context menu item in the current context menu
 */
export default class ContextMenuItem extends React.PureComponent<ContextMenuEntry> {
    render() {
        return <ContextMenuContext.declareMenu.Consumer>
            {
                menuLink=> (menuLink === null
                    ? null
                    : <ContextMenuItemDeclarator menuLink={menuLink}>{this.props}</ContextMenuItemDeclarator>
                )
            }
        </ContextMenuContext.declareMenu.Consumer>
    }
}
