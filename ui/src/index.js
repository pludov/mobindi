import React from 'react';
import ReactDOM from 'react-dom';
import { connect } from 'react-redux';
import { Provider } from 'react-redux'
import './index.css';
import Screen from './Screen';
import App from './App';
import Phd from './Phd';
import registerServiceWorker from './registerServiceWorker';
import { store } from './Store';


ReactDOM.render(
        <Provider store={store}>
            <Screen>
                <App/>
            </Screen>
        </Provider>, document.getElementById('root'));
registerServiceWorker();
