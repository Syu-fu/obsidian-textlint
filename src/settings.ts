import { App, PluginSettingTab, Setting, TFolder } from "obsidian";
import type TextlintPlugin from "./main";

// ─── Rule config types ───────────────────────────────────────────────────────

export interface JaTechnicalWritingConfig {
	enabled: boolean;
	/** max-kanji-continuous-len: 連続する漢字の最大数 (0 = disable) */
	maxKanjiContinuousLen: number;
	/** ja-no-mixed-period */
	jaNomixedPeriod: boolean;
}

export interface TerminologyConfig {
	enabled: boolean;
	/** Additional custom term corrections: [[incorrect, correct], ...] */
	extraTerms: [string, string][];
	/** Skips terms check inside code spans and code blocks */
	skipCode: boolean;
}

// ─── Plugin settings ─────────────────────────────────────────────────────────

export interface TextlintPluginSettings {
	excludedFolders: string[];
	jaTechnicalWriting: JaTechnicalWritingConfig;
	terminology: TerminologyConfig;
}

export const DEFAULT_SETTINGS: TextlintPluginSettings = {
	excludedFolders: [],
	jaTechnicalWriting: {
		enabled: true,
		maxKanjiContinuousLen: 6,
		jaNomixedPeriod: true,
	},
	terminology: {
		enabled: true,
		extraTerms: [],
		skipCode: true,
	},
};

// ─── Settings tab ─────────────────────────────────────────────────────────────

export class TextlintSettingTab extends PluginSettingTab {
	plugin: TextlintPlugin;

	constructor(app: App, plugin: TextlintPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		// ── Excluded folders ──────────────────────────────────────────────
		new Setting(containerEl).setName("除外フォルダ").setHeading();

		const folders = this.app.vault
			.getAllFolders(true)
			.map((f: TFolder) => f.path)
			.sort();

		this.renderExcludedFolders(containerEl, folders);

		// ── preset-ja-technical-writing ───────────────────────────────────
		new Setting(containerEl).setName("Preset ja technical writing").setHeading();
		this.renderJaRules(containerEl);

		// ── textlint-rule-terminology ─────────────────────────────────────
		new Setting(containerEl).setName("Terminology rule").setHeading();
		this.renderTerminology(containerEl);
	}

	// ── Excluded folders ──────────────────────────────────────────────────────

	private renderExcludedFolders(containerEl: HTMLElement, allFolders: string[]): void {
		const { excludedFolders } = this.plugin.settings;

		// List of currently excluded folders
		const listEl = containerEl.createDiv("textlint-excluded-folder-list");
		this.refreshExcludedFolderList(listEl);

		// Add folder input with datalist autocomplete
		new Setting(containerEl)
			.setName("フォルダを追加")
			.setDesc("除外するフォルダを選択または入力してください")
			.addText((text) => {
				const inputEl = text.inputEl;
				inputEl.setAttribute("list", "textlint-folder-list");

				// Build datalist
				const datalist = document.createElement("datalist");
				datalist.id = "textlint-folder-list";
				for (const f of allFolders) {
					if (!excludedFolders.includes(f)) {
						const option = document.createElement("option");
						option.value = f;
						datalist.appendChild(option);
					}
				}
				inputEl.parentElement?.appendChild(datalist);

				text.setPlaceholder("例: templates");
				return text;
			})
			.addButton((btn) => {
				btn.setButtonText("追加").onClick(() => {
					const input = containerEl.querySelector<HTMLInputElement>(
						"input[list='textlint-folder-list']"
					);
					const val = input?.value.trim();
					if (val && !this.plugin.settings.excludedFolders.includes(val)) {
						this.plugin.settings.excludedFolders.push(val);
						void this.plugin.saveSettings();
						this.display();
					}
				});
			});
	}

	private refreshExcludedFolderList(listEl: HTMLElement): void {
		listEl.empty();
		for (const folder of this.plugin.settings.excludedFolders) {
			const row = listEl.createDiv("textlint-excluded-folder-row");
			row.createSpan({ text: folder });
			const removeBtn = row.createEl("button", { text: "×" });
			removeBtn.addEventListener("click", () => {
				this.plugin.settings.excludedFolders =
					this.plugin.settings.excludedFolders.filter((f) => f !== folder);
				void this.plugin.saveSettings();
				this.display();
			});
		}
	}

