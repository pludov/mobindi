import { connect } from 'react-redux';
import React, { PureComponent} from 'react';

import * as Store from './Store';
import PromiseSelector from './PromiseSelector';
import { AstrometryStatus } from '@bo/BackOfficeStatus';
import SkyProjection from './SkyAlgorithms/SkyProjection';

type InputProps = {
    close: ()=>(void);
}

type MappedProps = Partial<AstrometryStatus>;

type Props = InputProps & MappedProps;

class AstrometryStatusView extends PureComponent<Props> {
    constructor(props:Props) {
        super(props);
    }


    public render() {

        const skyProjection = (this.props.result && this.props.result.found)
                    ? SkyProjection.fromAstrometry(this.props.result)
                    : null;

        const fieldSize = this.props.result?.found
                    ? skyProjection?.getFieldSize(this.props.result.width, this.props.result.height)
                    : null;

        const centerRaDec = this.props.result?.found
                    ? skyProjection?.pixToRaDec([this.props.result.width/2, this.props.result.height/2])
                    : null;

        return (
        <div className="AstrometryWizardRootView">
            <div className="AstrometryWizardContent">
                <div className="AstrometryWizardSelectTitle">Last Astrometry Job</div>

                <div>
                    <div>Scope: {this.props.selectedScope || "N/A"}</div>
                    <div>Image: {this.props.image || ""}</div>
                    <div>Status: {this.props.status}</div>
                    {this.props.lastOperationError
                        ? <div>Error: {this.props.lastOperationError}</div>
                        : null
                    }
                    {this.props.result
                        ?
                        <div>Solved: {"" + !!this.props.result.found}</div>
                        : null
                    }
                    {centerRaDec
                        ?
                            <>
                                <div>RA: {SkyProjection.raToString(centerRaDec[0])}</div>
                                <div>DEC: {SkyProjection.decToString(centerRaDec[1])}</div>
                            </>
                        : null
                    }
                    {this.props.result && this.props.result.found
                        ?
                        <>

                            <div>Field size: {fieldSize?.toFixed(2)}°</div>
                            <div>Image Size: {this.props.result.width} x {this.props.result.height}</div>
                        </>
                        : null
                    }

                </div>
            </div>
            <div className="AstrometryWizardControls">
                <input type="button" value="Done" onClick={this.props.close}
                       className="WizardRightButton"
                    />
            </div>

        </div>);
    }

    static mapStateToProps = (store: Store.Content, props: InputProps):MappedProps=> {
        return { ...store.backend?.astrometry };
    }
}

export default Store.Connect(AstrometryStatusView);