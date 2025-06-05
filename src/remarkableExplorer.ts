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
        private connectionManager: RemarkableConnectionManager,
        private outputChannel: vscode.OutputChannel
    ) {
        this.outputChannel.appendLine('RemarkableExplorer constructor called');
        console.log('RemarkableExplorer constructor called');
        this.showRawFiles = vscode.workspace.getConfiguration('remarkableManager').get('view.showRawFiles', false);
        this.outputChannel.appendLine(`Initial connection state: ${this.isConnected}`);
        console.log(`Initial connection state: ${this.isConnected}`);
        
        // Listen to connection events
        this.connectionManager.on('connected', () => {
            this.outputChannel.appendLine('RemarkableExplorer: Connection established');
            console.log('RemarkableExplorer: Connection established');
            this.isConnected = true;
            this.refresh();
        });
        
        this.connectionManager.on('disconnected', () => {
            this.outputChannel.appendLine('RemarkableExplorer: Disconnected');
            console.log('RemarkableExplorer: Disconnected');
            this.isConnected = false;
            this.refresh();
        });
        
        this.connectionManager.on('error', (err: Error) => {
            this.outputChannel.appendLine(`RemarkableExplorer: Connection error: ${err.message}`);
            console.log('RemarkableExplorer: Connection error:', err.message);
            vscode.window.showErrorMessage(`Connection error: ${err.message}`);
        });
        
        this.outputChannel.appendLine('RemarkableExplorer constructor finished - event listeners registered');
    }

    getTreeItem(element: RemarkableFileItem): vscode.TreeItem {
        this.outputChannel.appendLine(`getTreeItem called for: ${element.label}`);
        console.log(`getTreeItem called for: ${element.label}`);
        return element;
    }

    async getChildren(element?: RemarkableFileItem): Promise<RemarkableFileItem[]> {
        this.outputChannel.appendLine(`getChildren called for: ${element ? element.label : 'ROOT'}`);
        console.log(`getChildren called for: ${element ? element.label : 'ROOT'}`);
        
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
            this.outputChannel.appendLine('Documents folder clicked - loading documents...');
            this.outputChannel.appendLine(`Connection state: ${this.isConnected}`);
            this.outputChannel.appendLine(`Connection manager connected: ${this.connectionManager.isConnected()}`);
            console.log('Documents folder clicked - loading documents...');
            vscode.window.showInformationMessage('Loading documents...');
            return this.getDocuments();
        }

        if (element.label === 'Templates') {
            return this.getTemplates();
        }

        if (element.label === 'Trash') {
            return this.getTrashDocuments();
        }

        // Handle expanding folders or documents with children
        if (element.uuid && element.children) {
            this.outputChannel.appendLine(`Expanding element: ${element.label} with ${element.children.length} children`);
            console.log(`Expanding element: ${element.label} with ${element.children.length} children`);
            return element.children;
        }

        // Handle expanding a folder by finding its children dynamically
        if (element.uuid && element.contextValue === 'folder') {
            this.outputChannel.appendLine(`=== EXPANDING FOLDER: ${element.label} (${element.uuid}) ===`);
            this.outputChannel.show(); // Make sure we see this
            vscode.window.showInformationMessage(`Expanding folder: ${element.label}`);
            
            // Find all documents that have this folder as parent
            const children: RemarkableFileItem[] = [];
            for (const [uuid, doc] of this.documents) {
                if (doc.parent === element.uuid && !doc.deleted) {
                    this.outputChannel.appendLine(`  Found child: ${doc.visibleName} (${doc.type})`);
                    const childItem = new RemarkableFileItem(
                        doc.visibleName,
                        doc.type,
                        doc.type === 'CollectionType' ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None,
                        doc.type === 'CollectionType' ? 'folder' : 'document'
                    );
                    childItem.uuid = uuid;
                    children.push(childItem);
                }
            }
            
            this.outputChannel.appendLine(`Returning ${children.length} children for folder ${element.label}`);
            vscode.window.showInformationMessage(`Found ${children.length} items in ${element.label}`);
            return children;
        }

        this.outputChannel.appendLine(`No children found for element: ${element.label}`);
        console.log(`No children found for element: ${element.label}`);
        return [];
    }

    private async getDocuments(): Promise<RemarkableFileItem[]> {
        this.outputChannel.appendLine('=== getDocuments() called ===');
        try {
            this.outputChannel.appendLine('Loading documents...');
            console.log('Loading documents...');
            await this.loadDocuments();
            this.outputChannel.appendLine(`Loaded ${this.documents.size} documents`);
            console.log(`Loaded ${this.documents.size} documents`);
            
            if (this.showRawFiles) {
                this.outputChannel.appendLine('Using raw files view');
                const rawFiles = this.getRawFileList();
                this.outputChannel.appendLine(`Returning ${rawFiles.length} raw files`);
                console.log(`Returning ${rawFiles.length} raw files`);
                return rawFiles;
            } else {
                this.outputChannel.appendLine('Using parsed documents view');
                const parsedDocs = this.getParsedDocuments();
                this.outputChannel.appendLine(`Returning ${parsedDocs.length} parsed documents`);
                console.log(`Returning ${parsedDocs.length} parsed documents`);
                return parsedDocs;
            }
        } catch (error) {
            this.outputChannel.appendLine(`Error loading documents: ${error}`);
            console.error('Error loading documents:', error);
            vscode.window.showErrorMessage(`Error loading documents: ${error}`);
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
            .filter(doc => doc.deleted || doc.parent === 'trash')
            .map(doc => new RemarkableFileItem(
                doc.visibleName,
                `Deleted ${doc.type}`,
                vscode.TreeItemCollapsibleState.None,
                'deleted'
            ));

        this.outputChannel.appendLine(`Found ${trashedDocs.length} items in trash`);
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
        
        console.log(`Loading documents from: ${documentsPath}`);
        const files = await this.connectionManager.listFiles(documentsPath);
        console.log(`Found ${files.length} files in documents directory`);
        
        const metadataFiles = files.filter((file: any) => file.filename.endsWith('.metadata'));
        console.log(`Found ${metadataFiles.length} metadata files`);
        
        this.documents.clear();
        
        for (const file of metadataFiles) {
            try {
                const uuid = file.filename.replace('.metadata', '');
                const metadataPath = `${documentsPath}/${file.filename}`;
                console.log(`Reading metadata for: ${uuid}`);
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
                
                console.log(`Loaded document: ${document.visibleName} (${document.type})`);
                this.documents.set(uuid, document);
            } catch (error) {
                console.error(`Error parsing metadata for ${file.filename}:`, error);
            }
        }
        
        console.log(`Total documents loaded: ${this.documents.size}`);
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
        this.outputChannel.appendLine('=== getParsedDocuments() called ===');
        this.outputChannel.show(); // Force the output channel to be visible
        
        const rootItems: RemarkableFileItem[] = [];
        const folders = new Map<string, RemarkableFileItem>();
        
        // Debug: Log all documents and their properties
        this.outputChannel.appendLine('All loaded documents:');
        let deletedCount = 0;
        let folderCount = 0;
        let docCount = 0;
        
        for (const [uuid, doc] of this.documents) {
            this.outputChannel.appendLine(`  ${doc.visibleName} - Type: ${doc.type}, Deleted: ${doc.deleted}, Parent: ${doc.parent || 'none'}`);
            if (doc.deleted) deletedCount++;
            if (doc.type === 'CollectionType') folderCount++;
            else docCount++;
        }
        
        this.outputChannel.appendLine(`Summary: ${folderCount} folders, ${docCount} documents, ${deletedCount} deleted`);
        vscode.window.showInformationMessage(`Documents: ${folderCount} folders, ${docCount} docs, ${deletedCount} deleted`);
        
        // First pass: create folders
        this.outputChannel.appendLine('Creating folders...');
        for (const [uuid, doc] of this.documents) {
            // Skip folders that are deleted or in trash
            if (doc.type === 'CollectionType' && !doc.deleted && doc.parent !== 'trash') {
                this.outputChannel.appendLine(`  Creating folder: ${doc.visibleName} (${uuid})`);
                const folderItem = new RemarkableFileItem(
                    doc.visibleName,
                    'Folder',
                    vscode.TreeItemCollapsibleState.Collapsed,
                    'folder'
                );
                folderItem.uuid = uuid;
                folders.set(uuid, folderItem);
            } else if (doc.type === 'CollectionType' && (doc.deleted || doc.parent === 'trash')) {
                this.outputChannel.appendLine(`  Skipping folder: ${doc.visibleName} (deleted: ${doc.deleted}, parent: ${doc.parent})`);
            }
        }
        
        // Second pass: create documents and organize hierarchy
        this.outputChannel.appendLine('Organizing documents...');
        for (const [uuid, doc] of this.documents) {
            // Skip deleted documents AND documents in trash
            if (doc.type !== 'CollectionType' && !doc.deleted && doc.parent !== 'trash') {
                this.outputChannel.appendLine(`  Processing document: ${doc.visibleName}, Parent: ${doc.parent || 'none'}`);
                const docItem = new RemarkableFileItem(
                    doc.visibleName,
                    doc.type,
                    vscode.TreeItemCollapsibleState.None,
                    'document'
                );
                docItem.uuid = uuid;
                
                if (doc.parent && folders.has(doc.parent)) {
                    // Add to parent folder
                    this.outputChannel.appendLine(`    Adding to parent folder (found folder)`);
                    const parentFolder = folders.get(doc.parent)!;
                    if (!parentFolder.children) {
                        parentFolder.children = [];
                    }
                    parentFolder.children.push(docItem);
                } else if (doc.parent && doc.parent !== '') {
                    // Parent exists but we don't have it as a folder - might be a nested folder
                    this.outputChannel.appendLine(`    Parent ${doc.parent} not found in folders - adding to root`);
                    rootItems.push(docItem);
                } else {
                    // Add to root
                    this.outputChannel.appendLine(`    Adding to root (no parent)`);
                    rootItems.push(docItem);
                }
            } else if (doc.deleted || doc.parent === 'trash') {
                this.outputChannel.appendLine(`  Skipping document: ${doc.visibleName} (deleted: ${doc.deleted}, parent: ${doc.parent})`);
            }
        }
        
        // Add folders to root if they have no parent or their parent doesn't exist
        this.outputChannel.appendLine('Adding folders to root...');
        for (const [uuid, folder] of folders) {
            const doc = this.documents.get(uuid)!;
            if (!doc.parent || !folders.has(doc.parent)) {
                this.outputChannel.appendLine(`  Adding folder to root: ${folder.label}`);
                rootItems.push(folder);
            }
        }
        
        this.outputChannel.appendLine(`Final result: ${rootItems.length} root items`);
        return rootItems;
    }

    public refresh(): void {
        this._onDidChangeTreeData.fire(undefined);
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
