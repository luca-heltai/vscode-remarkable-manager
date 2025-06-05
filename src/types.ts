import * as vscode from 'vscode';

export interface RemarkableDocument {
    uuid: string;
    visibleName: string;
    type: string;
    parent: string;
    deleted: boolean;
    lastModified: string;
    version: number;
    metadata: any;
}

export interface RemarkableFolder {
    uuid: string;
    name: string;
    parent: string;
    children: string[];
}

export class RemarkableFileItem extends vscode.TreeItem {
    public uuid?: string;
    public children?: RemarkableFileItem[];

    constructor(
        public readonly label: string,
        public readonly tooltip: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly contextValue: string
    ) {
        super(label, collapsibleState);
        this.tooltip = tooltip;
        this.contextValue = contextValue;

        // Set icons based on context
        switch (contextValue) {
            case 'folder':
                this.iconPath = new vscode.ThemeIcon('folder');
                break;
            case 'document':
                this.iconPath = new vscode.ThemeIcon('file-text');
                break;
            case 'template':
                this.iconPath = new vscode.ThemeIcon('file-media');
                break;
            case 'deleted':
                this.iconPath = new vscode.ThemeIcon('trash');
                break;
            case 'offline':
                this.iconPath = new vscode.ThemeIcon('debug-disconnect');
                break;
            case 'error':
                this.iconPath = new vscode.ThemeIcon('error');
                break;
            case 'info':
                this.iconPath = new vscode.ThemeIcon('info');
                break;
            default:
                this.iconPath = new vscode.ThemeIcon('file');
        }
    }
}
