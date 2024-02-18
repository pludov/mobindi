import * as React from 'react';
import * as Help from "./Help"
import "./TextEdit.css"


type Props = {
    value: string;
    busy?: boolean;
    onChange: (s:string)=>(void);
    focusRef?: React.RefObject<HTMLDivElement>;
    helpKey?: Help.Key;
}

type State = {
    editor: number;
    editorValue: string;
}
// Render text with edit possibility
// props: value
// props: onChange
export default class TextEdit extends React.PureComponent<Props, State> {
    // props: value, onDone
    readonly textArea = React.createRef<HTMLInputElement>();
    readonly okButton = React.createRef<HTMLInputElement>();
    readonly cancelButton = React.createRef<HTMLInputElement>();

    constructor(props:Props) {
        super(props);
        this.state = {editor: 0, editorValue: ""};
    }

    render() {
        const lines = this.props.value.split(/\r\n|\r|\n/);
        const rows = lines.length;
        const cols = lines.map(v=>Math.min(Math.max(v.length+3, 5), 16)).reduce((a,b)=>Math.max(a,b), 0);

        return <span >
                <input type="text" ref={this.textArea}
                            style={{clear: this.state.editor === 0 ? "none" : "right"}}
                            onFocus={this.openEditor}
                            onBlur={this.blur}
                            size={cols}
                            value={this.state.editor === 0
                                    ? this.props.value
                                    : this.state.editorValue}
                            onChange={(e)=>this.setState({editorValue: e.target.value})}
                            />
                {/* <textarea ref={this.textArea}
                            style={{clear: this.state.editor === 0 ? "none" : "right"}}
                            onFocus={this.openEditor}
                            onBlur={this.blur}
                            rows={rows}
                            cols={cols}
                            wrap='off'
                            value={this.state.editor === 0
                                    ? this.props.value
                                    : this.state.editorValue}
                            onChange={(e)=>this.setState({editorValue: e.target.value})}
                            /> */}
                {this.state.editor !== 0 ?
                    <div style={{float: "right"}}>
                        <input
                            type="button"
                            value="Ok"
                            ref={this.okButton}
                            onBlur={this.blur}
                            onClick={this.updateValue}/>
                        <input
                            type="button"
                            value="Cancel"
                            ref={this.cancelButton}
                            onBlur={this.blur}
                            onClick={()=>this.setState({editor: 0})}/>
                    </div>
                    : null
                }

            </span>
    }

    blur=(e:React.FocusEvent<Element>)=>{
        const target = e.relatedTarget;
        const ours = [this.okButton, this.cancelButton, this.textArea].map(e=>e.current as Element);
        if (ours.includes(target as Element)) {
            return;
        }
        console.log('Blur', target, ours);
        if (this.state.editor !== 0) {
            this.updateValue();
        } else {
            this.setState({editor: 0});
        }
    }

    done=()=>{
        this.setState({editor: 0});
    }

    openEditor=()=>{
        this.setState({editor: 1, editorValue: this.props.value});
    }

    updateValue=()=>{
        if (this.textArea.current) {
            const v = this.textArea.current.value;
            this.setState({editor: 0});
            this.props.onChange(v);
        } else {
            this.setState({editor: 0});
        }
    }
}
