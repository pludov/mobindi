import { createSelectorCreator, defaultMemoize } from 'reselect'
import { isArrayEqual } from '../Utils';

const arraySelectorCreator = createSelectorCreator(
    defaultMemoize,
    isArrayEqual
  );

function createArraySelector<Args extends any[],Result>(selector: (...args:Args)=>Result[]):(...args:Args)=>Result[]
{
    return (arraySelectorCreator as any)(
        [selector],
        (a:any)=>a);
}

const ArrayReselect = {arraySelectorCreator, createArraySelector, isArrayEqual};
export default ArrayReselect;
