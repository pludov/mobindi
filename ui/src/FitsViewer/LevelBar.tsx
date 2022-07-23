import React, { Component, PureComponent} from 'react';

export type Props = {
    onFinishMove: ()=>(void);
    onChange: (which:string, n:number)=>(void);
    property: string;
    value: number;
}

export default class LevelBar extends React.PureComponent<Props> {
    constructor(props:Props) {
        super(props);
    }
    
    private readonly sendUpdate=(v:React.ChangeEvent<HTMLInputElement>)=>{
        this.props.onChange(this.props.property, v.target.valueAsNumber);
    }
    
    private readonly finishMove=()=>{
        if (this.props.onFinishMove) {
            this.props.onFinishMove();
        }
    }

    render() {
        return (
            <div className='FitsSettingsOverlay'>
                <div className="ImageBarSetting">
                    <div className="ImageBarContainer">
                        <input type='range' min='0' max='1' step='any' value={this.props.value} onChange={this.sendUpdate} onMouseUp={this.finishMove}/>
                    </div>
                </div>
            </div>
        );
    }
/*
    top: 224.967px;
    position: absolute;
    width: 2em;
    border: 1px solid #606060;
    bottom: 0.2em;
    top: 0.2em;
    right: 0.2em;
    background: repeating-linear-gradient(-0deg, grey, transparent 0.5em, transparent 0.5em, grey 1em);
*/

}
