import React from 'react';
import ReactDOM from 'react-dom';
import { Provider } from 'react-redux';
import './index.css';
import Screen from './Screen';
import App from './App';
import registerServiceWorker from './registerServiceWorker';
import * as Store from './Store';



ReactDOM.render(
        <Provider store={Store.getStore()}>
            <Screen>
                <App/>
            </Screen>
        </Provider>, document.getElementById('root'));
registerServiceWorker();
