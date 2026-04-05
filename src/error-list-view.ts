import { ItemView, MarkdownView, WorkspaceLeaf } from "obsidian";
import type { TextlintMessage } from "./textlint-service";

export const ERROR_LIST_VIEW_TYPE = "textlint-error-list";

export class ErrorListView extends ItemView {
	private messages: TextlintMessage[] = [];
	private filePath = "";

	constructor(leaf: WorkspaceLeaf) {
		super(leaf);
	}

	getViewType(): string {
		return ERROR_LIST_VIEW_TYPE;
	}

	getDisplayText(): string {
		return "Textlint エラー";
	}

	getIcon(): string {
		return "alert-circle";
	}

	async onOpen(): Promise<void> {
		this.render();
	}

	async onClose(): Promise<void> {
		// nothing
	}

	/**
	 * Called by the plugin when lint results are updated.
	 */
	update(filePath: string, messages: TextlintMessage[]): void {
		this.filePath = filePath;
		this.messages = messages;
		this.render();
	}

	private render(): void {
		const { contentEl } = this;
		contentEl.empty();

		const header = contentEl.createDiv("textlint-error-header");
		header.createEl("strong", {
			text: this.filePath ? this.filePath : "（ファイルを開いてください）",
		});
		header.createSpan({
			text: ` — ${this.messages.length} 件`,
			cls: "textlint-error-count",
		});

		if (this.messages.length === 0) {
			contentEl.createDiv({ text: "エラーはありません ✓", cls: "textlint-no-errors" });
			return;
		}

		const list = contentEl.createEl("ul", { cls: "textlint-error-list" });
		for (const msg of this.messages) {
			const item = list.createEl("li", { cls: "textlint-error-item" });
			const severityClass = msg.severity === 2 ? "textlint-severity-error" : "textlint-severity-warning";
			item.createSpan({ cls: `textlint-severity ${severityClass}`, text: msg.severity === 2 ? "E" : "W" });
			item.createSpan({ cls: "textlint-error-location", text: `${msg.line}:${msg.column}` });
			item.createSpan({ cls: "textlint-error-message", text: msg.message });
			item.createSpan({ cls: "textlint-error-rule", text: `(${msg.ruleId})` });

			// Click to jump to the line
			item.addEventListener("click", () => {
				this.jumpToLine(msg.line, msg.column);
			});
		}
	}

	private jumpToLine(line: number, column: number): void {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!view) return;
		const editor = view.editor;
		// CodeMirror lines are 0-indexed; textlint lines are 1-indexed
		const pos = { line: line - 1, ch: column - 1 };
		editor.setCursor(pos);
		editor.scrollIntoView({ from: pos, to: pos }, true);
		editor.focus();
	}
}
