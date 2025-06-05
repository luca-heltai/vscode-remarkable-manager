import * as vscode from 'vscode';
import { RemarkableConnectionManager } from './connectionManager';
import { RemarkableDocument, RemarkableFolder, RemarkableFileItem } from './types';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { spawn } from 'child_process';

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
        
        // For documents that can be previewed, set up auto-preview on click if enabled
        const config = vscode.workspace.getConfiguration('remarkableManager');
        const autoPreview = config.get('preview.autoPreview', true);
        
        if (element.contextValue === 'document' && element.uuid && autoPreview) {
            element.command = {
                command: 'remarkableExplorer.preview',
                title: 'Preview',
                arguments: [element]
            };
        }
        
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

    public async preview(item: RemarkableFileItem): Promise<void> {
        if (!item.uuid) {
            vscode.window.showErrorMessage('Cannot preview this item');
            return;
        }

        try {
            this.outputChannel.appendLine(`=== PREVIEW: ${item.label} (${item.uuid}) ===`);
            
            const config = vscode.workspace.getConfiguration('remarkableManager');
            const useVSCodePreview = config.get('preview.useVSCodePreview', true);
            const documentsPath = config.get('paths.documents', '.local/share/remarkable/xochitl');
            
            // Create a temporary directory for downloaded files
            const tempDir = path.join(os.tmpdir(), 'remarkable-preview');
            if (!fs.existsSync(tempDir)) {
                fs.mkdirSync(tempDir, { recursive: true });
            }

            // Check what files exist for this document
            const files = await this.connectionManager.listFiles(documentsPath);
            const documentFiles = files.filter((file: any) => file.filename.startsWith(item.uuid!));
            
            this.outputChannel.appendLine(`Found ${documentFiles.length} files for document ${item.label}`);
            this.outputChannel.appendLine(`All files for document ${item.uuid}:`);
            documentFiles.forEach((file: any, index: number) => {
                this.outputChannel.appendLine(`  ${index + 1}: ${file.filename} (${file.size || 'unknown'} bytes)`);
            });

            // Check if there's a directory with the document UUID that contains .rm files
            const documentDir = documentFiles.find((file: any) => file.filename === item.uuid);
            let rmFiles: any[] = [];
            
            if (documentDir) {
                this.outputChannel.appendLine(`Found document directory: ${item.uuid}, checking for .rm files inside...`);
                try {
                    const dirPath = `${documentsPath}/${item.uuid}`;
                    const dirFiles = await this.connectionManager.listFiles(dirPath);
                    rmFiles = dirFiles.filter((file: any) => file.filename.endsWith('.rm'));
                    
                    this.outputChannel.appendLine(`Found ${dirFiles.length} files in document directory:`);
                    dirFiles.forEach((file: any, index: number) => {
                        this.outputChannel.appendLine(`  Dir File ${index + 1}: ${file.filename} (${file.size || 'unknown'} bytes)`);
                    });
                } catch (dirError) {
                    this.outputChannel.appendLine(`Error reading document directory: ${dirError}`);
                }
            }
            
            // Look for previewable files (PDF, SVG, PNG, images, text files, EPUB, and .rm files)
            const previewableExtensions = ['.pdf', '.svg', '.png', '.jpg', '.jpeg', '.txt', '.md', '.epub', '.gif', '.bmp', '.tiff', '.html', '.htm', '.json', '.xml', '.rm'];
            let previewFile = null;
            
            // First check for directly attached files (PDF, images, etc.)
            for (const file of documentFiles) {
                const extension = path.extname(file.filename).toLowerCase();
                if (previewableExtensions.includes(extension)) {
                    previewFile = file;
                    this.outputChannel.appendLine(`Found previewable file: ${file.filename}`);
                    break;
                }
            }

            if (!previewFile) {
                // Look for .rm files (reMarkable notebook format) - they might be in a subdirectory
                if (rmFiles.length > 0) {
                    this.outputChannel.appendLine(`Found ${rmFiles.length} .rm files for notebook "${item.label}":`);
                    rmFiles.forEach((file: any, index: number) => {
                        this.outputChannel.appendLine(`  RM File ${index + 1}: ${file.filename}`);
                    });
                    
                    // For now, convert the first page for preview
                    const firstPageFile = rmFiles[0];
                    previewFile = firstPageFile;
                    previewFile.isRmFile = true; // Mark as .rm file for special handling
                    previewFile.isInSubdirectory = true; // Mark that it's in a subdirectory
                    
                    this.outputChannel.appendLine(`Will convert first page: ${firstPageFile.filename} to SVG for preview`);
                } else {
                    this.outputChannel.appendLine(`No .rm files found. Other files present:`);
                    documentFiles.forEach((file: any) => {
                        const ext = path.extname(file.filename).toLowerCase();
                        this.outputChannel.appendLine(`  ${file.filename} (${ext || 'no extension'})`);
                    });
                    vscode.window.showWarningMessage(`No previewable files found for "${item.label}". Supported formats: PDF, SVG, PNG, JPG, GIF, BMP, TIFF, TXT, MD, HTML, JSON, XML, EPUB, RM`);
                    return;
                }
            }

            // Download the file to temp directory
            const localFilePath = path.join(tempDir, previewFile.filename);
            let remoteFilePath: string;
            
            if (previewFile.isInSubdirectory) {
                // File is in a subdirectory named after the document UUID
                remoteFilePath = `${documentsPath}/${item.uuid}/${previewFile.filename}`;
            } else {
                // File is directly in the documents directory
                remoteFilePath = `${documentsPath}/${previewFile.filename}`;
            }
            
            this.outputChannel.appendLine(`Downloading ${remoteFilePath} to ${localFilePath}`);
            await this.connectionManager.downloadFile(remoteFilePath, localFilePath);
            
            // Special handling for .rm files - convert to SVG first
            let fileToOpen = localFilePath;
            if (previewFile.isRmFile || path.extname(previewFile.filename).toLowerCase() === '.rm') {
                const svgOutputPath = path.join(tempDir, `${path.basename(previewFile.filename, '.rm')}.svg`);
                this.outputChannel.appendLine(`Converting .rm file to SVG: ${svgOutputPath}`);
                
                const conversionSuccess = await this.convertRmToSvg(localFilePath, svgOutputPath);
                if (conversionSuccess && fs.existsSync(svgOutputPath)) {
                    fileToOpen = svgOutputPath;
                    this.outputChannel.appendLine(`Successfully converted .rm to SVG, will preview SVG file`);
                } else {
                    this.outputChannel.appendLine(`Conversion failed. Showing detailed information about the .rm file instead.`);
                    
                    // Show information about the failed conversion
                    const action = await vscode.window.showWarningMessage(
                        `Failed to convert .rm file "${item.label}" to SVG. This may be due to an unsupported .rm file format or corrupted file.`,
                        'Show Details', 'Try Another Page', 'Cancel'
                    );
                    
                    if (action === 'Show Details') {
                        this.outputChannel.show();
                        vscode.window.showInformationMessage('Conversion details shown in Output panel');
                    } else if (action === 'Try Another Page' && rmFiles.length > 1) {
                        // Try the next .rm file
                        const nextPageFile = rmFiles[1];
                        const nextLocalPath = path.join(tempDir, nextPageFile.filename);
                        const nextRemotePath = `${documentsPath}/${item.uuid}/${nextPageFile.filename}`;
                        
                        this.outputChannel.appendLine(`Trying next page: ${nextPageFile.filename}`);
                        await this.connectionManager.downloadFile(nextRemotePath, nextLocalPath);
                        
                        const nextSvgPath = path.join(tempDir, `${path.basename(nextPageFile.filename, '.rm')}.svg`);
                        const nextConversionSuccess = await this.convertRmToSvg(nextLocalPath, nextSvgPath);
                        
                        if (nextConversionSuccess && fs.existsSync(nextSvgPath)) {
                            fileToOpen = nextSvgPath;
                            this.outputChannel.appendLine(`Successfully converted second page to SVG`);
                        } else {
                            vscode.window.showErrorMessage(`Failed to convert any .rm files. The notebook format may be unsupported.`);
                            return;
                        }
                    } else {
                        return;
                    }
                }
            }
            
            // Open the file in VS Code using built-in preview capabilities
            const extension = path.extname(fileToOpen).toLowerCase();
            
            // Create a file with a proper display name in the temp directory
            let fileToOpenWithGoodName = fileToOpen;
            if (previewFile.isRmFile) {
                // For .rm files converted to SVG, create a copy with the original name
                const properName = `${item.label}.svg`;
                const properPath = path.join(path.dirname(fileToOpen), properName);
                
                try {
                    fs.copyFileSync(fileToOpen, properPath);
                    fileToOpenWithGoodName = properPath;
                    this.outputChannel.appendLine(`Created display copy: ${properName}`);
                } catch (copyError) {
                    this.outputChannel.appendLine(`Warning: Could not create display copy: ${copyError}`);
                    // Fall back to original file
                }
            } else {
                // For other files, create a copy with the original name if it's different
                const originalName = `${item.label}${extension}`;
                const currentName = path.basename(fileToOpen);
                
                if (currentName !== originalName) {
                    const properPath = path.join(path.dirname(fileToOpen), originalName);
                    try {
                        fs.copyFileSync(fileToOpen, properPath);
                        fileToOpenWithGoodName = properPath;
                        this.outputChannel.appendLine(`Created display copy: ${originalName}`);
                    } catch (copyError) {
                        this.outputChannel.appendLine(`Warning: Could not create display copy: ${copyError}`);
                        // Fall back to original file
                    }
                }
            }
            
            const fileUri = vscode.Uri.file(fileToOpenWithGoodName);
            
            try {
                // Check user preference for VS Code preview
                if (useVSCodePreview) {
                    // Try to open with VS Code first - it has built-in support for many formats
                    if (['.pdf'].includes(extension)) {
                        // For PDFs, try VS Code first (if PDF extension is installed), fallback to external
                        try {
                            await vscode.commands.executeCommand('vscode.open', fileUri);
                            this.outputChannel.appendLine(`Opened ${extension} file in VS Code`);
                        } catch (pdfError) {
                            // Fallback to external application if VS Code can't handle it
                            await vscode.env.openExternal(fileUri);
                            this.outputChannel.appendLine(`Opened ${extension} file with external application (VS Code fallback)`);
                        }
                    } else if (['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.tiff', '.svg'].includes(extension)) {
                        // For images and SVG (including converted .rm files), VS Code has built-in preview support
                        if (previewFile.isRmFile) {
                            // For converted .rm files, open with a better title
                            await vscode.commands.executeCommand('vscode.open', fileUri, { 
                                preview: true,
                                viewColumn: vscode.ViewColumn.Active 
                            });
                            this.outputChannel.appendLine(`Opened converted ${item.label} (.rm → SVG) in VS Code preview`);
                        } else {
                            await vscode.commands.executeCommand('vscode.open', fileUri);
                            this.outputChannel.appendLine(`Opened ${extension} image in VS Code preview`);
                        }
                    } else if (['.html', '.htm'].includes(extension)) {
                        // For HTML files, open in VS Code first, user can choose to preview in browser
                        const document = await vscode.workspace.openTextDocument(fileUri);
                        await vscode.window.showTextDocument(document, { preview: true });
                        this.outputChannel.appendLine(`Opened ${extension} file in VS Code editor with preview option`);
                        
                        // Optionally show a message to preview in browser
                        const choice = await vscode.window.showInformationMessage(
                            `HTML file opened in editor. Would you like to preview it in a browser?`,
                            'Preview in Browser', 'Keep in Editor'
                        );
                        if (choice === 'Preview in Browser') {
                            await vscode.env.openExternal(fileUri);
                        }
                    } else if (['.epub'].includes(extension)) {
                        // EPUB files need external application
                        await vscode.env.openExternal(fileUri);
                        this.outputChannel.appendLine(`Opened ${extension} file with external application`);
                    } else {
                        // For text files (txt, md, json, xml), open in VS Code editor with preview
                        const document = await vscode.workspace.openTextDocument(fileUri);
                        await vscode.window.showTextDocument(document, { 
                            preview: true,
                            preserveFocus: false,
                            viewColumn: vscode.ViewColumn.Beside 
                        });
                        this.outputChannel.appendLine(`Opened ${extension} file in VS Code editor`);
                    }
                } else {
                    // User prefers external applications - open everything externally
                    await vscode.env.openExternal(fileUri);
                    this.outputChannel.appendLine(`Opened ${extension} file with external application (user preference)`);
                }
                
                // Only show notification if auto-preview is disabled (to avoid spam)
                const autoPreview = config.get('preview.autoPreview', true);
                if (!autoPreview) {
                    vscode.window.showInformationMessage(`Preview opened for: ${item.label}`);
                }
                
            } catch (openError) {
                this.outputChannel.appendLine(`Error opening file with preferred method, trying external application: ${openError}`);
                // Fallback to external application
                await vscode.env.openExternal(fileUri);
                vscode.window.showInformationMessage(`Preview opened externally for: ${item.label}`);
            }
            
        } catch (error) {
            this.outputChannel.appendLine(`Error previewing file: ${error}`);
            vscode.window.showErrorMessage(`Failed to preview: ${error}`);
        }
    }

    private async convertRmToSvg(rmFilePath: string, outputPath: string): Promise<boolean> {
        return new Promise((resolve, reject) => {
            // Try the improved script first, then fall back to the original
            const improvedScriptPath = path.join(this.context.extensionPath, 'src', 'rM2svg_improved');
            const originalScriptPath = path.join(this.context.extensionPath, 'src', 'rM2svg');
            
            this.outputChannel.appendLine(`Converting ${rmFilePath} to SVG using improved script: ${improvedScriptPath}`);
            
            // Check if the .rm file exists and has content
            if (!fs.existsSync(rmFilePath)) {
                this.outputChannel.appendLine(`Error: .rm file does not exist: ${rmFilePath}`);
                resolve(false);
                return;
            }
            
            const fileStats = fs.statSync(rmFilePath);
            this.outputChannel.appendLine(`RM file size: ${fileStats.size} bytes`);
            
            if (fileStats.size === 0) {
                this.outputChannel.appendLine(`Error: .rm file is empty`);
                resolve(false);
                return;
            }
            
            // Try to read the first few bytes to check the header
            try {
                const buffer = fs.readFileSync(rmFilePath);
                const headerStr = buffer.toString('utf8', 0, Math.min(50, buffer.length));
                this.outputChannel.appendLine(`RM file header: "${headerStr}"`);
                this.outputChannel.appendLine(`First 20 bytes as hex: ${buffer.subarray(0, 20).toString('hex')}`);
            } catch (readError) {
                this.outputChannel.appendLine(`Error reading .rm file for inspection: ${readError}`);
            }
            
            // Check if Python is available
            const pythonCommand = process.platform === 'win32' ? 'python' : 'python3';
            
            // Try conversion with improved script first
            const tryConversion = (scriptPath: string): Promise<boolean> => {
                return new Promise((resolveConversion) => {
                    const conversionProcess = spawn(pythonCommand, [
                        scriptPath,
                        '-i', rmFilePath,
                        '-o', outputPath,
                        '--coloured_annotations',
                        '--verbose'
                    ], {
                        stdio: ['pipe', 'pipe', 'pipe']
                    });
                    
                    let stdout = '';
                    let stderr = '';
                    
                    conversionProcess.stdout.on('data', (data) => {
                        stdout += data.toString();
                    });
                    
                    conversionProcess.stderr.on('data', (data) => {
                        stderr += data.toString();
                    });
                    
                    conversionProcess.on('close', (code) => {
                        if (code === 0) {
                            this.outputChannel.appendLine(`Successfully converted .rm file to SVG using ${scriptPath}`);
                            resolveConversion(true);
                        } else {
                            this.outputChannel.appendLine(`Conversion failed with ${scriptPath}: ${stderr}`);
                            this.outputChannel.appendLine(`Stdout: ${stdout}`);
                            this.outputChannel.appendLine(`Exit code: ${code}`);
                            resolveConversion(false);
                        }
                    });
                    
                    conversionProcess.on('error', (error) => {
                        this.outputChannel.appendLine(`Failed to start conversion process with ${scriptPath}: ${error.message}`);
                        resolveConversion(false);
                    });
                });
            };
            
            // Try improved script first, then fallback to original
            tryConversion(improvedScriptPath).then((improvedSuccess) => {
                if (improvedSuccess) {
                    resolve(true);
                } else {
                    this.outputChannel.appendLine(`Improved script failed, trying original script: ${originalScriptPath}`);
                    tryConversion(originalScriptPath).then((originalSuccess) => {
                        resolve(originalSuccess);
                    });
                }
            });
        });
    }
}
