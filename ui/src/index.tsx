import React from 'react';
import ReactDOM from 'react-dom';
import { connect, Provider } from 'react-redux';
import './index.css';
import Screen from './Screen';
import App from './App';
import Phd from './PhdView';
import registerServiceWorker from './registerServiceWorker';
import * as Store from './Store';


ReactDOM.render(
        <Provider store={Store.getStore()}>
            <Screen>
                <App/>
            </Screen>
        </Provider>, document.getElementById('root'));
registerServiceWorker();
