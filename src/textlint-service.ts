import { TextlintKernel } from "@textlint/kernel";
import type { TextlintMessage, TextlintKernelRule } from "@textlint/kernel";
import type { TextlintRuleModule } from "@textlint/types";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const markdownPlugin = require("@textlint/textlint-plugin-markdown");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const preset = require("textlint-rule-preset-ja-technical-writing");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const terminology = require("textlint-rule-terminology");

import type { TextlintPluginSettings } from "./settings";

export type { TextlintMessage };

export interface LintResult {
	messages: TextlintMessage[];
}

export interface FixResult {
	output: string;
	messages: TextlintMessage[];
}

export class TextlintService {
	private kernel: TextlintKernel;

	constructor() {
		this.kernel = new TextlintKernel();
	}

	async lint(text: string, settings: TextlintPluginSettings): Promise<LintResult> {
		const rules = this.buildRules(settings);
		if (rules.length === 0) {
			return { messages: [] };
		}
		const result = await this.kernel.lintText(text, {
			ext: ".md",
			plugins: [{ pluginId: "markdown", plugin: markdownPlugin.default }],
			rules,
		});
		return { messages: result.messages };
	}

	async fix(text: string, settings: TextlintPluginSettings): Promise<FixResult> {
		const rules = this.buildRules(settings);
		if (rules.length === 0) {
			return { output: text, messages: [] };
		}
		const result = await this.kernel.fixText(text, {
			ext: ".md",
			plugins: [{ pluginId: "markdown", plugin: markdownPlugin.default }],
			rules,
		});
		return { output: result.output, messages: result.remainingMessages };
	}

	private buildRules(settings: TextlintPluginSettings) {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const rules: TextlintKernelRule[] = [];

		if (settings.jaTechnicalWriting.enabled) {
			const cfg = settings.jaTechnicalWriting;
			// Merge per-rule overrides on top of the preset defaults
			const overrides: Record<string, unknown> = {};

			if (cfg.maxTen === 0) {
				overrides["max-ten"] = false;
			} else {
				overrides["max-ten"] = { max: cfg.maxTen };
			}

			if (cfg.maxKanjiContinuousLen === 0) {
				overrides["max-kanji-continuous-len"] = false;
			} else {
				overrides["max-kanji-continuous-len"] = { max: cfg.maxKanjiContinuousLen };
			}

			overrides["no-mix-dearu-desumasu"] = cfg.noMixDearuDesumasu
				? preset.rulesConfig["no-mix-dearu-desumasu"]
				: false;
			overrides["no-doubled-joshi"] = cfg.noDoubledJoshi
				? preset.rulesConfig["no-doubled-joshi"]
				: false;
			overrides["ja-no-mixed-period"] = cfg.jaNomixedPeriod
				? preset.rulesConfig["ja-no-mixed-period"]
				: false;
			overrides["ja-no-redundant-expression"] = cfg.jaNoRedundantExpression;
			overrides["ja-no-abusage"] = cfg.jaNoAbusage;
			overrides["ja-no-weak-phrase"] = cfg.jaNoWeakPhrase;
			overrides["no-drop-the-subject"] = false; // not in preset; skip

			for (const [id, rule] of Object.entries(preset.rules as Record<string, unknown>)) {
				const defaultOpt = (preset.rulesConfig as Record<string, unknown>)[id] ?? true;
				const opt = id in overrides ? overrides[id] : defaultOpt;
				if (opt === false) continue;
				rules.push({
					ruleId: `ja-technical-writing/${id}`,
					rule: rule as TextlintRuleModule,
					options: opt as boolean | Record<string, unknown>,
				});
			}
		}

		if (settings.terminology.enabled) {
			const cfg = settings.terminology;
			const extraTerms = cfg.extraTerms.map(([incorrect, correct]) => [incorrect, correct]);
			const options: Record<string, unknown> = {
				skip: cfg.skipCode ? ["Code", "InlineCode"] : [],
			};
			if (extraTerms.length > 0) {
				options["terms"] = extraTerms;
			}
			rules.push({
				ruleId: "terminology",
				rule: terminology.default as TextlintRuleModule,
				options,
			});
		}

		return rules;
	}
}
