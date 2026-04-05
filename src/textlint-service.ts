import { TextlintKernel } from "@textlint/kernel";
import type { TextlintMessage, TextlintKernelRule } from "@textlint/kernel";
import type { TextlintRuleModule, TextlintPluginCreator } from "@textlint/types";
import type { TextlintPluginSettings } from "./settings";
import defaultTerms from "textlint-rule-terminology/terms.jsonc";

// These packages ship as CommonJS without proper ESM types, so we use typed imports.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const markdownPlugin = require("@textlint/textlint-plugin-markdown") as {
	default: TextlintPluginCreator;
};
// eslint-disable-next-line @typescript-eslint/no-require-imports
const preset = require("textlint-rule-preset-ja-technical-writing") as {
	rules: Record<string, TextlintRuleModule>;
	rulesConfig: Record<string, boolean | Record<string, unknown>>;
};
// eslint-disable-next-line @typescript-eslint/no-require-imports
const terminology = require("textlint-rule-terminology") as {
	default: TextlintRuleModule;
};

/**
 * Rules that internally call require.resolve("kuromoji") for morphological analysis.
 * require.resolve is unavailable in Obsidian's plugin environment, so these are skipped.
 */
const KUROMOJI_RULES = new Set([
	"max-ten",
	"no-double-negative-ja",
	"no-doubled-conjunctive-particle-ga",
	"no-doubled-conjunction",
	"no-doubled-joshi",
	"no-dropping-the-ra",
	"ja-no-abusage",
	"ja-no-redundant-expression",
	"ja-no-successive-word",
	"ja-no-weak-phrase",
]);

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

	private buildRules(settings: TextlintPluginSettings): TextlintKernelRule[] {
		const rules: TextlintKernelRule[] = [];

		if (settings.jaTechnicalWriting.enabled) {
			const cfg = settings.jaTechnicalWriting;
			const overrides: Record<string, boolean | Record<string, unknown>> = {};

			overrides["max-kanji-continuous-len"] =
				cfg.maxKanjiContinuousLen === 0 ? false : { max: cfg.maxKanjiContinuousLen };
			overrides["no-mix-dearu-desumasu"] = cfg.noMixDearuDesumasu
				? (preset.rulesConfig["no-mix-dearu-desumasu"] ?? true)
				: false;
			overrides["ja-no-mixed-period"] = cfg.jaNomixedPeriod
				? (preset.rulesConfig["ja-no-mixed-period"] ?? true)
				: false;

			for (const [id, rule] of Object.entries(preset.rules)) {
				// Skip rules that need kuromoji (require.resolve unavailable in Obsidian)
				if (KUROMOJI_RULES.has(id)) continue;

				const defaultOpt = preset.rulesConfig[id] ?? true;
				const opt = id in overrides ? overrides[id] : defaultOpt;
				if (opt === false) continue;
				rules.push({
					ruleId: `ja-technical-writing/${id}`,
					rule,
					options: opt as boolean | Record<string, unknown>,
				});
			}
		}

		if (settings.terminology.enabled) {
			const cfg = settings.terminology;
			// Bundle defaultTerms inline to avoid createRequire(import.meta.url) at runtime
			const terms: (string | [string, string])[] = [
				...cfg.extraTerms,
				...defaultTerms,
			];
			const options: Record<string, unknown> = {
				defaultTerms: false,
				terms,
				skip: cfg.skipCode ? ["Code", "InlineCode"] : [],
			};
			rules.push({
				ruleId: "terminology",
				rule: terminology.default,
				options,
			});
		}

		return rules;
	}
}
