import * as React from 'react';
import './HelpOverlay.css';


export type KeyRenderer = string | (()=>React.ReactNode);


export class Key {
    private id: string;
    title: string|undefined;
    details?: KeyRenderer;
    private static nextId = 0;
    private static dictionary = new Map<string, Key>();

    constructor(title : string|undefined, details?:KeyRenderer) {
        this.title = title;
        this.details = details;
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
export function key(title: string, details: KeyRenderer): Key;
export function key(title:KeyRenderer, details?: KeyRenderer): Key
{
    if (details === undefined) {
        // We have only a content
        return new Key(undefined, title);
    } else {
        if (typeof title === "string") {
            return new Key(title, details);
        }
        throw new Error("title cannot be a KeyRenderer");
    }
}