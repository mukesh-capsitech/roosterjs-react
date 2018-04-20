import * as React from 'react';
import { css, NullFunction } from 'roosterjs-react-common';
import { Editor, EditorOptions, EditorPlugin, UndoService } from 'roosterjs-editor-core';
import { ContentEdit, DefaultShortcut, HyperLink, Paste } from 'roosterjs-editor-plugins';
import { DefaultFormat } from 'roosterjs-editor-types';
import EditorViewState from '../schema/EditorViewState';

const ContentEditableDivStyle = { userSelect: "text", msUserSelect: "text", WebkitUserSelect: "text" } as React.CSSProperties;

export const enum LeanRoosterModes {
    View = 0,
    Edit = 1
}

export interface LeanRoosterProps {
    activateRoosterOnMount?: boolean;
    className?: string,
    contentDivRef?: (ref: HTMLDivElement) => void;
    defaultFormat?: DefaultFormat;
    disableRestoreSelectionOnFocus?: boolean;
    hyperlinkToolTipCallback?: (href: string) => string;
    isRtl?: boolean;
    onAfterModeChange?: (newMode: LeanRoosterModes) => void;
    onBeforeModeChange?: (newMode: LeanRoosterModes) => boolean;
    onBlur?: (ev: React.FocusEvent<HTMLDivElement>) => void;
    onFocus?: (ev: React.FocusEvent<HTMLDivElement>) => void;
    plugins?: EditorPlugin[],
    readonly?: boolean;
    undo?: UndoService;
    updateViewState?: (viewState: EditorViewState, content: string, isInitializing: boolean) => void;
    viewState: EditorViewState;
}

export default class LeanRooster extends React.PureComponent<LeanRoosterProps, {}> {
    private _contentDiv: HTMLDivElement;
    private _editor: Editor;
    private _mode: LeanRoosterModes = LeanRoosterModes.View;
    // Note: set react DIV up with an intial inner HTML, but don't change it afterwards otherwise
    // react will recreate the elements defined by the inner HTML
    private _initialContent: { __html: string } = undefined;

    constructor(props: LeanRoosterProps) {
        super(props);

        const { viewState } = this.props;
        const hasContent = viewState.content != null && viewState.content.length > 0;
        this._initialContent = hasContent ? { __html: viewState.content } : undefined;
    }

    public render(): JSX.Element {
        const { className, isRtl, readonly } = this.props;

        return <div
            className={css(
                "lean-rooster",
                className,
                this.mode === LeanRoosterModes.View ? "view-mode" : "edit-mode",
                readonly ? "readonly" : undefined)}
            contentEditable={!readonly}
            dir={isRtl ? "rtl" : "ltr"}
            onBlur={this._onBlur}
            onFocus={this._onFocus}
            onMouseDown={this._onMouseDown}
            onMouseUp={this._onMouseUp}
            ref={this._contentDivOnRef}
            style={ContentEditableDivStyle}
            suppressContentEditableWarning={true}
            tabIndex={0}
            dangerouslySetInnerHTML={this._initialContent} />;
    }

    public componentDidMount(): void {
        const { readonly, activateRoosterOnMount } = this.props;

        if (!readonly && activateRoosterOnMount) {
            this._trySwithToEditMode();
        }
    }

    public componentWillUnmount(): void {
        this.updateContentToViewState();
        if (this._editor) {
            this._editor.dispose();
            this._editor = null;
        }
    }

    public shouldComponentUpdate(): boolean {
        return false;
    }

    public updateContentToViewState(isInitializing?: boolean): void {
        if (this._editor) {
            const { updateViewState = this._updateViewState, viewState } = this.props;
            updateViewState(viewState, this._editor.getContent(), isInitializing);
        }
    }

    public get mode(): LeanRoosterModes {
        return this._mode;
    }

    public set mode(value: LeanRoosterModes) {
        if (value === LeanRoosterModes.Edit) {
            this._trySwithToEditMode();
        }
        else {
            this._trySwitchToViewMode();
        }
    }

    public focus(): void {
        if (this._editor) {
            this._editor.focus();
        }
    }

    private _getEditorOptions(): EditorOptions {
        const { plugins: additionalPlugins = [], undo, hyperlinkToolTipCallback, defaultFormat } = this.props;

        const plugins: EditorPlugin[] = [
            new ContentEdit(),
            new HyperLink(hyperlinkToolTipCallback),
            new Paste(true /*useDirectPaste*/),
            new DefaultShortcut(),
            ...additionalPlugins
        ];

        // Important: don't set the initial content, the content editable already starts with initial HTML content
        return { plugins, defaultFormat, undo, omitContentEditableAttributeChanges: true /* avoid unnecessary reflow */ };
    }

    private _updateViewState = (viewState: EditorViewState, content: string, isInitializing: boolean): void => {
        if (viewState.content !== content) {
            viewState.content = content;
            if (!isInitializing) {
                const originalContent = this._initialContent ? this._initialContent.__html : null;
                viewState.isDirty = content !== originalContent;
            }
        }
    }

    private _trySwithToEditMode(): boolean {
        const { readonly, onBeforeModeChange = NullFunction, onAfterModeChange = NullFunction } = this.props;

        if (this.mode === LeanRoosterModes.Edit || readonly) {
            return false;
        }
        if (onBeforeModeChange(LeanRoosterModes.Edit)) {
            return;
        }
        const isInitializing = !this._editor;
        if (isInitializing) {
            this._editor = new Editor(this._contentDiv, this._getEditorOptions());
        }
        this._mode = LeanRoosterModes.Edit;

        this.updateContentToViewState(isInitializing);
        this.forceUpdate();
        onAfterModeChange(LeanRoosterModes.Edit);

        return true;
    }

    private _trySwitchToViewMode(): boolean {
        const { onBeforeModeChange = NullFunction, onAfterModeChange = NullFunction } = this.props;

        if (this.mode === LeanRoosterModes.View) {
            return false;
        }
        if (onBeforeModeChange(LeanRoosterModes.View)) {
            return false;
        }

        this.updateContentToViewState();
        this._mode = LeanRoosterModes.View;
        this.forceUpdate();
        onAfterModeChange(LeanRoosterModes.View);

        return true;
    }

    private _onMouseDown = (ev: React.MouseEvent<HTMLDivElement>): void => {
        this._trySwithToEditMode();
    };

    private _onMouseUp = (ev: React.MouseEvent<HTMLDivElement>): void => {
        if (this._editor && !this._editor.hasFocus()) {
            this._editor.focus();
        }
    };

    private _onBlur = (ev: React.FocusEvent<HTMLDivElement>): void => {
        const { onBlur = NullFunction } = this.props;

        this.updateContentToViewState();
        onBlur(ev);
    };

    private _onFocus = (ev: React.FocusEvent<HTMLDivElement>): void => {
        const { onFocus = NullFunction } = this.props;

        if (this._trySwithToEditMode()) {
            this._editor.focus();
        }
        onFocus(ev);
    };

    private _contentDivOnRef = (ref: HTMLDivElement): void => {
        const { contentDivRef = NullFunction } = this.props;

        this._contentDiv = ref;
        contentDivRef(ref);
    };
}
