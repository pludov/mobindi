import React from 'react';
import ReactDOM from 'react-dom';
import { connect, Provider } from 'react-redux';
import './index.css';
import Screen from './Screen';
import App from './App';
import Phd from './PhdView';
import registerServiceWorker from './registerServiceWorker';
import * as Store from './Store';

import Worker from 'shared-worker-loader!./BackgroundWorker/Worker';

try {
    const worker = new Worker("background");
    console.log('new new worker instanciated as ', worker);
    worker.port.start();
    worker.port.postMessage({ a: 1 });
    worker.port.onmessage = function (event) {console.log('worker event', event);};

    console.log('Notification permission is ', Notification.permission);
    if (Notification.permission !== "granted") {
        worker.port.postMessage({notificationAllowed: false});
        Notification.requestPermission(function (permission) {
            console.log('Notification permission is ', Notification.permission, permission);
            // If the user accepts, let's create a notification
            worker.port.postMessage({notificationAllowed: permission === "granted"});
          });
    } else {
        worker.port.postMessage({notificationAllowed: true});
    }

} catch(e) {
    console.warn("could not setup notification", e);
}



ReactDOM.render(
        <Provider store={Store.getStore()}>
            <Screen>
                <App/>
            </Screen>
        </Provider>, document.getElementById('root'));
registerServiceWorker();
