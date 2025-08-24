/**
 * Created by ludovic on 21/07/17.
 */
import React, { } from 'react';
import { IndiProfileConfiguration, IndiProfilesConfiguration } from '@bo/BackOfficeStatus';
import * as Help from '../Help';
import TextEdit from '../TextEdit';
import { getProfileList } from '../IndiProfileStore';
import './IndiProfileAttributes.css';

type StandardProps = Omit<IndiProfileConfiguration, "uid" | "active" | "keys" | "exclusionGroup">;

export type HandledProps = StandardProps & {
    exclusionGroupPeers: Array<string>
};

type OnChangeCallbacks<API> = {
    [P in keyof API as P extends string ? `${P}Changed` : never]: (value: API[P])=>void;
}

type Props = HandledProps & OnChangeCallbacks<StandardProps> & {
    exclusionGroupPotentials: ReturnType<ReturnType<typeof getProfileList>>;
    exclusionGroupChanged: (uids:Array<string>)=> void;
};


type State = {
    exclusionGroupForceOpen: boolean;
}

class IndiProfileAttributes extends React.PureComponent<Props, State> {
    private static nameHelp = Help.key("Name", "Give a name to the profile");
    private static exclusionGroupCheckboxHelp = Help.key("Exclusion group", "This will ensure only one of this and the other selected profiles can be active. Use this for example to switch between two optical tubes, with one profile for each");

    constructor(props:Props) {
        super(props);
        this.state = {
            exclusionGroupForceOpen: false
        }
    }

    switchExclusionGroupCheckbox=() => {
        if (this.state.exclusionGroupForceOpen) {
            this.setState({exclusionGroupForceOpen: false});
            this.props.exclusionGroupChanged([]);
        } else {
            this.setState({exclusionGroupForceOpen: true});
        }
    }

    switchExclusionGroupPeer=(uid: string) => {
        let newPeers = [...this.props.exclusionGroupPeers];
        const pos = newPeers.indexOf(uid);
        if (pos === -1) {
            newPeers.push(uid);
        } else {
            newPeers.splice(pos, 1);
            this.setState({exclusionGroupForceOpen: true});
        }
        this.props.exclusionGroupChanged(newPeers);
    }

    render() {
        console.log('this.exclusionGroupPeers=', this.props.exclusionGroupPeers);
        return (
            <>
                <div>
                Name: <TextEdit
                            helpKey={IndiProfileAttributes.nameHelp}
                            value={this.props.name} onChange={this.props.nameChanged}/>
                </div>
                { this.props.exclusionGroupPotentials.length > 0 ?
                    <div>
                        Exclusion group:
                                <input
                                    type="checkbox"
                                    checked={
                                        this.state.exclusionGroupForceOpen
                                        ||
                                        this.props.exclusionGroupPeers.length > 0}
                                    onChange={this.switchExclusionGroupCheckbox}
                                    {...IndiProfileAttributes.exclusionGroupCheckboxHelp.dom()}
                                >
                                </input>

                                {(this.state.exclusionGroupForceOpen ||
                                        this.props.exclusionGroupPeers.length > 0) ?
                                    <div className="exclusionGroupContent">
                                        {
                                            this.props.exclusionGroupPotentials.map((item) =>
                                                <div key={item.uid}>
                                                    <input
                                                        type="checkbox"
                                                        checked={this.props.exclusionGroupPeers.indexOf(item.uid) !== -1}
                                                        onChange={() => this.switchExclusionGroupPeer(item.uid)}
                                                    >
                                                    </input>
                                                    {item.title}
                                                </div>
                                            )
                                        }
                                    </div>
                                    : null
                                }

                    </div>
                    :
                    null
                }
            </>
        );
    }
};

export default IndiProfileAttributes;