import * as React from 'react';
import './HelpOverlay.css';


export type KeyRenderer = string | (()=>React.ReactNode);


export class Key {
    private id: string;
    renderer: KeyRenderer;
    details?: string;
    private static nextId = 0;
    private static dictionary = new Map<string, Key>();

    constructor(renderer:KeyRenderer) {
        this.renderer = renderer;
        this.id = "HelpKey" + (Key.nextId++);
        Key.dictionary.set(this.id, this);
    }

    public readonly dom =()=>({
        "data-help": this.id
    });

    public static readonly byId=(id:string)=>{
        return Key.dictionary.get(id);
    }
}


export function key(renderer:KeyRenderer): Key;
export function key(title: string, details: string): Key;
export function key(title:KeyRenderer, details?: string): Key
{
    const ret = new Key(title);
    ret.details = details;
    return ret;
}