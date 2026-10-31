import { createStore } from 'redux';
import { persistState } from './LocalStoragePersist';

type State = { count: number; retained: boolean };

const reducer = (state: State = {count: 0, retained: true}, action: {type: string}): State =>
    action.type === 'increment' ? {...state, count: state.count + 1} : state;

const persistence = () => persistState<State>({
    slicer: state => state,
    deserialize: data => JSON.parse(data),
});

it('restores persisted state over the initial state and saves after dispatch', () => {
    localStorage.clear();
    localStorage.setItem('redux', JSON.stringify({count: 4}));

    const store = createStore(reducer, persistence());
    expect(store.getState()).toEqual({count: 4, retained: true});

    store.dispatch({type: 'increment'});
    expect(JSON.parse(localStorage.getItem('redux')!)).toEqual({count: 5, retained: true});
});
