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
			} catch (e) {
				console.error("[textlint] lint error:", e);
				return [];
			}

			const diagnostics: Diagnostic[] = [];
			for (const msg of result.messages) {
				const from = Math.min(msg.range[0], text.length);
				// Ensure the range covers at least 1 character so CM6 renders the mark
				const rawTo = msg.fix ? msg.fix.range[1] : msg.range[1];
				const to = Math.min(Math.max(rawTo, from + 1), text.length);

				if (from >= to) continue;

				diagnostics.push({
					from,
					to,
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
