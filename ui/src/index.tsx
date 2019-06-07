import React from 'react';
import ReactDOM from 'react-dom';
import { connect, Provider } from 'react-redux';
import './index.css';
import Screen from './Screen';
import App from './App';
import Phd from './PhdView';
import registerServiceWorker from './registerServiceWorker';
import * as Store from './Store';

import Worker from 'shared-worker-loader!./Worker';

const worker = new Worker();
console.log('worker instanciated as ', worker);
worker.port.start();
worker.port.postMessage({ a: 1 });
worker.port.onmessage = function (event) {console.log('worker event', event);};


ReactDOM.render(
        <Provider store={Store.getStore()}>
            <Screen>
                <App/>
            </Screen>
        </Provider>, document.getElementById('root'));
registerServiceWorker();
