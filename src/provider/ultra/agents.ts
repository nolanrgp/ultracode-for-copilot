/**
 * Ultra Agent Roles — dynamically defined by the Orchestrator.
 * buildWorkspaceContext now includes actual source file contents,
 * not just project type detection — agents can analyze real code.
 */

export interface AgentRole {
	id: string;
	name: string;
	emoji: string;
	systemPrompt: string;
}

export function buildWorkspaceContext(): string {
	const vscode = require('vscode');
	const folders = vscode.workspace.workspaceFolders;
	if (!folders?.length) return '';

	const root = folders[0].uri.fsPath;
	const parts: string[] = [];

	try {
		const { readFileSync, existsSync, readdirSync, statSync } = require('node:fs');
		const { join } = require('node:path');

		const agentsPath = join(root, 'AGENTS.md');
		if (existsSync(agentsPath)) {
			parts.push('## AGENTS.md\n' + readFileSync(agentsPath, 'utf-8').slice(0, 3000));
		}

		const hasFile = (name: string) => existsSync(join(root, name));
		const types: string[] = [];
		if (hasFile('package.json')) types.push('Node.js/JavaScript');
		if (hasFile('tsconfig.json')) types.push('TypeScript');
		if (hasFile('requirements.txt') || hasFile('pyproject.toml')) types.push('Python');
		if (hasFile('Cargo.toml')) types.push('Rust');
		if (hasFile('go.mod')) types.push('Go');
		if (types.length) parts.push('## Project Type: ' + types.join(', '));

		// Scan key source files for agent context
		const keyFiles = scanKeyFiles(root, existsSync, readdirSync, statSync, readFileSync, join);
		if (keyFiles.length) {
			parts.push('## Key Source Files\n' + keyFiles.join('\n\n'));
		}

		return parts.join('\n\n');
	} catch {
		return '';
	}
}

function scanKeyFiles(
	root: string,
	existsSync: (p: string) => boolean,
	readdirSync: (p: string, opts: { withFileTypes: boolean }) => Array<{ name: string; isDirectory: () => boolean }>,
	statSync: (p: string) => { size: number },
	readFileSync: (p: string, enc: string) => string,
	join: (...p: string[]) => string,
): string[] {
	const results: string[] = [];
	const extensions = ['.ts', '.js', '.json', '.md', '.rs', '.go', '.py', '.toml'];

	function walk(dir: string, depth: number) {
		if (depth > 2 || results.length >= 8) return;
		try {
			const entries = readdirSync(dir, { withFileTypes: true });
			for (const e of entries) {
				if (e.name.startsWith('.') || e.name === 'node_modules' || e.name === 'out' || e.name === 'target') continue;
				const full = join(dir, e.name);
				if (e.isDirectory()) {
					walk(full, depth + 1);
				} else if (extensions.some((ext) => e.name.endsWith(ext)) && statSync(full).size < 50000) {
					try {
						const content = readFileSync(full, 'utf-8');
						const relPath = full.replace(root + '/', '');
						results.push('### ' + relPath + '\n```\n' + content.slice(0, 2000) + '\n```');
					} catch { /* skip */ }
				}
			}
		} catch { /* ignore */ }
	}

	const srcDir = join(root, 'src');
	if (existsSync(srcDir)) walk(srcDir, 0);
	else walk(root, 0);

	return results;
}
