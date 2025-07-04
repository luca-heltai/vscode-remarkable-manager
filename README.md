# reMarkable Manager VSCode Extension

A Visual St### Preview Features

- **Auto-Preview**: Documents open automatically when clicked in the tree view
- **VS Code Integration**: Images, PDFs, and text files open directly in VS Code
- **reMarkable Notebook Support**: .rm files are automatically converted to SVG for preview
- **Multi-Format Support**:
  - **Images**: PNG, JPG, JPEG, GIF, BMP, TIFF, SVG
  - **Documents**: PDF, EPUB
  - **Text**: TXT, MD, HTML, JSON, XML
  - **reMarkable Notebooks**: .rm files (converted to SVG for preview)
- **Smart Opening**: VS Code preview for supported formats, external apps for others
- **Configurable**: Turn auto-preview on/off, choose VS Code vs external apps

### Prerequisites for .rm File Preview

- Python 3 must be installed and available in your system PATH
- The extension includes a built-in .rm to SVG converter
- .rm files are converted on-demand when previewed (first page only)ormat Support**:
  - **Images**: PNG, JPG, JPEG, GIF, BMP, TIFF, SVG
  - **Documents**: PDF, EPUB
  - **Text**: TXT, MD, HTML, JSON, XML
  - **reMarkable Notebooks**: .rm files (converted to SVG for preview)Code extension for managing your reMarkable Paper Pro files directly from your editor.

## Features

- **Tree View Integration**: Browse your reMarkable documents and templates in VSCode's sidebar
- **SSH Connection**: Connect to your reMarkable device via SSH
- **Document Management**: View, rename, and backup your documents
- **Hierarchical View**: See your documents organized in folders as they appear on your device
- **Smart Preview**: Automatically preview documents using VS Code's built-in capabilities
- **Multi-format Support**: Preview PDFs, images, SVG, HTML, and text files seamlessly
- **Raw File View**: Toggle between parsed document names and raw GUID-based file structure
- **Template Support**: Browse and manage your document templates
- **Trash Management**: View and manage deleted documents
- **Local Backup**: Download and backup your documents locally

## Prerequisites

- reMarkable Paper Pro with developer mode enabled
- SSH access to your reMarkable device configured
- VSCode version 1.74.0 or higher

## Configuration

The extension can be configured through VSCode settings:

- `remarkableManager.connection.host`: reMarkable tablet IP address (default: 10.11.99.1)
- `remarkableManager.connection.username`: SSH username (default: root)
- `remarkableManager.connection.password`: SSH password (leave empty to use SSH keys)
- `remarkableManager.paths.documents`: Path to documents directory (default: .local/share/remarkable/xochitl)
- `remarkableManager.paths.templates`: Path to templates directory (default: .local/share/remarkable/templates)
- `remarkableManager.backup.localPath`: Local directory for backups
- `remarkableManager.view.showRawFiles`: Show raw GUID-based file structure
- `remarkableManager.preview.autoPreview`: Automatically preview documents when clicked (default: true)
- `remarkableManager.preview.useVSCodePreview`: Use VS Code's built-in preview when possible (default: true)

## Usage

1. Open the reMarkable view in the VSCode sidebar
2. Click the connect button to connect to your device
3. Browse your documents and templates
4. **Click on any document to automatically preview it** (if auto-preview is enabled)
5. Right-click on documents to access preview, backup, rename, or export options
6. Use the toggle button to switch between parsed and raw file views

### Preview Features

- **Auto-Preview**: Documents open automatically when clicked in the tree view
- **VS Code Integration**: Images, PDFs, and text files open directly in VS Code
- **Multi-Format Support**:
  - **Images**: PNG, JPG, JPEG, GIF, BMP, TIFF, SVG
  - **Documents**: PDF, EPUB
  - **Text**: TXT, MD, HTML, JSON, XML
  - **reMarkable Notebooks**: .rm files (with detailed info)
- **Smart Opening**: VS Code preview for supported formats, external apps for others
- **Configurable**: Turn auto-preview on/off, choose VS Code vs external apps

## Development

To set up the development environment:

```bash
npm install
npm run compile
```

To test the extension:

1. Open this folder in VSCode
2. Press F5 to launch a new Extension Development Host window
3. The extension will be active in the new window

## Commands

- `reMarkable: Connect` - Connect to your reMarkable device
- `reMarkable: Disconnect` - Disconnect from your device
- `reMarkable: Refresh` - Refresh the file tree
- `reMarkable: Toggle View` - Switch between parsed and raw file view
- `reMarkable: Settings` - Open extension settings

## Troubleshooting

### Connection Issues

- Ensure your reMarkable is in developer mode
- Check that SSH is properly configured
- Verify the IP address in settings

### File Access Issues

- Make sure the document and template paths are correct
- Check SSH permissions on the device

## License

MIT License - see LICENSE file for details
