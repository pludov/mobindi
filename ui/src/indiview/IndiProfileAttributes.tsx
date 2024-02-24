/**
 * Created by ludovic on 21/07/17.
 */
import React, { } from 'react';
import { IndiProfileConfiguration, IndiProfilesConfiguration } from '@bo/BackOfficeStatus';
import * as Help from '../Help';
import TextEdit from '../TextEdit';

export type HandledProps = Omit<IndiProfileConfiguration, "uid" | "active" | "keys">;

type OnChangeCallbacks<API> = {
    [P in keyof API as P extends string ? `${P}Changed` : never]: (value: API[P])=>void;
}

type Props = HandledProps & OnChangeCallbacks<HandledProps>;


class IndiProfileAttributes extends React.PureComponent<Props> {
    private static nameHelp = Help.key("Name", "Give a name to the profile");

    constructor(props:Props) {
        super(props);
    }

    render() {
        return (
            <>
                Name: <TextEdit
                            helpKey={IndiProfileAttributes.nameHelp}
                            value={this.props.name} onChange={this.props.nameChanged}/>
            </>
        );
    }
};

export default IndiProfileAttributes;