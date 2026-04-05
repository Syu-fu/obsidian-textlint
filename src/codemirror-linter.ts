import { linter, type Diagnostic } from "@codemirror/lint";
import type { Extension } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import type { TextlintService } from "./textlint-service";
import type { TextlintPluginSettings } from "./settings";

type SettingsGetter = () => TextlintPluginSettings;

/**
 * Build a CodeMirror Extension that underlines textlint errors with wavy lines.
 * `delay` controls how long (ms) to wait after the last keystroke before linting.
 */
export function buildTextlintExtension(
	service: TextlintService,
	getSettings: SettingsGetter,
	delay = 800
): Extension {
	return linter(
		async (view: EditorView) => {
			const text = view.state.doc.toString();
			if (!text.trim()) return [];

			let result;
			try {
				result = await service.lint(text, getSettings());
			} catch {
				return [];
			}

			const diagnostics: Diagnostic[] = [];
			for (const msg of result.messages) {
				const from = msg.index;
				// end index: use fix range if available, otherwise +1 char
				const to = msg.fix ? msg.fix.range[1] : from + 1;
				const clampedTo = Math.min(to, text.length);
				const clampedFrom = Math.min(from, clampedTo);

				diagnostics.push({
					from: clampedFrom,
					to: clampedTo,
					severity: msg.severity === 2 ? "error" : "warning",
					message: `[${msg.ruleId}] ${msg.message}`,
					source: "textlint",
				});
			}
			return diagnostics;
		},
		{ delay }
	);
}
