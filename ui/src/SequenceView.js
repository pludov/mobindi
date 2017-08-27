import React, { Component, PureComponent} from 'react';
import PropTypes from 'prop-types';
import { notifier, BackendStatus } from './Store';
import { connect } from 'react-redux';

import Table from './Table';
import { atPath } from './shared/JsonPath';
import FitsViewer from './FitsViewer';
import './SequenceView.css';

class SequenceImageDetail extends PureComponent {

    render() {
        return <div className="AspectRatio43ContainerOut">
            <div className="AspectRatio43ContainerIn">
                <div className="AspectRatio43 FitsViewer FitsViewContainer">
                    <FitsViewer src={this.props.url === null ? '#blank' : 'fitsviewer/fitsviewer.cgi?path=' + encodeURIComponent(this.props.url)}/>
                </div>
            </div>
        </div>;
    }

    static mapStateToProps(store, ownProps) {
        var selected = atPath(store, ownProps.currentPath);

        if (!selected) {
            return {
                url: null
            };
        }
        var details = atPath(store, ownProps.detailPath + '[' + JSON.stringify(selected) + ']');
        if (details === undefined) {
            return {url: null};
        }
        return {
            url: details.path
        };
    }
}

SequenceImageDetail = connect(SequenceImageDetail.mapStateToProps)(SequenceImageDetail);

SequenceImageDetail.propTypes = {
    currentPath: PropTypes.string.isRequired
}

class SequenceView extends PureComponent {
    constructor(props) {
        super(props);
    }
    render() {
        //var self = this;
        return(<div className="CameraView">
            <SequenceImageDetail
                currentPath='$.sequence.currentImage'
                detailPath='$.backend.camera.images.byuuid'
            />
            <Table statePath="$.sequenceView.list"
                fields={{
                    path: {
                        title:  'File',
                        defaultWidth: '15em',
                        render: (o)=>(o.path.indexOf('/') != -1 ? o.path.substring(o.path.lastIndexOf('/')+1) : o.path)
                    },
                    device: {
                        title:  'Device',
                        defaultWidth: '12em'
                    }
                }}
                defaultHeader={[{id: 'path'}, {id: 'device'}]}
                getItemList={(store)=>(atPath(store, '$.backend.camera.images.list'))}
                getItem={(store,uid)=>(atPath(store, '$.backend.camera.images.byuuid')[uid])}
                currentPath='$.sequence.currentImage'
                onItemClick={(uid)=>this.props.app.dispatchAction('setCurrentImage', uid)}
            />
        </div>);
    }
}


export default SequenceView;