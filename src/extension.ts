import * as vscode from 'vscode';
import { RemarkableExplorer } from './remarkableExplorer';
import { RemarkableConnectionManager } from './connectionManager';

export function activate(context: vscode.ExtensionContext) {
    console.log('🚀 reMarkable Manager extension is now active');
    vscode.window.showInformationMessage('reMarkable Manager extension activated!');

    // Initialize connection manager
    const connectionManager = new RemarkableConnectionManager();
    
    // Initialize explorer
    const remarkableExplorer = new RemarkableExplorer(context, connectionManager);
    
    // Register tree data provider
    vscode.window.createTreeView('remarkableExplorer', {
        treeDataProvider: remarkableExplorer,
        showCollapseAll: true
    });

    // Set context to show the view
    vscode.commands.executeCommand('setContext', 'remarkableExplorer.enabled', true);

    // Register commands
    const commands = [
        vscode.commands.registerCommand('remarkableExplorer.refresh', () => remarkableExplorer.refresh()),
        vscode.commands.registerCommand('remarkableExplorer.connect', () => remarkableExplorer.connect()),
        vscode.commands.registerCommand('remarkableExplorer.disconnect', () => remarkableExplorer.disconnect()),
        vscode.commands.registerCommand('remarkableExplorer.toggleView', () => remarkableExplorer.toggleView()),
        vscode.commands.registerCommand('remarkableExplorer.backup', (item) => remarkableExplorer.backup(item)),
        vscode.commands.registerCommand('remarkableExplorer.rename', (item) => remarkableExplorer.rename(item)),
        vscode.commands.registerCommand('remarkableExplorer.export', (item) => remarkableExplorer.export(item)),
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
