

export class Comparator<Item> {
    apply:(a:Item, b:Item)=>number = ()=>0;

    constructor(apply:(a:Item, b:Item)=>number) {
        this.apply = apply;
    }

    defaultTo(other: Comparator<Item>){
        return new Comparator<Item>((a, b)=> {
            let v = this.apply(a, b);
            if (v === 0)
                v = other.apply(a, b);
            return v;
        });
    }

    applyTo<OtherItem>(accessor:(x:OtherItem)=>Item) {
        return new Comparator<OtherItem>((a, b)=>{
            return this.apply(accessor(a), accessor(b));
        });
    }

    static ordering<Item>()
    {
        return new Comparator<Item>((a, b)=>
            a == b ? 0:
                a > b ? 1 : -1
        );
    }

    static when<Item>(predicate:(c:Item)=>boolean, when_true: Comparator<Item>, when_false?: Comparator<Item>)
    {
        return new Comparator<Item>((a, b)=>{
            const aStatus = predicate(a);
            const bStatus = predicate(b);

            if (aStatus && bStatus) {
                return when_true.apply(a, b);
            }
            if (aStatus) {
                return -1;
            }
            if (bStatus) {
                return 1;
            }
            return (when_false||when_true).apply(a,b);
        });
    }

};
