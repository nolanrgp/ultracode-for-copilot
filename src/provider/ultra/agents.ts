/**
 * Ultra Agent Roles — dynamically defined by the Orchestrator.
 * No hardcoded agents. The AI analyzes project context and user request
 * to create custom agents with tailored system prompts.
 */

export interface AgentRole {
	id: string;
	name: string;
	emoji: string;
	systemPrompt: string;
}

/**
 * Build workspace context for the Orchestrator to analyze.
 * Reads AGENTS.md + detects project type from file structure.
 */
export function buildWorkspaceContext(): string {
	const vscode = require('vscode');
	const folders = vscode.workspace.workspaceFolders;
	if (!folders?.length) return '';

	const root = folders[0].uri.fsPath;

	try {
		const { readFileSync, existsSync, readdirSync } = require('node:fs');
		const { join } = require('node:path');
		const parts: string[] = [];

		const agentsPath = join(root, 'AGENTS.md');
		if (existsSync(agentsPath)) {
			parts.push('## AGENTS.md\n' + readFileSync(agentsPath, 'utf-8').slice(0, 3000));
		}

		const hasFile = (name: string) => existsSync(join(root, name));
		const types: string[] = [];
		if (hasFile('package.json')) types.push('Node.js/JavaScript');
		if (hasFile('tsconfig.json')) types.push('TypeScript');
		if (hasFile('Cargo.toml')) types.push('Rust');
		if (hasFile('go.mod')) types.push('Go');
		if (hasFile('requirements.txt') || hasFile('pyproject.toml')) types.push('Python');
		if (hasFile('src/app') || hasFile('src/pages')) types.push('Frontend');
		if (hasFile('src/server') || hasFile('src/api')) types.push('Backend API');
		if (hasFile('Dockerfile')) types.push('Docker');
		if (types.length) parts.push(`## Project Type: ${types.join(', ')}`);

		try {
			const entries = readdirSync(root, { withFileTypes: true });
			const dirs = entries
				.filter((e: { isDirectory: () => boolean; name: string }) =>
					e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules')
				.map((e: { name: string }) => e.name);
			if (dirs.length) parts.push(`## Top-level: ${dirs.join(', ')}`);
		} catch { /* ignore */ }

		return parts.join('\n\n');
	} catch {
		return '';
	}
}
