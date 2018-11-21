import React, { Component, PureComponent} from 'react';
import { Connect } from './utils/Connect';

import * as BackOfficeStatus from '../../shared/BackOfficeStatus';

import './AstrometryImageInfo.css'


type InputProps = {
    app: any;
    src:string;
};

type MappedProps = BackOfficeStatus.AstrometryStatus & {
    
};

type Props = InputProps & MappedProps;

class AstrometryImageInfo extends React.PureComponent<Props> {
    constructor(props:Props) {
        super(props);
        
    }

    render() {
        // When astrometry is running, we can do:
        //   cancel
        // When astrometry is done, we can do:
        //   sync
        return <span className="AstrometryImageInfoRoot">
            {this.props.status === "computing"
                ? <span>Astrometry running<input type='button' value='Cancel' onClick={this.cancel}/></span>
                :
                    this.props.image !== null && this.props.image === this.props.src
                    ? this.props.status
                    : null
            }
        </span>;
    }

    private readonly cancel = ()=> {
        this.props.app.appServerRequest('astrometry', {
            method: 'cancel'
        }).start();
    }

    static mapStateToProps(store:any, ownProps: InputProps):MappedProps {
        const astrometry: BackOfficeStatus.AstrometryStatus = store.backend.astrometry;

        return astrometry;
    }
};

export default Connect<AstrometryImageInfo, InputProps, {}, MappedProps>(AstrometryImageInfo);
