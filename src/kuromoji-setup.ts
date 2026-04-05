import { Notice, requestUrl } from "obsidian";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";

const KUROMOJI_VERSION = "0.1.2";
const DICT_FILES = [
	"base.dat.gz",
	"cc.dat.gz",
	"check.dat.gz",
	"tid_map.dat.gz",
	"tid_pos.dat.gz",
	"tid.dat.gz",
	"unk_char.dat.gz",
	"unk_compat.dat.gz",
	"unk_invoke.dat.gz",
	"unk_map.dat.gz",
	"unk_pos.dat.gz",
	"unk.dat.gz",
];

/**
 * Set KUROMOJIN_DIC_PATH so kuromojin never calls require.resolve("kuromoji").
 * Downloads the dictionary files on first use if they are missing.
 *
 * @returns true if kuromoji is ready to use, false if download failed
 */
export async function setupKuromoji(pluginDir: string): Promise<boolean> {
	const dictDir = join(pluginDir, "dict");

	if (isDictReady(dictDir)) {
		process.env.KUROMOJIN_DIC_PATH = dictDir;
		return true;
	}

	try {
		new Notice("Kuromoji 辞書をダウンロードしています…");
		await downloadDict(dictDir);
		process.env.KUROMOJIN_DIC_PATH = dictDir;
		new Notice("Kuromoji 辞書のダウンロードが完了しました");
		return true;
	} catch (e) {
		console.error("[textlint] kuromoji dict download failed:", e);
		new Notice("Kuromoji 辞書のダウンロードに失敗しました。設定画面から再試行できます。");
		return false;
	}
}

export function isDictReady(dictDir: string): boolean {
	return DICT_FILES.every((f) => existsSync(join(dictDir, f)));
}

export async function downloadDict(dictDir: string): Promise<void> {
	if (!existsSync(dictDir)) {
		mkdirSync(dictDir, { recursive: true });
	}

	for (const file of DICT_FILES) {
		const url = `https://cdn.jsdelivr.net/npm/kuromoji@${KUROMOJI_VERSION}/dict/${file}`;
		const res = await requestUrl({ url });
		writeFileSync(join(dictDir, file), Buffer.from(res.arrayBuffer));
	}
}
