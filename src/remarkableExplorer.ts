import * as vscode from 'vscode';
import { RemarkableConnectionManager } from './connectionManager';
import { RemarkableDocument, RemarkableFolder, RemarkableFileItem } from './types';

export class RemarkableExplorer implements vscode.TreeDataProvider<RemarkableFileItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<RemarkableFileItem | undefined | null | void> = new vscode.EventEmitter<RemarkableFileItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<RemarkableFileItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private documents: Map<string, RemarkableDocument> = new Map();
    private showRawFiles: boolean = false;
    private isConnected: boolean = false;

    constructor(
        private context: vscode.ExtensionContext,
        private connectionManager: RemarkableConnectionManager
    ) {
        this.showRawFiles = vscode.workspace.getConfiguration('remarkableManager').get('view.showRawFiles', false);
        
        // Listen to connection events
        this.connectionManager.on('connected', () => {
            this.isConnected = true;
            this.refresh();
        });
        
        this.connectionManager.on('disconnected', () => {
            this.isConnected = false;
            this.refresh();
        });
        
        this.connectionManager.on('error', (err: Error) => {
            vscode.window.showErrorMessage(`Connection error: ${err.message}`);
        });
    }

    getTreeItem(element: RemarkableFileItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: RemarkableFileItem): Promise<RemarkableFileItem[]> {
        if (!this.isConnected) {
            return [new RemarkableFileItem(
                'Not connected',
                'Click the connect button to connect to your reMarkable device',
                vscode.TreeItemCollapsibleState.None,
                'offline'
            )];
        }

        if (!element) {
            // Root level - show main sections
            return [
                new RemarkableFileItem(
                    'Documents',
                    'All documents',
                    vscode.TreeItemCollapsibleState.Expanded,
                    'folder'
                ),
                new RemarkableFileItem(
                    'Templates',
                    'Document templates',
                    vscode.TreeItemCollapsibleState.Collapsed,
                    'folder'
                ),
                new RemarkableFileItem(
                    'Trash',
                    'Deleted documents',
                    vscode.TreeItemCollapsibleState.Collapsed,
                    'folder'
                )
            ];
        }

        if (element.label === 'Documents') {
            return this.getDocuments();
        }

        if (element.label === 'Templates') {
            return this.getTemplates();
        }

        if (element.label === 'Trash') {
            return this.getTrashDocuments();
        }

        return [];
    }

    private async getDocuments(): Promise<RemarkableFileItem[]> {
        try {
            await this.loadDocuments();
            
            if (this.showRawFiles) {
                return this.getRawFileList();
            } else {
                return this.getParsedDocuments();
            }
        } catch (error) {
            console.error('Error loading documents:', error);
            return [new RemarkableFileItem(
                'Error loading documents',
                `${error}`,
                vscode.TreeItemCollapsibleState.None,
                'error'
            )];
        }
    }

    private async getTemplates(): Promise<RemarkableFileItem[]> {
        try {
            const config = vscode.workspace.getConfiguration('remarkableManager');
            const templatesPath = config.get('paths.templates', '.local/share/remarkable/templates');
            
            const files = await this.connectionManager.listFiles(templatesPath);
            
            return files
                .filter(file => file.filename.endsWith('.png') || file.filename.endsWith('.svg'))
                .map(file => new RemarkableFileItem(
                    file.filename,
                    'Template',
                    vscode.TreeItemCollapsibleState.None,
                    'template'
                ));
        } catch (error) {
            console.error('Error loading templates:', error);
            return [new RemarkableFileItem(
                'Error loading templates',
                `${error}`,
                vscode.TreeItemCollapsibleState.None,
                'error'
            )];
        }
    }

    private async getTrashDocuments(): Promise<RemarkableFileItem[]> {
        const trashedDocs = Array.from(this.documents.values())
            .filter(doc => doc.deleted)
            .map(doc => new RemarkableFileItem(
                doc.visibleName,
                `Deleted ${doc.type}`,
                vscode.TreeItemCollapsibleState.None,
                'deleted'
            ));

        return trashedDocs.length > 0 ? trashedDocs : [
            new RemarkableFileItem(
                'No deleted documents',
                '',
                vscode.TreeItemCollapsibleState.None,
                'info'
            )
        ];
    }

    private async loadDocuments(): Promise<void> {
        const config = vscode.workspace.getConfiguration('remarkableManager');
        const documentsPath = config.get('paths.documents', '.local/share/remarkable/xochitl');
        
        const files = await this.connectionManager.listFiles(documentsPath);
        const metadataFiles = files.filter(file => file.filename.endsWith('.metadata'));
        
        this.documents.clear();
        
        for (const file of metadataFiles) {
            try {
                const uuid = file.filename.replace('.metadata', '');
                const metadataPath = `${documentsPath}/${file.filename}`;
                const metadataContent = await this.connectionManager.readFile(metadataPath);
                const metadata = JSON.parse(metadataContent);
                
                const document: RemarkableDocument = {
                    uuid,
                    visibleName: metadata.visibleName || uuid,
                    type: metadata.type || 'DocumentType',
                    parent: metadata.parent || '',
                    deleted: metadata.deleted || false,
                    lastModified: metadata.lastModified || '',
                    version: metadata.version || 0,
                    metadata
                };
                
                this.documents.set(uuid, document);
            } catch (error) {
                console.error(`Error parsing metadata for ${file.filename}:`, error);
            }
        }
    }

    private getRawFileList(): RemarkableFileItem[] {
        const items: RemarkableFileItem[] = [];
        
        for (const [uuid, doc] of this.documents) {
            items.push(new RemarkableFileItem(
                uuid,
                `${doc.type} - ${doc.visibleName}`,
                vscode.TreeItemCollapsibleState.None,
                'document'
            ));
        }
        
        return items;
    }

    private getParsedDocuments(): RemarkableFileItem[] {
        const rootItems: RemarkableFileItem[] = [];
        const folders = new Map<string, RemarkableFileItem>();
        
        // First pass: create folders
        for (const [uuid, doc] of this.documents) {
            if (doc.type === 'CollectionType' && !doc.deleted) {
                const folderItem = new RemarkableFileItem(
                    doc.visibleName,
                    'Folder',
                    vscode.TreeItemCollapsibleState.Collapsed,
                    'folder'
                );
                folderItem.uuid = uuid;
                folders.set(uuid, folderItem);
            }
        }
        
        // Second pass: create documents and organize hierarchy
        for (const [uuid, doc] of this.documents) {
            if (doc.type !== 'CollectionType' && !doc.deleted) {
                const docItem = new RemarkableFileItem(
                    doc.visibleName,
                    doc.type,
                    vscode.TreeItemCollapsibleState.None,
                    'document'
                );
                docItem.uuid = uuid;
                
                if (doc.parent && folders.has(doc.parent)) {
                    // Add to parent folder
                    const parentFolder = folders.get(doc.parent)!;
                    if (!parentFolder.children) {
                        parentFolder.children = [];
                    }
                    parentFolder.children.push(docItem);
                } else {
                    // Add to root
                    rootItems.push(docItem);
                }
            }
        }
        
        // Add folders to root if they have no parent or their parent doesn't exist
        for (const [uuid, folder] of folders) {
            const doc = this.documents.get(uuid)!;
            if (!doc.parent || !folders.has(doc.parent)) {
                rootItems.push(folder);
            }
        }
        
        return rootItems;
    }

    public refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    public async connect(): Promise<void> {
        try {
            await this.connectionManager.connect();
            vscode.window.showInformationMessage('Connected to reMarkable device');
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to connect: ${error}`);
        }
    }

    public disconnect(): void {
        this.connectionManager.disconnect();
        vscode.window.showInformationMessage('Disconnected from reMarkable device');
    }

    public toggleView(): void {
        this.showRawFiles = !this.showRawFiles;
        const config = vscode.workspace.getConfiguration('remarkableManager');
        config.update('view.showRawFiles', this.showRawFiles, vscode.ConfigurationTarget.Global);
        this.refresh();
        
        const viewType = this.showRawFiles ? 'raw GUID-based' : 'parsed';
        vscode.window.showInformationMessage(`Switched to ${viewType} view`);
    }

    public async backup(item: RemarkableFileItem): Promise<void> {
        if (!item.uuid) {
            vscode.window.showErrorMessage('Cannot backup this item');
            return;
        }

        const config = vscode.workspace.getConfiguration('remarkableManager');
        let backupPath = config.get('backup.localPath', '');
        
        if (!backupPath) {
            const selected = await vscode.window.showOpenDialog({
                canSelectFiles: false,
                canSelectFolders: true,
                canSelectMany: false,
                openLabel: 'Select Backup Directory'
            });
            
            if (!selected || selected.length === 0) {
                return;
            }
            
            backupPath = selected[0].fsPath;
        }

        try {
            await this.backupDocument(item.uuid, backupPath);
            vscode.window.showInformationMessage(`Backed up ${item.label} to ${backupPath}`);
        } catch (error) {
            vscode.window.showErrorMessage(`Backup failed: ${error}`);
        }
    }

    private async backupDocument(uuid: string, localPath: string): Promise<void> {
        const config = vscode.workspace.getConfiguration('remarkableManager');
        const documentsPath = config.get('paths.documents', '.local/share/remarkable/xochitl');
        
        const extensions = ['', '.content', '.metadata', '.thumbnails', '.epub', '.pdf', '.pagedata', '.local'];
        
        for (const ext of extensions) {
            const remoteFile = `${documentsPath}/${uuid}${ext}`;
            const localFile = `${localPath}/${uuid}${ext}`;
            
            try {
                await this.connectionManager.downloadFile(remoteFile, localFile);
            } catch (error) {
                // Some files might not exist, which is normal
                console.log(`File ${remoteFile} not found, skipping`);
            }
        }
    }

    public async rename(item: RemarkableFileItem): Promise<void> {
        if (!item.uuid) {
            vscode.window.showErrorMessage('Cannot rename this item');
            return;
        }

        const newName = await vscode.window.showInputBox({
            prompt: 'Enter new name',
            value: item.label as string
        });

        if (!newName) {
            return;
        }

        try {
            await this.renameDocument(item.uuid, newName);
            vscode.window.showInformationMessage(`Renamed to ${newName}`);
            this.refresh();
        } catch (error) {
            vscode.window.showErrorMessage(`Rename failed: ${error}`);
        }
    }

    private async renameDocument(uuid: string, newName: string): Promise<void> {
        const doc = this.documents.get(uuid);
        if (!doc) {
            throw new Error('Document not found');
        }

        const config = vscode.workspace.getConfiguration('remarkableManager');
        const documentsPath = config.get('paths.documents', '.local/share/remarkable/xochitl');
        const metadataPath = `${documentsPath}/${uuid}.metadata`;

        // Update metadata
        doc.metadata.visibleName = newName;
        const updatedMetadata = JSON.stringify(doc.metadata, null, 2);

        // Write back to device (this would need a proper SFTP write implementation)
        throw new Error('Rename functionality not yet implemented - requires SFTP write capabilities');
    }

    public async export(item: RemarkableFileItem): Promise<void> {
        vscode.window.showInformationMessage(`Export functionality for ${item.label} coming soon!`);
    }
}
