import * as vscode from 'vscode';
import { Client } from 'ssh2';
import { EventEmitter } from 'events';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

export interface RemarkableConfig {
    host: string;
    username: string;
    password: string;
    documentsPath: string;
    templatesPath: string;
}

export class RemarkableConnectionManager extends EventEmitter implements vscode.Disposable {
    private client: Client | null = null;
    private connected: boolean = false;

    constructor() {
        super();
    }

    public isConnected(): boolean {
        return this.connected;
    }

    public async connect(): Promise<boolean> {
        const config = this.getConfiguration();
        
        return new Promise((resolve, reject) => {
            this.client = new Client();
            
            this.client.on('ready', () => {
                console.log('SSH connection established');
                this.connected = true;
                this.emit('connected');
                vscode.commands.executeCommand('setContext', 'remarkableExplorer.connected', true);
                resolve(true);
            });

            this.client.on('error', (err: any) => {
                console.error('SSH connection error:', err);
                this.connected = false;
                
                let errorMessage = `Connection failed: ${err.message}`;
                
                if (err.level === 'client-authentication') {
                    errorMessage = 'Authentication failed. Please check your SSH keys or set a password in settings.';
                } else if (err.code === 'ECONNREFUSED') {
                    errorMessage = 'Connection refused. Make sure your reMarkable is in developer mode and connected.';
                } else if (err.code === 'EHOSTUNREACH') {
                    errorMessage = 'Host unreachable. Check the IP address in settings.';
                }
                
                this.emit('error', new Error(errorMessage));
                vscode.commands.executeCommand('setContext', 'remarkableExplorer.connected', false);
                reject(new Error(errorMessage));
            });

            this.client.on('end', () => {
                console.log('SSH connection ended');
                this.connected = false;
                this.emit('disconnected');
                vscode.commands.executeCommand('setContext', 'remarkableExplorer.connected', false);
            });

            const connectionOptions: any = {
                host: config.host,
                username: config.username,
                port: 22,
                readyTimeout: 10000,
            };

            if (config.password) {
                console.log('Using password authentication');
                connectionOptions.password = config.password;
            } else {
                console.log('Attempting key-based authentication');
                
                if (process.env.SSH_AUTH_SOCK) {
                    console.log('Using SSH agent');
                    connectionOptions.agent = process.env.SSH_AUTH_SOCK;
                }
                
                const sshDir = path.join(os.homedir(), '.ssh');
                const keyFiles = ['id_rsa', 'id_ed25519', 'id_ecdsa', 'id_dsa'];
                
                for (const keyFile of keyFiles) {
                    const keyPath = path.join(sshDir, keyFile);
                    if (fs.existsSync(keyPath)) {
                        try {
                            connectionOptions.privateKey = fs.readFileSync(keyPath);
                            console.log(`Using SSH key: ${keyPath}`);
                            break;
                        } catch (error) {
                            console.log(`Could not read key file ${keyPath}:`, error);
                        }
                    }
                }
            }

            console.log('Connecting to reMarkable...');
            this.client.connect(connectionOptions);
        });
    }

    public disconnect(): void {
        if (this.client) {
            this.client.end();
            this.client = null;
        }
        this.connected = false;
        vscode.commands.executeCommand('setContext', 'remarkableExplorer.connected', false);
    }

    public async executeCommand(command: string): Promise<string> {
        if (!this.client || !this.connected) {
            throw new Error('Not connected to reMarkable device');
        }

        return new Promise((resolve, reject) => {
            this.client!.exec(command, (err: any, stream: any) => {
                if (err) {
                    reject(err);
                    return;
                }

                let output = '';
                let errorOutput = '';

                stream.on('close', (code: number) => {
                    if (code === 0) {
                        resolve(output);
                    } else {
                        reject(new Error(`Command failed with code ${code}: ${errorOutput}`));
                    }
                });

                stream.on('data', (data: any) => {
                    output += data.toString();
                });

                stream.stderr.on('data', (data: any) => {
                    errorOutput += data.toString();
                });
            });
        });
    }

    public async listFiles(remotePath: string): Promise<any[]> {
        if (!this.client || !this.connected) {
            throw new Error('Not connected to reMarkable device');
        }

        return new Promise((resolve, reject) => {
            this.client!.sftp((err: any, sftp: any) => {
                if (err) {
                    reject(err);
                    return;
                }

                sftp.readdir(remotePath, (err: any, list: any) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(list);
                    }
                });
            });
        });
    }

    public async readFile(remotePath: string): Promise<string> {
        if (!this.client || !this.connected) {
            throw new Error('Not connected to reMarkable device');
        }

        return new Promise((resolve, reject) => {
            this.client!.sftp((err: any, sftp: any) => {
                if (err) {
                    reject(err);
                    return;
                }

                sftp.readFile(remotePath, 'utf8', (err: any, data: any) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(data.toString());
                    }
                });
            });
        });
    }

    public async downloadFile(remotePath: string, localPath: string): Promise<void> {
        if (!this.client || !this.connected) {
            throw new Error('Not connected to reMarkable device');
        }

        return new Promise((resolve, reject) => {
            this.client!.sftp((err: any, sftp: any) => {
                if (err) {
                    reject(err);
                    return;
                }

                sftp.fastGet(remotePath, localPath, (err: any) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve();
                    }
                });
            });
        });
    }

    private getConfiguration(): RemarkableConfig {
        const config = vscode.workspace.getConfiguration('remarkableManager');
        
        return {
            host: config.get('connection.host', '10.11.99.1'),
            username: config.get('connection.username', 'root'),
            password: config.get('connection.password', ''),
            documentsPath: config.get('paths.documents', '.local/share/remarkable/xochitl'),
            templatesPath: config.get('paths.templates', '.local/share/remarkable/templates')
        };
    }

    public dispose(): void {
        this.disconnect();
    }
}
