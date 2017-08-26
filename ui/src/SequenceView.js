import React, { Component, PureComponent} from 'react';
import PropTypes from 'prop-types';
import { notifier, BackendStatus } from './Store';
import { connect } from 'react-redux';

import { atPath } from './shared/JsonPath';


class ImageListEntry extends PureComponent {

    render() {
        return <div>{this.props.item.path}</div>;
    }
    static mapStateToProps = function(store, ownProps) {
        return({
            item: atPath(store, ownProps.uidListPath).byuuid[ownProps.imageUid]
        })
    }
}

ImageListEntry = connect(ImageListEntry.mapStateToProps)(ImageListEntry);
ImageListEntry.propTypes = {
    // Path to image details
    uidListPath: PropTypes.string.isRequired,
    imageUid: PropTypes.string.isRequired
}

class ImageList extends PureComponent {

    render() {
        var content = [];
        for(var o of this.props.items)
        {
            content.push(<ImageListEntry key={o} uidListPath={this.props.uidListPath} imageUid={o}/>);
        }
        return <div>{content}</div>;
    }

    static mapStateToProps = function(store, ownProps) {
        return({
            // FIXME: filter, cache
            items: atPath(store, ownProps.uidListPath).list
        })
    }
}

ImageList = connect(ImageList.mapStateToProps)(ImageList);
ImageList.propTypes = {
    // Path to image details
    uidListPath: PropTypes.string.isRequired
}

class SequenceView extends PureComponent {
    constructor(props) {
        super(props);
    }
    render() {
        //var self = this;
        return(<div className="CameraView">
            <ImageList uidListPath="$.backend.camera.images"/>
        </div>);
    }
}


export default SequenceView;