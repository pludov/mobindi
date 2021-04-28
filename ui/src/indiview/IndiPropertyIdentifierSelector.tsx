import React from 'react';
import Log from '../shared/Log';
import * as Help from "../Help";
import * as Store from "../Store";
import Modal from '../Modal';

import "./IndiManagerView.css";
import { IndiPropertyIdentifier } from '@bo/BackOfficeStatus';
import IndiPropertyIdentifierList from './IndiPropertyIdentifierList';

const logger = Log.logger(__filename);

type InputProps = {
    accessor: Store.Accessor<IndiPropertyIdentifier|null>;
    helpKey: Help.Key,
}

type MappedProps = {
    current: IndiPropertyIdentifier|null;
}

type Props = InputProps & MappedProps;


class IndiPropertyIdentifierSelector extends React.PureComponent<Props> {
    private modal = React.createRef<Modal>();

    changeProperty = async (e:React.ChangeEvent<HTMLSelectElement>)=> {
        const newId = e.target.value;

        if (newId === "true") {
            return;
        }
        if (newId === "false") {
            try {
                await this.props.accessor.send(null);
            } catch(e) {
                logger.warn("Unable to set acessor", e);
            }
            return;
        }
        this.modal.current!.open();
    }

    closeModal = ()=>{
        this.modal.current!.close();
    }

    public render() {
        return (<>
            <select value={this.props.current ? "true" : "false"}
                onChange={this.changeProperty}
                placeholder="Select property..."
                {...this.props.helpKey.dom()}>

                <option value="false">None</option>
                {this.props.current
                    ? <option value="true">{this.props.current!.device}/{this.props.current!.vector}/{this.props.current!.property}</option>
                    : null
                }
                <option value="...">Choose...</option>
            </select>
            <Modal ref={this.modal}>
                <div {...this.props.helpKey.dom()}>{this.props.helpKey.title}</div>
                <IndiPropertyIdentifierList accessor={this.props.accessor} onDone={this.closeModal}/>
            </Modal>
        </>);
    }

    static mapStateToProps(store:Store.Content, ownProps: InputProps):MappedProps {
        const current = ownProps.accessor.fromStore(store);
        return {
            current
        }
    }
}


export default Store.Connect(IndiPropertyIdentifierSelector);
