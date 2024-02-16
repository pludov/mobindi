import React, { Component, PureComponent} from 'react';

import './FitsViewerWithAstrometry.css';
import * as Help from "./Help";
import "./FitsViewerFineSlewUI.css";


type Props = {};


class CertLink extends React.PureComponent<Props> {
    private static certLinkHelp = Help.key("Download device certificate", "Install this certificate so that your browser/mobile phone trusts the device. This is required for advanced features (position sharing, notifications, ...)");

    constructor(props:Props) {
        super(props);
    }

    render() {
        return <a href="/cacerts" download {...CertLink.certLinkHelp.dom()}>{CertLink.certLinkHelp.title}</a>
    }
};

export default CertLink;
