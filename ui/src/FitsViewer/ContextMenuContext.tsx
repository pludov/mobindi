import React from 'react';
import * as Obj from '../shared/Obj';
import { ContextMenuEntry } from './FitsViewer';

export type OpenTrigger = {x:number, y:number};

type Props = {
};


type State = {
    open: OpenTrigger|null;
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

class ContextMenuTree {
    private keygen: number = 0;
    private children: {[key: string]: ContextMenuTree} = {};
    private parent: ContextMenuTree|null = null;
    private parentKey: string|null = null;
    private forceCloseSelf: (()=>void);

    constructor(onClose: ()=>void) {
        this.forceCloseSelf = onClose;
    }

    setParent(parent: ContextMenuTree|null) {
        if (this.parent == parent) {
            return;
        }

        if (this.parent && this.parentKey) {
            delete this.parent.children[this.parentKey];
            this.parentKey = null;
        }
        this.parent = parent;
        if (this.parent) {
            this.parentKey = this.parent.register(this);
        } else {
            this.parentKey = null;
        }
    }

    private register(child: ContextMenuTree) : string {
        const key = `key_${this.keygen++}`;
        this.children[key] = child;
        return key;
    }

    private forceCloseChilds(ignoreKey: string|null = null) {
        for (const key in this.children) {
            if (key === ignoreKey) {
                continue;
            }
            this.children[key].forceCloseSelf();
            this.children[key].forceCloseChilds();
        }
    }

    // This will broadcast to all other known items of the tree
    public forceCloseOther() {
        this.forceCloseChilds();
        let ignoreKey = this.parentKey;
        let parent = this.parent;
        while (parent !== null) {
            parent.forceCloseSelf();
            parent.forceCloseChilds(ignoreKey);
            ignoreKey = parent.parentKey;
            parent = parent.parent;
        }
    }
}

export default class ContextMenuContext extends React.PureComponent<Props, State> {
    public static readonly DeclareMenu = React.createContext<ContextMenuLink|null>(null);
    public static readonly Opened = React.createContext<OpenTrigger|null>(null);
    public static readonly Entries = React.createContext<ContextMenuEntry[]>([]);
    public static readonly ContextMenuTree = React.createContext<ContextMenuTree|null>(null);

    menus: Set<ContextMenuReferenceImpl> = new Set();
    prevEntries : ContextMenuEntry[];

    private contextMenuTree: ContextMenuTree;
    public context: ContextMenuTree|undefined;

    constructor(props: Props) {
        super(props);
        this.state = {
            entries: [],
            open: null
        }
        this.prevEntries = [];
        this.contextMenuTree = new ContextMenuTree(()=>this.close());
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

    componentWillUnmount() {
        this.contextMenuTree.setParent(null);
    }

    public open = (trigger: OpenTrigger)=>{
        this.contextMenuTree.forceCloseOther();
        this.setState({open: trigger});
    }

    public close = ()=>{
        this.setState({open: null});
    }

    contextMenuLink = {
        addMenu: this.addMenu,
        close: this.close
    }

    render() {
        this.contextMenuTree.setParent(this.context ?? null);
        return <>
            <ContextMenuContext.DeclareMenu.Provider value={this.contextMenuLink}>
                <ContextMenuContext.Opened.Provider value={this.state.open}>
                    <ContextMenuContext.Entries.Provider value={this.state.entries}>
                        <ContextMenuContext.ContextMenuTree.Provider value={this.contextMenuTree}>
                            {this.props.children}
                        </ContextMenuContext.ContextMenuTree.Provider>
                    </ContextMenuContext.Entries.Provider>
                </ContextMenuContext.Opened.Provider>
            </ContextMenuContext.DeclareMenu.Provider>
        </>;
    }



}

ContextMenuContext.contextType = ContextMenuContext.ContextMenuTree;