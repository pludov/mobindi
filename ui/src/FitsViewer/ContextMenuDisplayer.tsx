import React from 'react';
import ContextMenuContext, {OpenTrigger} from './ContextMenuContext';
import { ContextMenuEntry } from './FitsViewer';

type Props = {
    children: (trigger: OpenTrigger, entries: ContextMenuEntry[])=>React.ReactNode;
}

/**
 * Display a component only if the ambiant context menu is open
 */
export default class ContextMenuDisplayer extends React.PureComponent<Props> {
    render() {
        return <ContextMenuContext.Opened.Consumer>
            {
                trigger=> (trigger === null
                    ? null
                    :
                        <ContextMenuContext.Entries.Consumer>
                            {
                                entries => this.props.children(trigger, entries)
                            }
                        </ContextMenuContext.Entries.Consumer>
                )
            }
        </ContextMenuContext.Opened.Consumer>
    }
}
