import React, { Component, PureComponent} from 'react';
import "./TextEdit.css"

class FullScreenEdit extends PureComponent {
    // props: value, onDone

    constructor(props) {
        super(props);
        this.done = this.done.bind(this);
        this.close = this.close.bind(this);
    }

    stopEvent(e) {
        e.stopPropagation();
    }

    componentDidMount() {
        this.textArea.focus();
    }

    render() {
        return <div className="Dialog WithVirtualKeyboard" onClick={this.stopEvent}>
            <textarea ref={(input) => { this.textArea = input; }} >{this.props.value}</textarea>
            <br/>
            <input type="button" value="Ok" onClick={this.done}/>
            <input type="button" value="Cancel" onClick={this.close}/>
        </div>
    }

    done() {
        this.props.onDone(this.textArea.value);
    }

    close() {
        this.props.onDone(null);
    }

}

// Render text with edit possibility
// props: value
// props: onChange
class TextEdit extends PureComponent {
    constructor(props) {
        super(props);
        this.openEditor = this.openEditor.bind(this);
        this.updateValue = this.updateValue.bind(this);
        this.state = {editor: 0};
    }


    render() {
        var editor = null;
        if (this.state.editor != 0) {
            editor = <FullScreenEdit value={this.props.value} onDone={this.updateValue}/>;
        }
        return <span className="TextEdit" tabIndex={0} onClick={this.openEditor}>{this.props.value}{editor}</span>
    }

    openEditor() {
        this.setState({editor: 1});
    }

    updateValue(e) {
        var self = this;
        this.setState({editor: 0});
        if (e != null && this.props.onChange) {
            this.props.onChange(e);
        }
    }
}

export default TextEdit;