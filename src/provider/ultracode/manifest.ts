import * as fs from 'node:fs';
import * as path from 'node:path';
import type { UltracodeManifest } from './types';

/**
 * Load and parse the AGENTS.md manifest from the workspace root.
 */
export function loadManifest(workspaceRoot: string, manifestPath?: string): UltracodeManifest | null {
	const targetPath = manifestPath ?? 'AGENTS.md';
	const fullPath = path.isAbsolute(targetPath) ? targetPath : path.join(workspaceRoot, targetPath);

	try {
		const content = fs.readFileSync(fullPath, 'utf-8');
		return parseManifest(content);
	} catch {
		return null;
	}
}

export function parseManifest(content: string): UltracodeManifest {
	const commands: string[] = [];
	const conventions: string[] = [];
	const architecture: string[] = [];

	let currentSection: 'commands' | 'conventions' | 'architecture' | null = null;

	for (const line of content.split('\n')) {
		const trimmed = line.trim();

		if (/^##\s+Commands/i.test(trimmed)) {
			currentSection = 'commands';
			continue;
		}
		if (/^##\s+(Key\s+)?Conventions/i.test(trimmed)) {
			currentSection = 'conventions';
			continue;
		}
		if (/^##\s+Architecture/i.test(trimmed)) {
			currentSection = 'architecture';
			continue;
		}
		if (/^##\s+/.test(trimmed)) {
			currentSection = null;
			continue;
		}

		if (currentSection && trimmed) {
			if (currentSection === 'commands') commands.push(trimmed);
			else if (currentSection === 'conventions') conventions.push(trimmed);
			else if (currentSection === 'architecture') architecture.push(trimmed);
		}
	}

	return { commands, conventions, architecture, rawContent: content };
}

export function manifestToSystemPrompt(manifest: UltracodeManifest): string {
	const lines: string[] = ['# Project Manifest (AGENTS.md)', ''];

	if (manifest.commands.length) {
		lines.push('## Commands');
		lines.push(...manifest.commands);
		lines.push('');
	}
	if (manifest.conventions.length) {
		lines.push('## Key Conventions');
		lines.push(...manifest.conventions);
		lines.push('');
	}
	if (manifest.architecture.length) {
		lines.push('## Architecture');
		lines.push(...manifest.architecture);
		lines.push('');
	}

	return lines.join('\n');
}
