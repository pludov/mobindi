import { createSelectorCreator, defaultMemoize } from 'reselect'
import { isArrayEqual } from '../Utils';

const arraySelectorCreator = createSelectorCreator(
    defaultMemoize,
    isArrayEqual
  );

function createArraySelector<State,Optional,Result>(selector: (state:State, arg?:Optional, arg2?:Optional)=>Result[]):(state:State,arg?:Optional, arg2?:Optional)=>Result[]
{
    return arraySelectorCreator(
        [selector],
        (a:any)=>a);
}

export default {createArraySelector, isArrayEqual};