	// ── preset-ja-technical-writing ──────────────────────────────────────────

	private renderJaRules(containerEl: HTMLElement): void {
		const cfg = this.plugin.settings.jaTechnicalWriting;

		new Setting(containerEl)
			.setName("有効")
			.setDesc("Preset-ja-technical-writing を使用する")
			.addToggle((t) =>
				t.setValue(cfg.enabled).onChange((v) => {
					cfg.enabled = v;
					void this.plugin.saveSettings();
				})
			);

		new Setting(containerEl)
			.setName("連続する漢字の最大数 (max-kanji-continuous-len)")
			.setDesc("連続する漢字の最大文字数。0 で無効")
			.addSlider((s) =>
				s
					.setLimits(0, 20, 1)
					.setValue(cfg.maxKanjiContinuousLen)
					.setDynamicTooltip()
					.onChange((v) => {
						cfg.maxKanjiContinuousLen = v;
						void this.plugin.saveSettings();
					})
			);

		const boolRules: { key: keyof JaTechnicalWritingConfig; name: string; desc: string }[] = [
			{ key: "jaNomixedPeriod", name: "句点の混在を禁止", desc: "ja-no-mixed-period" },
		];

		for (const rule of boolRules) {
			new Setting(containerEl)
				.setName(rule.name)
				.setDesc(rule.desc)
				.addToggle((t) =>
					t.setValue(cfg[rule.key] as boolean).onChange((v) => {
						(cfg[rule.key] as boolean) = v;
						void this.plugin.saveSettings();
					})
				);
		}
	}

	// ── textlint-rule-terminology ─────────────────────────────────────────────

	private renderTerminology(containerEl: HTMLElement): void {
		const cfg = this.plugin.settings.terminology;

		new Setting(containerEl)
			.setName("有効")
			.setDesc("Textlint-rule-terminology を使用する")
			.addToggle((t) =>
				t.setValue(cfg.enabled).onChange((v) => {
					cfg.enabled = v;
					void this.plugin.saveSettings();
				})
			);

		new Setting(containerEl)
			.setName("コード内をスキップ")
			.setDesc("コードスパン・コードブロック内のチェックをスキップする")
			.addToggle((t) =>
				t.setValue(cfg.skipCode).onChange((v) => {
					cfg.skipCode = v;
					void this.plugin.saveSettings();
				})
			);

		new Setting(containerEl).setName("カスタム用語").setHeading();
		containerEl.createEl("p", {
			text: "「誤り → 正しい表記」の形式で追加できます",
			cls: "setting-item-description",
		});

		this.renderExtraTerms(containerEl);
	}

	private renderExtraTerms(containerEl: HTMLElement): void {
		const cfg = this.plugin.settings.terminology;
		const listEl = containerEl.createDiv("textlint-terms-list");

		const refresh = () => {
			listEl.empty();
			for (let i = 0; i < cfg.extraTerms.length; i++) {
				const term = cfg.extraTerms[i];
				if (!term) continue;
				const [incorrect, correct] = term;
				const row = listEl.createDiv("textlint-term-row");
				row.createSpan({ text: `${incorrect} → ${correct}` });
				const removeBtn = row.createEl("button", { text: "×" });
				removeBtn.addEventListener("click", () => {
					cfg.extraTerms.splice(i, 1);
					void this.plugin.saveSettings();
					refresh();
				});
			}
		};
		refresh();

		let incorrectVal = "";
		let correctVal = "";

		new Setting(containerEl)
			.setName("誤った表記")
			.addText((t) => {
				t.setPlaceholder("誤った単語").onChange((v) => {
					incorrectVal = v;
				});
			});

		new Setting(containerEl)
			.setName("正しい表記")
			.addText((t) => {
				t.setPlaceholder("正しい単語").onChange((v) => {
					correctVal = v;
				});
			})
			.addButton((btn) => {
				btn.setButtonText("追加").onClick(() => {
					if (incorrectVal && correctVal) {
						cfg.extraTerms.push([incorrectVal, correctVal]);
						void this.plugin.saveSettings();
						refresh();
					}
				});
			});
	}
}
