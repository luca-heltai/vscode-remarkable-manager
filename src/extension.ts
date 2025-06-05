import * as vscode from 'vscode';
import { RemarkableExplorer } from './remarkableExplorer';
import { RemarkableConnectionManager } from './connectionManager';

export function activate(context: vscode.ExtensionContext) {
    // Create a dedicated output channel for our extension
    const outputChannel = vscode.window.createOutputChannel('reMarkable Manager');
    outputChannel.appendLine('🚀 reMarkable Manager extension is now active');
    outputChannel.show(); // This will show the output channel immediately
    
    console.log('🚀 reMarkable Manager extension is now active');
    vscode.window.showInformationMessage('reMarkable Manager extension activated!');

    // Initialize connection manager
    outputChannel.appendLine('Creating connection manager...');
    console.log('Creating connection manager...');
    const connectionManager = new RemarkableConnectionManager();
    
    // Initialize explorer
    outputChannel.appendLine('Creating remarkable explorer...');
    console.log('Creating remarkable explorer...');
    const remarkableExplorer = new RemarkableExplorer(context, connectionManager, outputChannel);
    
    // Register tree data provider
    outputChannel.appendLine('Registering tree view...');
    console.log('Registering tree view...');
    const treeView = vscode.window.createTreeView('remarkableExplorer', {
        treeDataProvider: remarkableExplorer,
        showCollapseAll: true
    });
    outputChannel.appendLine('Tree view registered successfully');
    console.log('Tree view registered successfully');

    // Set context to show the view
    vscode.commands.executeCommand('setContext', 'remarkableExplorer.enabled', true);

    // Register commands
    outputChannel.appendLine('Registering commands...');
    const commands = [
        vscode.commands.registerCommand('remarkableExplorer.refresh', () => remarkableExplorer.refresh()),
        vscode.commands.registerCommand('remarkableExplorer.connect', () => remarkableExplorer.connect()),
        vscode.commands.registerCommand('remarkableExplorer.disconnect', () => remarkableExplorer.disconnect()),
        vscode.commands.registerCommand('remarkableExplorer.toggleView', () => remarkableExplorer.toggleView()),
        vscode.commands.registerCommand('remarkableExplorer.backup', (item) => remarkableExplorer.backup(item)),
        vscode.commands.registerCommand('remarkableExplorer.rename', (item) => remarkableExplorer.rename(item)),
        vscode.commands.registerCommand('remarkableExplorer.export', (item) => remarkableExplorer.export(item)),
        vscode.commands.registerCommand('remarkableExplorer.preview', (item) => remarkableExplorer.preview(item)),
        vscode.commands.registerCommand('remarkableExplorer.openSettings', () => {
            vscode.commands.executeCommand('workbench.action.openSettings', 'remarkableManager');
        })
    ];

    // Add all commands to context subscriptions
    commands.forEach(command => context.subscriptions.push(command));
    
    // Add connection manager to subscriptions for proper cleanup
    context.subscriptions.push(connectionManager);
}

export function deactivate() {
    console.log('reMarkable Manager extension is now deactivated');
}
