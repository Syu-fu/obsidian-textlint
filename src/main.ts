import { FileSystemAdapter, MarkdownView, Notice, Plugin, TFile } from "obsidian";
import { join } from "path";
import { setupKuromoji } from "./kuromoji-setup";
import { DEFAULT_SETTINGS, TextlintPluginSettings, TextlintSettingTab } from "./settings";
import { TextlintService } from "./textlint-service";
import { buildTextlintExtension, setTextlintDiagnostics } from "./codemirror-linter";
import { ERROR_LIST_VIEW_TYPE, ErrorListView } from "./error-list-view";
import type { EditorView } from "@codemirror/view";

export default class TextlintPlugin extends Plugin {
	settings: TextlintPluginSettings;
	pluginDir: string;
	private service: TextlintService;

	async onload(): Promise<void> {
		await this.loadSettings();
		this.service = new TextlintService();

		// Resolve the absolute path to this plugin's directory
		const adapter = this.app.vault.adapter;
		const basePath = adapter instanceof FileSystemAdapter ? adapter.getBasePath() : "";
		this.pluginDir = join(basePath, this.manifest.dir ?? `.obsidian/plugins/${this.manifest.id}`);

		// Set KUROMOJIN_DIC_PATH so kuromojin never calls require.resolve("kuromoji")
		void setupKuromoji(this.pluginDir);

		// Register the error list sidebar view
		this.registerView(ERROR_LIST_VIEW_TYPE, (leaf) => new ErrorListView(leaf));

		// Register CodeMirror extension for inline marks
		this.registerEditorExtension(buildTextlintExtension());

		// Re-lint current file whenever active file changes
		this.registerEvent(
			this.app.workspace.on("active-leaf-change", () => {
				void this.lintActiveFile();
			})
		);

		// Re-lint on file save
		this.registerEvent(
			this.app.vault.on("modify", (file) => {
				const active = this.app.workspace.getActiveFile();
				if (active && file.path === active.path) {
					void this.lintActiveFile();
				}
			})
		);

		// Command: open error list panel
		this.addCommand({
			id: "show-error-list",
			name: "エラー一覧を開く",
			callback: () => { void this.openErrorListView(); },
		});

		// Command: fix current file
		this.addCommand({
			id: "fix-current-file",
			name: "現在のファイルを修正する (fix)",
			checkCallback: (checking: boolean) => {
				const file = this.app.workspace.getActiveFile();
				if (!file || file.extension !== "md") return false;
				if (!checking) void this.fixCurrentFile(file);
				return true;
			},
		});

		// Settings tab
		this.addSettingTab(new TextlintSettingTab(this.app, this));
	}

	onunload(): void {
		// Leaves are cleaned up by Obsidian automatically
	}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			(await this.loadData()) as Partial<TextlintPluginSettings>
		);
		// Deep merge nested objects that may be missing keys after an upgrade
		this.settings.jaTechnicalWriting = Object.assign(
			{},
			DEFAULT_SETTINGS.jaTechnicalWriting,
			this.settings.jaTechnicalWriting
		);
		this.settings.terminology = Object.assign(
			{},
			DEFAULT_SETTINGS.terminology,
			this.settings.terminology
		);
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	// ── Helpers ──────────────────────────────────────────────────────────────

	private isExcluded(file: TFile): boolean {
		return this.settings.excludedFolders.some(
			(folder) => file.path === folder || file.path.startsWith(folder + "/")
		);
	}

	private async lintActiveFile(): Promise<void> {
		const file = this.app.workspace.getActiveFile();
		if (!file || file.extension !== "md" || this.isExcluded(file)) {
			this.updateErrorView(file?.path ?? "", []);
			this.dispatchToEditor([]);
			return;
		}
		const text = await this.app.vault.cachedRead(file);
		const { messages } = await this.service.lint(text, this.settings);
		this.updateErrorView(file.path, messages);
		this.dispatchToEditor(messages);
	}

	private dispatchToEditor(messages: import("./textlint-service").TextlintMessage[]): void {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!view) return;
		// Access the underlying CM6 EditorView via the internal `cm` property
		const cmView = (view.editor as unknown as { cm?: EditorView }).cm;
		if (!cmView) return;
		cmView.dispatch({ effects: setTextlintDiagnostics.of(messages) });
	}

	private updateErrorView(filePath: string, messages: import("./textlint-service").TextlintMessage[]): void {
		for (const leaf of this.app.workspace.getLeavesOfType(ERROR_LIST_VIEW_TYPE)) {
			(leaf.view as ErrorListView).update(filePath, messages);
		}
	}

	private async openErrorListView(): Promise<void> {
		const existing = this.app.workspace.getLeavesOfType(ERROR_LIST_VIEW_TYPE);
		if (existing.length > 0 && existing[0]) {
			void this.app.workspace.revealLeaf(existing[0]);
			return;
		}
		const leaf = this.app.workspace.getRightLeaf(false) ?? this.app.workspace.getLeaf(true);
		await leaf.setViewState({ type: ERROR_LIST_VIEW_TYPE, active: true });
		void this.app.workspace.revealLeaf(leaf);  // revealLeaf is void, no await needed
		await this.lintActiveFile();
	}

	private async fixCurrentFile(file: TFile): Promise<void> {
		if (this.isExcluded(file)) {
			new Notice("このファイルは除外フォルダ内にあります");
			return;
		}

		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		const originalText = view ? view.editor.getValue() : await this.app.vault.read(file);

		const { output, messages } = await this.service.fix(originalText, this.settings);

		if (output === originalText) {
			new Notice("修正できる箇所はありませんでした");
			return;
		}

		if (view) {
			view.editor.setValue(output);
		} else {
			await this.app.vault.modify(file, output);
		}

		const remaining = messages.length;
		new Notice(
			remaining > 0
				? `修正しました（${remaining} 件のエラーは自動修正できませんでした）`
				: "修正しました"
		);

		await this.lintActiveFile();
	}
}
