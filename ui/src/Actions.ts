import * as Store from './Store';


export class Handler<ActionType, id extends string> {
    public readonly executor: (store:Store.Content, action:ActionType)=>Store.Content;
    public readonly id: id;
    constructor(id: id, executor: (store:Store.Content, action:ActionType)=>Store.Content) {
        this.executor = executor;
        this.id = id;
    }

    public readonly dispatch=(action: ActionType)=>{
        Store.store.dispatch({
            ...action,
            type: this.id
       });
    }
}

