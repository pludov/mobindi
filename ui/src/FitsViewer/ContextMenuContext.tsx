import React, { Component, PureComponent} from 'react';
import * as Obj from '../shared/Obj';
import { ContextMenuEntry } from './FitsViewer';

export type OpenTrigger = {x:number, y:number};

type Props = {
    open: OpenTrigger|null;
    close: ()=>void;
};


type State = {
    entries: ContextMenuEntry[];
};

export interface ContextMenuReference {
    // Return false if this reference cannot be used anymore
    update: (parent: ContextMenuLink, menu: ContextMenuEntry)=>boolean;
    free: ()=>void;
}

export interface ContextMenuLink {
    addMenu: (e:ContextMenuEntry)=>ContextMenuReference;
    close: ()=>void;
}

class ContextMenuReferenceImpl implements ContextMenuReference{
    context: ContextMenuContext;
    menu: ContextMenuEntry;

    constructor(context: ContextMenuContext, menu: ContextMenuEntry) {
        this.context = context;
        this.menu = menu;
        this.context.menus.add(this);
        this.context.refreshEntries();
    }

    update= (parent: ContextMenuLink, menu: ContextMenuEntry) : boolean => {
        if (parent !== this.context) {
            return false;
        }
        if (this.menu === menu) {
            return true;
        }
        this.menu = menu;
        this.context.refreshEntries();
        return true;
    };

    free = () => {
        this.context.menus.delete(this);
        this.context.refreshEntries();
    }
}

export default class ContextMenuContext extends React.PureComponent<Props, State> {
    public static readonly declareMenu = React.createContext<ContextMenuLink|null>(null);
    public static readonly opened = React.createContext<OpenTrigger|null>(null);
    public static readonly entries = React.createContext<ContextMenuEntry[]>([]);

    menus: Set<ContextMenuReferenceImpl> = new Set();
    prevEntries : ContextMenuEntry[];

    constructor(props: Props) {
        super(props);
        this.state = {
            entries: []
        }
        this.prevEntries = [];
    }

    addMenu = (e: ContextMenuEntry)=> {
        return new ContextMenuReferenceImpl(this, e);
    }

    refreshEntries=()=> {
        const entries = [];
        for(const e of Array.from(this.menus.values())) {
            entries.push(e.menu);
        }
        entries.sort((a, b)=>(a.uid < b.uid ? -1 : a.uid > b.uid ? 1 : 0));
        if (!Obj.deepEqual(entries, this.prevEntries)) {
            this.prevEntries = entries;
            this.setState({entries});
        }
    }

    close = ()=>{
        this.props.close();
    }

    contextMenuLink = {
        addMenu: this.addMenu,
        close: this.close
    }

    render() {

        return <>
            <ContextMenuContext.declareMenu.Provider value={this.contextMenuLink}>
                <ContextMenuContext.opened.Provider value={this.props.open}>
                    <ContextMenuContext.entries.Provider value={this.state.entries}>
                        {this.props.children}
                    </ContextMenuContext.entries.Provider>
                </ContextMenuContext.opened.Provider>
            </ContextMenuContext.declareMenu.Provider>
        </>;
    }



}